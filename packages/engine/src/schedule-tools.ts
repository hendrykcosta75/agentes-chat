import { and, eq, inArray, isNull, or, schema, sql } from "@agenteschat/db";
import { type AgentActionParams, recordAgentActions } from "./agent-actions";
import { routineRow, routineSnapshot } from "./agent-undo";
import { agentsByHandle, currentHandles, getAgentCached } from "./agents";
import { decidesAgentApprovals } from "./approval-rules";
import { cancelAheadApproval, cancelableAhead } from "./approvals";
import { canTalkTo, speakerFor } from "./audience";
import { runAuthorityById } from "./authority";
import { cardPlace } from "./consultations";
import { getChannelCached } from "./context";
import { schedulesOf } from "./context/summaries";
import { ForbiddenError } from "./errors";
import { cutText, stringsOf } from "./format";
import { watchesFor } from "./mail/watches";
import { isRightHand } from "./right-hand";
import { ROUTINE_REPORT, routineReportOf } from "./routine-brief";
import { HOOK_METHODS, routineHookKeys } from "./routine-hooks";
import { vaultAction, vaultKeyOf } from "./routine-keys";
import {
  cancelReminder,
  createReminder,
  createRoutine,
  deleteRoutine,
  EVENT_WEBHOOK,
  listOrgRoutines,
  listReminders,
  missingEventSource,
  ROUTINE_EVENTS,
  type RoutineDeps,
  type RoutineEvent,
  type RoutineRunView,
  type RoutineTarget,
  type RoutineTrigger,
  type RoutineTriggerInput,
  type RoutineView,
  routineTimezone,
  runRoutineNow,
  updateRoutine,
} from "./routines";
import { timezoneName } from "./rrule";
import { replyThreadOf } from "./runs";
import { describeWhen, parseWhen } from "./schedule";
import { localDateTimeOf } from "./schedule-reader";
import { noAgentText } from "./team";
import { RUN_APPROVED_ACTION } from "./tools/gateway";
import { approvalsLevelOf, WHY_MAX_CHARS, WHY_MIN_CHARS } from "./tools/run-policy";
import { hasScope } from "./tools/scopes";
import type { AheadRequest, ToolContext, ToolDefinition, ToolOutput, ToolSource } from "./tools/types";

export const SCHEDULE_SCOPE = "schedule:write";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const failed = (error: unknown): ToolOutput => ({
  content: `Failed: ${error instanceof Error ? error.message : String(error)}`,
  isError: true,
});

/**
 * The person this run acts for (authority.ts): reminders and routines are
 * theirs, in their time zone. Null when nobody is behind the run (a routine's
 * work, the run its report woke, an agent's own message): then nothing is
 * scheduled or changed (a routine's run doesn't even list these tools).
 */
async function requesterOf(ctx: ToolContext) {
  const authority = await runAuthorityById(ctx.db, ctx.orgId, ctx.runId);
  return authority.kind === "person" ? authority.personId : null;
}

/**
 * This conversation: the thread in a channel, or the DM itself (flat). A run
 * answering a consultation lives in the agents' private DM, which no person
 * reads: there it is the conversation where the person asked.
 */
async function conversationOf(ctx: ToolContext) {
  const place = (await cardPlace(ctx)) ?? { channelId: ctx.channelId, threadId: replyThreadOf(ctx) };
  const home = await getChannelCached(ctx.db, ctx.orgId, place.channelId);
  return { channelId: place.channelId, threadId: home?.kind === "dm" ? null : place.threadId };
}

/**
 * A channel by name for a routine to report in: one the person who asked is
 * in (not in it = not found, so private channels stay hidden). Being in it is
 * the agent's part, checked when the routine is saved.
 */
async function channelTarget(ctx: ToolContext, requester: string, raw: string) {
  const name = raw.trim().replace(/^#/, "").toLowerCase();
  const { channels, channelMembers } = schema;
  const [channel] = await ctx.db
    .select({ id: channels.id, name: channels.name })
    .from(channels)
    .innerJoin(channelMembers, eq(channelMembers.channelId, channels.id))
    .where(
      and(
        eq(channels.orgId, ctx.orgId),
        eq(channels.name, name),
        eq(channels.kind, "channel"),
        isNull(channels.archivedAt),
        eq(channelMembers.userId, requester),
      ),
    );
  if (!channel) throw new Error(`No channel #${name} that the person who asked is in.`);
  return { target: { type: "channel", channelId: channel.id } satisfies RoutineTarget, name: channel.name };
}

/** Where a routine reports, for the agent to tell the person. */
async function whereOf(ctx: ToolContext, r: RoutineView) {
  const t = r.target;
  if (t.type === "channel" || t.type === "conversation") {
    if (t.channelId === ctx.channelId) return "this conversation";
    const channel = await getChannelCached(ctx.db, ctx.orgId, t.channelId);
    return channel?.kind === "channel" ? `#${channel.name}` : "a direct message";
  }
  return t.type === "artifact" ? "a file in the Drive" : "a direct message";
}

const sameText = (a: string, b: string) =>
  a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The agent's active routine in this conversation (or, `dmWith`, in a direct message with that person) with the
 * same instructions, if any: asking twice (an interrupted run asked again, a repeated message) must not schedule
 * the same job twice.
 */
async function sameRoutine(
  ctx: ToolContext,
  agentId: string,
  conv: { channelId: string; threadId: string | null },
  prompt: string,
  dmWith: string | null = null,
) {
  const { routines } = schema;
  const rows = await ctx.db
    .select({
      id: routines.id,
      name: routines.name,
      prompt: routines.prompt,
      target: routines.target,
      nextRunAt: routines.nextRunAt,
      timezone: routines.timezone,
    })
    .from(routines)
    .where(
      and(
        eq(routines.orgId, ctx.orgId),
        eq(routines.agentId, agentId),
        eq(routines.active, true),
        isNull(routines.deletedAt),
        dmWith
          ? and(sql`${routines.target}->>'type' = 'dm'`, eq(routines.createdByUserId, dmWith))
          : sql`${routines.target}->>'channelId' = ${conv.channelId}`,
      ),
    );
  return (
    rows.find(
      (r) =>
        (dmWith || ((r.target as { threadId?: string | null }).threadId ?? null) === conv.threadId) &&
        sameText(r.prompt, prompt),
    ) ?? null
  );
}

const noRequester: ToolOutput = {
  content:
    "Only a person's request can schedule or change routines and reminders, and no person is behind this run (a routine's report or an agent's own message started it). To come back to this work yourself within a day, use follow_up.",
  isError: true,
};

/**
 * Events a routine can wait for instead of polling (mail comes through an email trigger, it needs a mailbox; a
 * webhook call through a webhook trigger, it needs an address).
 */
const TOOL_EVENTS: readonly RoutineEvent[] = ROUTINE_EVENTS.filter(
  (e) => e !== "email.received" && e !== "webhook.received",
);

/** What each event means, for the model and its answers (English). */
const EVENT_WORDS: Record<RoutineEvent, string> = {
  "sentry.issue_created": "a new error comes in from Sentry",
  "github.pr_opened": "a pull request is opened on GitHub",
  "issue.created": "a task is created here",
  "deploy.succeeded": "a deploy succeeds",
  "email.received": "new mail arrives",
  "webhook.received": "its webhook address is called",
};

/** The zone a routine's times are read in (schedules and one-offs have their own). */
const zoneOf = (t: RoutineTrigger) => (t.type === "schedule" || t.type === "once" ? t.timezone : "UTC");

/** When a routine runs, in English for the model ("Every week, Mon, at 09:00 (Brasília time)", "when …"). */
function whenText(t: RoutineTrigger) {
  if (t.type === "schedule") {
    const zone = `(${timezoneName(t.timezone)})`;
    return t.description.includes(zone) ? t.description : `${t.description} ${zone}`;
  }
  if (t.type === "once") return `once, ${t.description}`;
  if (t.type === "event") return `when ${EVENT_WORDS[t.event]}`;
  // Never the address itself: it is a secret, shown only in Routines.
  if (t.type === "webhook")
    return `when ${EVENT_WORDS["webhook.received"]} with ${t.methods.join(" or ")}${t.signed ? " (signed calls only)" : ""}`;
  const from = t.filter.from?.length ? ` from ${t.filter.from.join(", ")}` : "";
  const subject = t.filter.subject ? ` with "${t.filter.subject}" in the subject` : "";
  if (t.type === "connector") return `when an email arrives in a MillionSend inbox${from}${subject}`;
  return `when new mail arrives in ${t.folder}${from}${subject}`;
}

/**
 * When a routine runs, for its receipt: the rule itself (the app words it in
 * the person's language), the moment, the event or the mailbox folder; never
 * the English description.
 */
function whenParams(t: RoutineTrigger): AgentActionParams {
  switch (t.type) {
    case "schedule":
      return {
        trigger: "schedule",
        rule: t.rule ? { ...t.rule } : null,
        cron: t.rule ? null : t.cron,
        timezone: t.timezone,
      };
    case "once":
      return { trigger: "once", at: t.at, timezone: t.timezone };
    case "event":
      return { trigger: "event", event: t.event };
    case "email":
      return { trigger: "email", folder: t.folder };
    case "connector":
      return { trigger: "connector", event: t.event };
    case "webhook":
      return { trigger: "webhook", methods: [...t.methods] };
  }
}

const reportText = (r: RoutineView) =>
  r.report === "always" ? "reports every run" : "reports only when there is something new";

/** What a routine is doing now, in words for the model. */
function stateText(r: RoutineView) {
  switch (r.state) {
    case "paused":
      return r.pausedReason ? `paused: ${r.pausedReason}` : "paused";
    case "running":
      return "running now";
    case "waiting_computer":
      return `waiting for the computer ${r.waitingFor?.machineName ?? ""}`.trim();
    case "waiting_person":
      return "waiting for a person (an approval or an answer)";
    case "failing":
      return `failing (${r.failuresInRow} in a row)`;
    case "needs_webhook":
      return `can't run yet: no ${hookName(r)} webhook sends its event here`;
    default:
      return "active";
  }
}

/** The service whose webhook a routine waits for (`EVENT_WEBHOOK`), as people name it. */
const hookName = (r: RoutineView) =>
  r.trigger.type === "event" && EVENT_WEBHOOK[r.trigger.event] === "sentry" ? "Sentry" : "GitHub";

/**
 * An agent's routine on an event nothing in this workspace can send is refused, with the setup step (I7): a routine
 * that can never fire would look set up to the person. Null when something can fire it.
 */
async function neverFires(ctx: ToolContext, trigger: RoutineTriggerInput, what: string): Promise<ToolOutput | null> {
  const missing = trigger.type === "event" ? await missingEventSource(ctx.db, ctx.orgId, trigger.event) : null;
  if (!missing) return null;
  const name = missing === "sentry" ? "Sentry" : "GitHub";
  return {
    content: `${what}: nothing would ever start it. No ${name} webhook sends this workspace its events yet. Tell the person what it needs: someone who manages connectors picks the ${name} event in Rotinas › Nova rotina and follows the steps shown there. If they'd rather not wait, offer a schedule that checks instead.`,
    isError: true,
  };
}

/** What a routine that can't run yet needs (state `needs_webhook`), for the agent to tell the person; else "". */
function needsText(r: RoutineView) {
  if (r.state !== "needs_webhook") return "";
  const name = hookName(r);
  return ` It can't run yet: no ${name} webhook sends this workspace its events, so nothing starts it. Tell the person what it needs: someone who manages connectors opens this routine in Rotinas and follows the ${name} webhook steps shown there. Until then it never runs; if they'd rather not wait, offer a schedule that checks instead.`;
}

/** One run, coded: "2026-10-20 09:00 failed (provider_error)". */
function runText(run: RoutineRunView, zone: string) {
  const at = localDateTimeOf(new Date(run.at), zone).replace("T", " ");
  const by = run.codeParams?.by ? ` by ${run.codeParams.by}` : "";
  return `${at} ${run.status}${run.code ? ` (${run.code}${by})` : ""}`;
}

/** How many of a routine's last runs `list_routines` shows. */
const LISTED_RUNS = 5;

function routineLine(r: RoutineView, where: string, handle: string | null, prompt: string | null, full = false) {
  const zone = zoneOf(r.trigger);
  const next = r.nextRunAt ? describeWhen(new Date(r.nextRunAt), zone) : "none";
  const text =
    prompt === null
      ? "(instructions private: it reports in a conversation you and the person aren't in)"
      : full
        ? prompt
        : cutText(prompt.replace(/\s+/g, " "), 300);
  const runs = r.recentRuns.slice(0, LISTED_RUNS).map((run) => runText(run, zone));
  return [
    `${r.id} — ${handle ? `@${handle} ` : ""}"${r.name}" (${stateText(r)}): ${whenText(r.trigger)}; next: ${next}; reports in ${where}; ${reportText(r)}`,
    `  ${text}`,
    ...(runs.length > 0 ? [`  last runs: ${runs.join("; ")}`] : []),
  ].join("\n");
}

/**
 * Reminders are a person's own: never listed as routines. A widget's routine is its widget's (ADR 0135 §4):
 * list_dashboards shows it there.
 */
const isRoutine = (r: RoutineView) =>
  r.trigger.type !== "once" && !(r.target.type === "conversation" && r.target.reminder) && r.target.type !== "widget";

/**
 * Conversations whose routines' instructions a run nobody is behind may see: public
 * channels, and channels and DMs where this agent is a member. Everything else
 * shows the routine without its instructions.
 */
async function readableChannels(ctx: ToolContext, channelIds: string[]) {
  if (channelIds.length === 0) return new Set<string>();
  const { channels, channelMembers } = schema;
  const rows = await ctx.db
    .selectDistinct({ id: channels.id })
    .from(channels)
    .leftJoin(channelMembers, and(eq(channelMembers.channelId, channels.id), eq(channelMembers.agentId, ctx.agentId)))
    .where(
      and(
        eq(channels.orgId, ctx.orgId),
        inArray(channels.id, channelIds),
        or(
          and(eq(channels.kind, "channel"), eq(channels.visibility, "public")),
          sql`${channelMembers.channelId} is not null`,
        ),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Where a person connects a mailbox (agents can't), in the apps' words and the Portuguese they show. */
const CONNECT_HOW =
  "a person who manages connectors does it. On the web or the desktop app: Settings › Connectors and MCPs › Add connector › Email, then the mailbox (Gmail, Outlook, iCloud or another), and its step Who can use it lets you read it (in Portuguese, Configurações › Conectores e MCPs › Adicionar conector › Email, then Quem pode usar). Tell the person exactly this.";
/** Where a person lets an agent read a mailbox that is connected. */
const GIVE_HOW =
  "a person who manages agents must let you. On the web or the desktop app: Settings › Connectors and MCPs › Who uses it, on the mailbox's row (in Portuguese, Configurações › Conectores e MCPs › Quem usa). On the phone app: You › Connectors and MCPs, then the mailbox (in Portuguese, Você › Conectores e MCPs). Tell the person exactly this.";

/** No mailbox in the workspace: where a person connects one. */
export const NO_MAILBOX_TEXT = `You can't read any mailbox yet, and you can't connect one yourself: ${CONNECT_HOW}`;
/** Mailboxes, none of them this agent's to read: where a person lets it. */
export const MAILBOX_NOT_GIVEN_TEXT = `You can't read any of this workspace's mailboxes: ${GIVE_HOW}`;

/**
 * The mailbox an email trigger watches: one this agent may read, by its address or label; left out, the only one
 * it may read. A named one that isn't connected is told where a
 * person connects it, one that is but isn't this agent's where a person lets it read it.
 */
async function mailboxOf(ctx: ToolContext, raw: string) {
  const { mailAccounts } = schema;
  const accounts = await ctx.db
    .select({
      id: mailAccounts.id,
      address: mailAccounts.address,
      label: mailAccounts.label,
      createdByUserId: mailAccounts.createdByUserId,
    })
    .from(mailAccounts)
    .where(
      and(eq(mailAccounts.orgId, ctx.orgId), isNull(mailAccounts.revokedAt), sql`${mailAccounts.status} <> 'pending'`),
    );
  const readable: typeof accounts = [];
  // The right hand watches a mailbox only for who connected it (`watchesFor`), and names no one else's to who asks.
  const creator = await requesterOf(ctx);
  for (const a of accounts) {
    if (
      (await hasScope(ctx.db, ctx.orgId, ctx.agentId, a.id, "mail:read")) &&
      (await watchesFor(ctx.db, ctx.orgId, ctx.agentId, a, creator))
    )
      readable.push(a);
  }
  const name = raw.trim();
  const want = name.toLowerCase();
  const named = (a: (typeof accounts)[number]) => a.address.toLowerCase() === want || a.label.toLowerCase() === want;
  if (want && !accounts.some(named)) {
    throw new Error(`"${name}" isn't a mailbox connected here, and you can't connect it yourself: ${CONNECT_HOW}`);
  }
  const found = want ? readable.filter(named) : readable;
  if (found.length === 1 && found[0]) return found[0].id;
  if (want && found.length === 0) throw new Error(`You can't read "${name}" yet: ${GIVE_HOW}`);
  if (found.length === 0) throw new Error(accounts.length === 0 ? NO_MAILBOX_TEXT : MAILBOX_NOT_GIVEN_TEXT);
  throw new Error(`Say which mailbox to watch (mailbox): ${found.map((a) => a.address).join(", ")}.`);
}

/** A tool's `trigger` (an email filter, a webhook or an event) as the routine's trigger. */
async function triggerOf(ctx: ToolContext, raw: Record<string, unknown>): Promise<RoutineTriggerInput> {
  if (raw.type === "webhook") {
    const methods = Array.isArray(raw.methods) ? raw.methods.filter((m): m is string => typeof m === "string") : [];
    return { type: "webhook", ...(methods.length > 0 ? { methods } : {}) };
  }
  if (raw.type === "email") {
    const from = Array.isArray(raw.from) ? raw.from.filter((v): v is string => typeof v === "string") : [];
    return {
      type: "email",
      accountId: await mailboxOf(ctx, str(raw.mailbox)),
      ...(str(raw.folder).trim() ? { folder: str(raw.folder).trim() } : {}),
      filter: {
        ...(from.length > 0 ? { from } : {}),
        ...(str(raw.subject).trim() ? { subject: str(raw.subject).trim() } : {}),
        ...(str(raw.text).trim() ? { text: str(raw.text).trim() } : {}),
      },
    };
  }
  const event = str(raw.event) as RoutineEvent;
  if (!TOOL_EVENTS.includes(event)) throw new Error(`Say which event (event): one of ${TOOL_EVENTS.join(", ")}.`);
  return { type: "event", event };
}

/**
 * One of this agent's routines (by id), or why not. `anyAgent`: another agent's too (changing it is checked against
 * the person who asked, as in the app).
 */
async function ownRoutine(ctx: ToolContext, id: string, anyAgent = false) {
  const row = await routineRow(ctx.db, ctx.orgId, id);
  if (!row || row.deletedAt) return { row: null, error: `You have no routine ${id}. Use list_routines.` };
  // A widget's routine follows its widget (ADR 0135 §4): people change it there; its agent changes nothing of it.
  if ((row.target as { type?: unknown }).type === "widget") {
    return {
      row: null,
      error: `Routine ${id} keeps a widget up to date: change it from its widget (its schedule, instructions or alert), not as a routine. Tell the person to open the widget on its dashboard.`,
    };
  }
  if (row.agentId !== ctx.agentId && !anyAgent) {
    return {
      row: null,
      error: `Routine ${id} is another agent's: only that agent changes it, when a person asks it. Don't ask it to on the person's behalf if the person already asked it directly.`,
    };
  }
  return { row, error: "" };
}

/**
 * The agent that does a routine: the one named in `agent` (a handle) when the person wants that agent to do the
 * work, else this one. Null with the reason when no such agent is here.
 */
async function performerOf(ctx: ToolContext, raw: unknown): Promise<{ id: string; handle: string } | ToolOutput> {
  const written = str(raw).trim();
  if (!written) return { id: ctx.agentId, handle: "" };
  const found = await agentsByHandle(ctx.db, ctx.orgId, [written]);
  const row = found.rowOf(written);
  if (!row) return { content: await noAgentText(ctx, found.handles), isError: true };
  return { id: row.id, handle: row.id === ctx.agentId ? "" : row.handle };
}

/** Whether this agent is in that conversation (a routine reports only where its agent is). */
async function inConversation(ctx: ToolContext, agentId: string, channelId: string) {
  const { channelMembers } = schema;
  const [row] = await ctx.db
    .select({ id: channelMembers.id })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), eq(channelMembers.agentId, agentId)))
    .limit(1);
  return Boolean(row);
}

/** The refusals that mean the person doesn't manage the agent's routines (others, like taking it over first, say their own). */
const notManager = (error: unknown) =>
  error instanceof ForbiddenError && (error.code === "forbidden" || error.code === "routine.editor_only");

/** Why the person may not set up or change another agent's routine, and what to offer instead. */
const notTheirs = (handle: string, error: unknown): ToolOutput => ({
  content: `Not done: the person who asked can't manage @${handle}'s routines (${error instanceof Error ? error.message : String(error)}). Only an admin, @${handle}'s owner or, for an existing routine, who created it can. Tell the person that plainly and offer another way: a routine on you that asks @${handle} each run, or asking an admin or @${handle}'s owner to set it up.`,
  isError: true,
});

export const SCHEDULE_INPUT = {
  type: "string",
  minLength: 1,
  maxLength: 300,
  description:
    'When it runs, in the workspace\'s time zone: words in any language ("dias úteis às 9h") or a 5-field cron expression ("0 9 * * 1-5"). Cron always works.',
};

const TRIGGER_SCHEMA = {
  type: "object",
  description:
    'Instead of a schedule: run when something happens. `type: "email"` with `mailbox` (its address; left out, the only one you can read), `folder` (default the inbox) and optional filters `from` (addresses or @domains), `subject` and `text` (words). `type: "webhook"`: the routine gets an address of its own that another service calls to start it, with what it sends as the run\'s data; `methods` the HTTP methods it answers (default POST; with GET the query string is the data). `type: "event"` with `event`.',
  properties: {
    type: { type: "string", enum: ["email", "webhook", "event"] },
    event: {
      type: "string",
      enum: TOOL_EVENTS,
      description: TOOL_EVENTS.map((e) => `${e}: ${EVENT_WORDS[e]}`).join("; "),
    },
    mailbox: { type: "string", maxLength: 320 },
    folder: { type: "string", maxLength: 300 },
    from: { type: "array", items: { type: "string", maxLength: 320 }, maxItems: 50 },
    subject: { type: "string", maxLength: 200 },
    text: { type: "string", maxLength: 200 },
    methods: {
      type: "array",
      items: { type: "string", enum: HOOK_METHODS },
      minItems: 1,
      maxItems: HOOK_METHODS.length,
    },
  },
  required: ["type"],
  additionalProperties: false,
};
export const REPORT_SCHEMA = {
  type: "string",
  enum: ROUTINE_REPORT,
  description: '"when_new" (default): only when there is something new; "always": a report every run.',
};

/** `own_actions` of `create_routine` and `update_routine`. */
const OWN_ACTIONS_SCHEMA = {
  type: "array",
  maxItems: 20,
  items: { type: "string", minLength: 1, maxLength: 128 },
  description:
    "Connected-app actions the routine's job needs, which every run then does without asking a person: the exact tool names you call (for Composio's multi-execute tool, each action's slug, like SLACK_SEND_MESSAGE). Only what the person asked the routine to do (the Slack post, the email they want sent): its other ordinary writes (update a row, a deal, an issue) already run without asking, and its other sends, deletes, payments and invites ask. Merge, deploy, rollback and the like can't be listed. Only the agent's owner or someone who approves its actions can set this. On update it replaces the list; [] makes every action ask again.",
};

/** `keys` of `create_routine` and `update_routine`: Vault keys its runs' commands may use (`vault:NAME` own actions). */
const KEYS_SCHEMA = {
  type: "array",
  maxItems: 10,
  items: { type: "string", minLength: 1, maxLength: 64 },
  description:
    "Vault keys the routine's commands use (`run_code`'s `keys`), by variable name as vault_list shows them: only the ones its job needs and the person asked for. Any other key asks a person first. Only the agent's owner or someone who approves its actions can set this. On update it replaces the list; [] makes every key ask again.",
};

/** A routine's own actions as sent: connected-app actions (`own_actions`) and Vault keys (`keys`, as `vault:NAME`). */
function routineOwnActions(input: Record<string, unknown>, current: readonly string[] = []): string[] {
  const apps = Array.isArray(input.own_actions)
    ? stringsOf(input.own_actions).filter((a) => !vaultKeyOf(a))
    : current.filter((a) => !vaultKeyOf(a));
  const keys = Array.isArray(input.keys)
    ? stringsOf(input.keys).map((k) => vaultAction(k.trim()))
    : current.filter((a) => vaultKeyOf(a));
  return [...apps, ...keys];
}

/** What the routine does without asking, for the agent to tell the person: by its agent's approvals level (ADR 0173). */
async function ownActionsText(ctx: ToolContext, r: RoutineView) {
  const level = await approvalsLevelOf(ctx.db, ctx.orgId, r.agentId);
  if (level === "never") {
    return " Its agent is set to never ask: every run does what its instructions say, in connected apps too, with no approval. Tell the person exactly this.";
  }
  if (level === "always") return " Its agent is set to always ask: every change a run makes asks a person first.";
  const apps = r.ownActions.filter((a) => !vaultKeyOf(a));
  const keys = r.ownActions.flatMap((a) => vaultKeyOf(a) ?? []);
  const keysText =
    keys.length > 0
      ? ` Its commands may use these Vault keys: ${keys.join(", ")}; any other key asks a person first.`
      : "";
  const agent = await getAgentCached(ctx.db, ctx.orgId, r.agentId);
  const writes =
    r.createdByUserId !== null &&
    (await decidesAgentApprovals(ctx.db, ctx.orgId, r.createdByUserId, agent?.ownerUserId ?? null));
  const rest = writes
    ? "Its other changes in connected apps run without asking too, except a send, a delete, a payment or an invite, which ask a person first unless a person approved its kind for good."
    : "Any other action in a connected app asks a person first, unless a person approved its kind for good.";
  if (apps.length > 0) {
    return ` On its own, without asking, every run may: ${apps.join(", ")}. ${rest}${keysText} Tell the person exactly this.`;
  }
  return writes
    ? ` Its changes in connected apps run without asking, except a send, a delete, a payment or an invite, which ask a person first.${keysText} Tell the person exactly this.`
    : ` Every action in a connected app asks a person first.${keysText}`;
}

/**
 * A webhook routine's address is a secret the agent never sees: who manages the routine copies it from the line the
 * chat shows under the reply ("Copiar endereço do webhook") or from the routine's page.
 */
const WEBHOOK_HINT =
  " Its webhook address is secret: never write an address in the chat. Tell the person to copy it with the button on the routine's line under your reply (only who manages the routine sees it), or from the routine in Routines, where they can also turn on signed calls.";

/** The routine in one line for the agent to confirm. */
const summaryOf = async (ctx: ToolContext, r: RoutineView) => {
  const next = r.nextRunAt ? `; next: ${describeWhen(new Date(r.nextRunAt), zoneOf(r.trigger))}` : "";
  return `"${r.name}" (${r.active ? "active" : "paused"}): ${whenText(r.trigger)}${next}; reports in ${await whereOf(ctx, r)}; ${reportText(r)}`;
};

/**
 * Scheduling from the chat (scope `schedule:write`, on by default):
 * `schedule_reminder`, `create_routine`, `list_routines`, `update_routine`,
 * `delete_routine`, `run_routine_now`, `list_reminders`, `cancel_reminder`.
 * Everything belongs to the person who asked, in their time zone, in this
 * conversation; reminders are one-off routines, so they show in Routines.
 * A routine is the agent's background work (ADR 0053): it speaks only by
 * handing its findings off to the conversation it reports to.
 */
export function createScheduleToolSource(deps: Omit<RoutineDeps, "db">): ToolSource {
  const routineDeps = (ctx: ToolContext): RoutineDeps => ({ ...deps, db: ctx.db });
  const tools: ToolDefinition[] = [
    {
      name: "schedule_reminder",
      description:
        'Schedule a one-off reminder in this conversation: at that time you post "Reminder: …" mentioning the person (the app shows it as a reminder in their language). `when` is what the person said, in their words and language ("amanhã às 9h", "tomorrow at 9am", "in 2 hours"), read in their time zone, or ISO 8601. Write `message` in the person\'s language. Set ask_agent when, at that time, you should do something (not just remind); for a connected app\'s action then (a post, a message to send), use schedule_action instead, so the person approves it now and not at that time. If the time is ambiguous, ask with ask_user first.',
      scope: SCHEDULE_SCOPE,
      inputSchema: {
        type: "object",
        properties: {
          when: { type: "string", minLength: 1, maxLength: 120 },
          message: { type: "string", minLength: 1, maxLength: 2000 },
          for: { type: "string", maxLength: 64, description: "@handle of someone else in this conversation" },
          ask_agent: { type: "boolean" },
        },
        required: ["when", "message"],
        additionalProperties: false,
      },
      async execute(input, ctx) {
        try {
          const requester = await requesterOf(ctx);
          if (!requester) return noRequester;
          const timezone = await routineTimezone(ctx.db, requester, ctx.orgId);
          const reader = deps.context ? schedulesOf(deps.context) : null;
          const when = await parseWhen(reader, { orgId: ctx.orgId, text: str(input.when), timezone });
          if (!when.ok) {
            return { content: `${when.error} Ask the person (ask_user) for a clear date and time.`, isError: true };
          }
          let forUserId: string | undefined;
          const handle = str(input.for).replace(/^@/, "").trim().toLowerCase();
          if (handle) {
            const [member] = await ctx.db
              .select({ userId: schema.organizationMembers.userId })
              .from(schema.organizationMembers)
              .where(
                and(eq(schema.organizationMembers.orgId, ctx.orgId), eq(schema.organizationMembers.handle, handle)),
              );
            if (!member) return { content: `No one is @${handle} here.`, isError: true };
            forUserId = member.userId;
          }
          const conv = await conversationOf(ctx);
          const r = await createReminder(routineDeps(ctx), requester, ctx.orgId, {
            agentId: ctx.agentId,
            ...conv,
            at: when.at,
            timezone: when.timezone,
            description: when.description,
            message: str(input.message),
            forUserId,
            askAgent: input.ask_agent === true,
          });
          return {
            content: `Scheduled reminder ${r.id} for ${when.description}. Confirm it to the person with that day, date, time and time zone, in their language; call it a reminder and say it shows in the calendar.`,
            data: { reminder: { id: r.id, at: r.at } },
          };
        } catch (error) {
          return failed(error);
        }
      },
    },
    {
      name: "create_routine",
      description:
        'Create a routine: work you do on your own, in the background, on a schedule ("toda segunda às 9h", "dias úteis às 18h", "every hour") or when something happens (`trigger`). Each run gets `prompt` as its instructions and nobody watches it: it reports by handing its findings off to the conversation it reports to, where you then tell the people. It can do what you can (search the web, use your computer and browser, tell or ask other agents, post where the person can); in connected apps its ordinary writes run without asking, and a send, a delete, a payment or an invite asks a person first, except the ones its job needs that you list in `own_actions` (the person asked for them, so setting it up approves them). That is this conversation by default; set `channel` (its name, with or without #) when the person wants it in a channel ("manda no #general"). `report` says when it speaks. Choose who performs it: when the person wants a specific other agent to do the work ("faz o @theo postar…", "have @theo send…"), set `agent` to that agent, so the routine is its own work, never yours relaying the ask each run. When the person says "when a new email arrives" or "when a new error comes in", use `trigger` (an email filter or an event), never a schedule that checks again and again; "when another service calls it" or "by webhook" is a webhook trigger. A routine runs at most every 15 minutes. Only admins or your owner can create routines; the person sees it with Undo.',
      scope: SCHEDULE_SCOPE,
      inputSchema: {
        type: "object",
        properties: {
          schedule: SCHEDULE_INPUT,
          trigger: TRIGGER_SCHEMA,
          prompt: { type: "string", minLength: 1, maxLength: 10_000 },
          title: { type: "string", maxLength: 120 },
          channel: { type: "string", maxLength: 100, description: "Report in this channel instead of here" },
          report: REPORT_SCHEMA,
          agent: {
            type: "string",
            maxLength: 40,
            description:
              "The agent that does it (its handle, e.g. @theo) when it isn't you; it reports in a direct message with the person when it isn't in this conversation and no `channel` is set",
          },
          own_actions: OWN_ACTIONS_SCHEMA,
          keys: KEYS_SCHEMA,
        },
        required: ["prompt"],
        additionalProperties: false,
      },
      async execute(input, ctx) {
        try {
          const requester = await requesterOf(ctx);
          if (!requester) return noRequester;
          const hasSchedule = Boolean(str(input.schedule).trim());
          const rawTrigger = input.trigger as Record<string, unknown> | undefined;
          if (hasSchedule === Boolean(rawTrigger)) {
            return {
              content: "Give either `schedule` (when it runs) or `trigger` (what starts it), not both.",
              isError: true,
            };
          }
          const trigger: RoutineTriggerInput = rawTrigger
            ? await triggerOf(ctx, rawTrigger)
            : { type: "schedule", phrase: str(input.schedule) };
          const never = await neverFires(ctx, trigger, "Not created");
          if (never) return never;
          const performer = await performerOf(ctx, input.agent);
          if ("content" in performer) return performer;
          const channel = str(input.channel).trim() ? await channelTarget(ctx, requester, str(input.channel)) : null;
          const conv =
            channel && channel.target.channelId !== ctx.channelId
              ? { channelId: channel.target.channelId, threadId: null }
              : await conversationOf(ctx);
          // Another agent that isn't in this conversation reports to the person directly.
          const direct = !channel && performer.handle && !(await inConversation(ctx, performer.id, conv.channelId));
          const existing = await sameRoutine(ctx, performer.id, conv, str(input.prompt), direct ? requester : null);
          if (existing) {
            const next = existing.nextRunAt ? describeWhen(existing.nextRunAt, existing.timezone ?? "UTC") : "";
            return {
              content: `Routine ${existing.id} "${existing.name}" already exists in this conversation with these instructions${next ? ` (next: ${next})` : ""}. Don't create another: tell the person it's already set up. To change it, use update_routine or they edit it in Routines.`,
              data: { routine: { id: existing.id }, existing: true },
            };
          }
          const routine = await createRoutine(routineDeps(ctx), requester, ctx.orgId, {
            name: str(input.title) || undefined,
            agentId: performer.id,
            prompt: str(input.prompt),
            target: direct
              ? { type: "dm" }
              : channel && channel.target.channelId !== ctx.channelId
                ? channel.target
                : { type: "conversation", ...conv, reminder: false },
            trigger,
            report: routineReportOf(input.report),
            ownActions: routineOwnActions(input),
          }).catch((error) => {
            if (performer.handle && notManager(error)) return notTheirs(performer.handle, error);
            throw error;
          });
          if ("content" in routine) return routine;
          // Recorded right after (reading the schedule may call a model: no transaction held around it).
          const row = await routineRow(ctx.db, ctx.orgId, routine.id);
          if (row) {
            await recordAgentActions(ctx.db, ctx, [
              {
                kind: "routine.created",
                target: { type: "routine", id: routine.id, title: routine.name },
                params: {
                  name: routine.name,
                  active: routine.active,
                  access: routine.access,
                  report: routine.report,
                  ownActions: routine.ownActions,
                  ...whenParams(routine.trigger),
                },
                after: routineSnapshot(row),
              },
            ]);
          }
          const by = performer.handle ? ` on @${performer.handle} (it does the work itself, each run)` : "";
          return {
            content: `Created routine ${routine.id}${by} ${await summaryOf(ctx, routine)}. Confirm it to the person.${await ownActionsText(ctx, routine)}${needsText(routine)}${
              routine.trigger.type === "webhook" ? WEBHOOK_HINT : ""
            }`,
            data: { routine: { id: routine.id } },
          };
        } catch (error) {
          return failed(error);
        }
      },
    },
    {
      name: "list_routines",
      description:
        "List routines (recurring, not reminders): yours by default; another agent's with `agent` (its handle, e.g. @atlas), or every agent's with `agent: \"all\"`, to check what they do before you answer about them. Shows each one's state (active, paused and why, running, waiting for its computer, failing), when it runs and its next run, where it reports, its instructions and its last 5 runs with their coded outcome (reported, silent, failed, skipped… and why). `id` shows one in full. Read only: to change one when a person asks (yours, or another agent's the person may manage), use update_routine.",
      scope: SCHEDULE_SCOPE,
      inputSchema: {
        type: "object",
        properties: {
          agent: { type: "string", maxLength: 40, description: 'An agent\'s handle (@atlas), or "all"' },
          id: { type: "string", minLength: 36, maxLength: 36 },
        },
        additionalProperties: false,
      },
      async execute(input, ctx) {
        try {
          const person = await requesterOf(ctx);
          const [handle = ""] = await currentHandles(ctx.db, ctx.orgId, [
            str(input.agent).trim().replace(/^@/, "").toLowerCase(),
          ]);
          const { agents } = schema;
          const team = await ctx.db
            .select({
              id: agents.id,
              handle: agents.handle,
              audienceMode: agents.audienceMode,
              audienceUserIds: agents.audienceUserIds,
              audienceRoleIds: agents.audienceRoleIds,
              consultable: agents.consultable,
              brain: agents.brain,
              ownerUserId: agents.ownerUserId,
            })
            .from(agents)
            .where(and(eq(agents.orgId, ctx.orgId), isNull(agents.archivedAt)));
          const byId = new Map(team.map((a) => [a.id, a]));
          let agentId: string | undefined = ctx.agentId;
          if (handle === "all") agentId = undefined;
          else if (handle) {
            const found = team.find((a) => a.handle === handle);
            if (!found) return { content: await noAgentText(ctx, [handle]), isError: true };
            agentId = found.id;
          }
          const mineOnly = agentId === ctx.agentId;
          const talks = await speakerFor(ctx.db, ctx.orgId, person);
          const list = (await listOrgRoutines(ctx.db, ctx.orgId, { agentId, viewerId: person })).filter(
            (r) =>
              isRoutine(r) &&
              (!str(input.id) || r.id === str(input.id)) &&
              // Another agent's routines only when the person behind this run may talk to it.
              (r.agentId === ctx.agentId ||
                (byId.has(r.agentId) &&
                  (!person || canTalkTo(byId.get(r.agentId) as (typeof team)[number], person, talks)))),
          );
          if (list.length === 0) {
            if (str(input.id))
              return { content: `No routine ${str(input.id)} here. Use list_routines.`, isError: true };
            return {
              content: mineOnly
                ? "You have no routines."
                : handle === "all"
                  ? "No routines."
                  : `@${handle} has no routines.`,
            };
          }
          const channelOf = (r: RoutineView) =>
            r.target.type === "channel" || r.target.type === "conversation" ? r.target.channelId : null;
          const readable = person
            ? new Set<string>()
            : await readableChannels(ctx, [...new Set(list.flatMap((r) => channelOf(r) ?? []))]);
          const lines = await Promise.all(
            list.map(async (r) => {
              const channelId = channelOf(r);
              // A person behind the run sees what Settings › Rotinas shows them (`viewerId` above); the agent's own
              // view only when nobody is.
              const visible = person
                ? r.prompt !== null
                : r.agentId === ctx.agentId || (channelId ? readable.has(channelId) : r.target.type === "artifact");
              return routineLine(
                r,
                await whereOf(ctx, r),
                mineOnly ? null : (byId.get(r.agentId)?.handle ?? null),
                visible ? (r.prompt ?? "") : null,
                Boolean(str(input.id)),
              );
            }),
          );
          return { content: lines.join("\n") };
        } catch (error) {
          return failed(error);
        }
      },
    },
    {
      name: "update_routine",
      description:
        'Change a routine (id from list_routines) when the person asks: yours, or another agent\'s when the person may manage it. `title` renames it, `channel` moves where it reports ("manda no #general" — then nothing comes to the old conversation), `prompt` replaces its instructions (that routine\'s only: a person\'s rule that holds beyond it, a permission or where to send things, is `remember` kind rule), `schedule` its time ("dias úteis às 9h", "weekdays at 9am") or `trigger` what starts it (an email filter, a webhook with the HTTP `methods` it answers, or an event instead of a schedule), `report` when it speaks, `own_actions` what it does in connected apps without asking, `active` pauses or resumes it, `agent` hands it to another agent that should do the work. Only who created it, the agent\'s owner or an admin can change it; the person sees it with Undo.',
      scope: SCHEDULE_SCOPE,
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 36, maxLength: 36 },
          channel: { type: "string", maxLength: 100 },
          prompt: { type: "string", minLength: 1, maxLength: 10_000 },
          schedule: SCHEDULE_INPUT,
          trigger: TRIGGER_SCHEMA,
          title: { type: "string", minLength: 1, maxLength: 120 },
          report: REPORT_SCHEMA,
          own_actions: OWN_ACTIONS_SCHEMA,
          keys: KEYS_SCHEMA,
          active: { type: "boolean" },
          agent: { type: "string", maxLength: 40, description: "Hand it to this agent (its handle)" },
        },
        required: ["id"],
        additionalProperties: false,
      },
      async execute(input, ctx) {
        try {
          const requester = await requesterOf(ctx);
          if (!requester) return noRequester;
          const id = str(input.id);
          const own = await ownRoutine(ctx, id, true);
          if (!own.row) return { content: own.error, isError: true };
          const performer = await performerOf(ctx, input.agent);
          if ("content" in performer) return performer;
          const rawTrigger = input.trigger as Record<string, unknown> | undefined;
          if (rawTrigger && str(input.schedule)) {
            return { content: "Give either `schedule` or `trigger`, not both.", isError: true };
          }
          const trigger: RoutineTriggerInput | undefined = rawTrigger
            ? await triggerOf(ctx, rawTrigger)
            : str(input.schedule)
              ? { type: "schedule", phrase: str(input.schedule) }
              : undefined;
          const never = trigger ? await neverFires(ctx, trigger, "Not changed") : null;
          if (never) return never;
          const channel = str(input.channel).trim() ? await channelTarget(ctx, requester, str(input.channel)) : null;
          const owner = own.row.agentId;
          const methodsOf = async () => (await routineHookKeys(ctx.db, [id])).get(id)?.methods ?? null;
          const methodsBefore = await methodsOf();
          const routine = await updateRoutine(routineDeps(ctx), requester, ctx.orgId, id, {
            ...(str(input.agent).trim() && performer.id !== owner ? { agentId: performer.id } : {}),
            ...(channel ? { target: channel.target } : {}),
            ...(str(input.prompt) ? { prompt: str(input.prompt) } : {}),
            ...(str(input.title) ? { name: str(input.title) } : {}),
            ...(trigger ? { trigger } : {}),
            ...(input.report !== undefined ? { report: routineReportOf(input.report) } : {}),
            ...(typeof input.active === "boolean" ? { active: input.active } : {}),
            ...(Array.isArray(input.own_actions) || Array.isArray(input.keys)
              ? { ownActions: routineOwnActions(input, own.row.ownActions) }
              : {}),
          }).catch(async (error) => {
            if (!notManager(error)) throw error;
            const [other] =
              owner === ctx.agentId
                ? []
                : await ctx.db
                    .select({ handle: schema.agents.handle })
                    .from(schema.agents)
                    .where(and(eq(schema.agents.orgId, ctx.orgId), eq(schema.agents.id, owner)));
            const handle = other?.handle || performer.handle;
            if (handle) return notTheirs(handle, error);
            throw error;
          });
          if ("content" in routine) return routine;
          const afterRow = await routineRow(ctx.db, ctx.orgId, id);
          let receipt = false;
          if (afterRow) {
            const was: Record<string, unknown> = routineSnapshot(own.row);
            const now: Record<string, unknown> = routineSnapshot(afterRow);
            // The methods its address answers live with the address: compared (and undone) when it had one already.
            const methodsAfter = await methodsOf();
            if (methodsBefore && methodsAfter) {
              was.methods = methodsBefore;
              now.methods = methodsAfter;
            }
            const fields = Object.keys(now).filter((k) => JSON.stringify(was[k]) !== JSON.stringify(now[k]));
            if (fields.length > 0) {
              receipt = true;
              const words = [
                ...new Set(
                  fields.map((f) =>
                    ["triggerType", "phrase", "cron", "timezone", "description", "event", "rule", "methods"].includes(f)
                      ? "schedule"
                      : f === "ownActions"
                        ? "access"
                        : f,
                  ),
                ),
              ];
              await recordAgentActions(ctx.db, ctx, [
                {
                  kind: "routine.updated",
                  target: { type: "routine", id: routine.id, title: routine.name },
                  params: {
                    name: routine.name,
                    // The app's words: name, prompt, schedule, where (target), access, report, paused/resumed (active).
                    fields: words,
                    active: routine.active,
                    access: routine.access,
                    report: routine.report,
                    ...(words.includes("schedule") ? whenParams(routine.trigger) : {}),
                  },
                  before: Object.fromEntries(fields.map((k) => [k, was[k]])),
                  after: Object.fromEntries(fields.map((k) => [k, now[k]])),
                },
              ]);
            }
          }
          return {
            content: `Updated routine ${routine.id} ${await summaryOf(ctx, routine)}. Tell the person what changed.${
              Array.isArray(input.own_actions) || Array.isArray(input.keys) ? await ownActionsText(ctx, routine) : ""
            }${needsText(routine)}${trigger?.type === "webhook" && receipt ? WEBHOOK_HINT : ""}`,
            data: { routine: { id: routine.id } },
          };
        } catch (error) {
          return failed(error);
        }
      },
    },
    {
      name: "delete_routine",
      description:
        "Delete one of your routines (id from list_routines) when the person asks: it stops for good (its history stays). The person sees it with Undo. To stop it for a while, pause it instead (update_routine with active false).",
      scope: SCHEDULE_SCOPE,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", minLength: 36, maxLength: 36 } },
        required: ["id"],
        additionalProperties: false,
      },
      async execute(input, ctx) {
        try {
          const requester = await requesterOf(ctx);
          if (!requester) return noRequester;
          const id = str(input.id);
          // The right hand deletes or runs any agent's routine the person may manage (checked as them).
          const own = await ownRoutine(ctx, id, isRightHand(await getAgentCached(ctx.db, ctx.orgId, ctx.agentId)));
          if (!own.row) return { content: own.error, isError: true };
          await deleteRoutine(routineDeps(ctx), requester, ctx.orgId, id);
          await recordAgentActions(ctx.db, ctx, [
            {
              kind: "routine.deleted",
              target: { type: "routine", id, title: own.row.name },
              params: { name: own.row.name },
              before: routineSnapshot(own.row),
            },
          ]);
          return { content: `Deleted routine ${id} "${own.row.name}". Tell the person (they can undo it).` };
        } catch (error) {
          return failed(error);
        }
      },
    },
    {
      name: "run_routine_now",
      description:
        "Run one of your routines now (id from list_routines), when the person asks to try it or wants a fresh run: it works in the background as on its schedule and speaks as its report setting says. It runs once at a time: if a run is still going, this one is skipped.",
      scope: SCHEDULE_SCOPE,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", minLength: 36, maxLength: 36 } },
        required: ["id"],
        additionalProperties: false,
      },
      async execute(input, ctx) {
        try {
          const requester = await requesterOf(ctx);
          if (!requester) return noRequester;
          const id = str(input.id);
          // The right hand deletes or runs any agent's routine the person may manage (checked as them).
          const own = await ownRoutine(ctx, id, isRightHand(await getAgentCached(ctx.db, ctx.orgId, ctx.agentId)));
          if (!own.row) return { content: own.error, isError: true };
          const routine = await runRoutineNow(routineDeps(ctx), requester, ctx.orgId, id);
          return {
            content: `Started a run of routine ${id} "${routine.name}": it works in the background and ${reportText(routine)}, in ${await whereOf(ctx, routine)}. Tell the person it's running; don't wait for it.`,
            data: { routine: { id } },
          };
        } catch (error) {
          return failed(error);
        }
      },
    },
    {
      name: "list_reminders",
      description: "List the pending reminders of the person who asked (theirs only).",
      scope: SCHEDULE_SCOPE,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute(_input, ctx) {
        try {
          const requester = await requesterOf(ctx);
          if (!requester) return noRequester;
          const list = await listReminders(ctx.db, requester, ctx.orgId);
          if (list.length === 0) return { content: "No pending reminders." };
          return { content: list.map((r) => `${r.id} — ${r.description}: ${r.message}`).join("\n") };
        } catch (error) {
          return failed(error);
        }
      },
    },
    {
      name: "cancel_reminder",
      description: "Cancel one of the asking person's reminders (by id from list_reminders).",
      scope: SCHEDULE_SCOPE,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", minLength: 36, maxLength: 36 } },
        required: ["id"],
        additionalProperties: false,
      },
      async execute(input, ctx) {
        try {
          const requester = await requesterOf(ctx);
          if (!requester) return noRequester;
          const r = await cancelReminder(routineDeps(ctx), requester, ctx.orgId, str(input.id));
          return { content: `Cancelled the reminder for ${r.description}: ${r.message}` };
        } catch (error) {
          return failed(error);
        }
      },
    },
    {
      name: "schedule_action",
      description:
        "Prepare a connected app's action for later (a post at a set time, a message to send tomorrow): the person approves that exact action now, on a card that says when it runs, and at that time it goes out by itself without asking again. Use it instead of a reminder or routine that would ask at the time. Give the exact `tool` and its full `arguments` (the whole text, the account: nothing left to decide later), `when` (the person's words or ISO 8601) or `routine` (the next run of one of your routines), a short `title` in the person's language and `why`. Your turn waits for their decision. To change its content or time later, call it again with `replaces`: that needs a new approval. Never for merge, deploy, rollback and the like: those follow your approvals at the time.",
      scope: SCHEDULE_SCOPE,
      inputSchema: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            minLength: 1,
            maxLength: 64,
            description:
              "The exact name of the tool that does it (behind a big connector: its real name, from find_tools)",
          },
          arguments: { type: "object", description: "Exactly what that tool takes, as its schema says" },
          when: { type: "string", minLength: 1, maxLength: 120 },
          routine: { type: "string", minLength: 36, maxLength: 36, description: "Instead of `when`" },
          replaces: {
            type: "string",
            minLength: 36,
            maxLength: 36,
            description: "The id of one you prepared before: it is canceled (its time stays unless you give another)",
          },
          title: { type: "string", minLength: 1, maxLength: 120 },
          why: {
            type: "string",
            minLength: WHY_MIN_CHARS,
            maxLength: WHY_MAX_CHARS,
            description: "Why, for the person deciding (on the card): what it is and why then, in their language",
          },
        },
        required: ["tool", "arguments", "title", "why"],
        additionalProperties: false,
      },
      async execute(input, ctx) {
        try {
          const requester = await requesterOf(ctx);
          if (!requester) return noRequester;
          const prepare = ctx.prepareAhead;
          const args = input.arguments as Record<string, unknown>;
          if (!prepare) return { content: "Approving ahead isn't available on this path.", isError: true };
          const replaced = str(input.replaces)
            ? await cancelableAhead(ctx.db, requester, ctx.orgId, str(input.replaces))
            : null;
          if (replaced && replaced.agentId !== ctx.agentId) {
            return { content: `${replaced.id} was prepared by another agent: only it changes it.`, isError: true };
          }
          // The run it is for: one of the agent's routines, a new one-off at `when`, else the run it replaces.
          let slot: AheadRequest["slot"];
          const routineId = str(input.routine) || (str(input.when) ? "" : (replaced?.routineId ?? ""));
          if (routineId) {
            const own = await ownRoutine(ctx, routineId);
            if (!own.row) return { content: own.error, isError: true };
            const target = own.row.target as RoutineTarget;
            if (target.type === "conversation" && target.reminder) {
              return { content: `Routine ${routineId} doesn't run you (a reminder).`, isError: true };
            }
            const runAt = str(input.routine) ? own.row.nextRunAt : replaced?.runAt;
            if (!own.row.active || !runAt || runAt.getTime() <= Date.now()) {
              return {
                content: `Routine ${routineId} has no run coming (paused, done or starting now).`,
                isError: true,
              };
            }
            slot = async () => ({ routineId, runAt });
          } else if (str(input.when)) {
            const timezone = await routineTimezone(ctx.db, requester, ctx.orgId);
            const reader = deps.context ? schedulesOf(deps.context) : null;
            const when = await parseWhen(reader, { orgId: ctx.orgId, text: str(input.when), timezone });
            if (!when.ok) {
              return { content: `${when.error} Ask the person (ask_user) for a clear date and time.`, isError: true };
            }
            const conv = await conversationOf(ctx);
            slot = async () => {
              const r = await createReminder(routineDeps(ctx), requester, ctx.orgId, {
                agentId: ctx.agentId,
                ...conv,
                at: when.at,
                timezone: when.timezone,
                description: when.description,
                message: str(input.title),
                askAgent: true,
              });
              return { routineId: r.id, runAt: when.at };
            };
          } else {
            return {
              content: "Say when it goes out (`when`), or for which routine's next run (`routine`).",
              isError: true,
            };
          }
          const prepared = await prepare({ tool: str(input.tool), input: args, why: str(input.why), slot });
          if (!prepared.ok) return { content: prepared.message, isError: true };
          // Changed content or time: the earlier approval covers nothing any more.
          if (replaced) await cancelAheadApproval(routineDeps(ctx), requester, ctx.orgId, replaced.id);
          if (prepared.scheduled) return { content: prepared.scheduled };
          return {
            content: `Waiting for a person to approve «${prepared.approval.title}» ahead.`,
            waitForApproval: prepared.approval,
          };
        } catch (error) {
          return failed(error);
        }
      },
    },
  ];
  /** A routine's run does what was prepared for it (`schedule_action`) by its id: the gateway runs the stored call. */
  const runApproved: ToolDefinition = {
    name: RUN_APPROVED_ACTION,
    description:
      "Do an action prepared ahead for this run, by its id (your routine's instructions list them): exactly as it was stored. One a person approved for this time goes out without asking; any other goes the way calling its tool would.",
    scope: "",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", minLength: 36, maxLength: 36 } },
      required: ["id"],
      additionalProperties: false,
    },
    execute: async (input) => ({
      content: `Nothing was prepared ahead with the id ${str(input.id)} for you: use an id your routine's instructions list.`,
      isError: true,
    }),
  };
  return { name: "schedule", tools: async (ctx) => (ctx.background ? [...tools, runApproved] : tools) };
}
