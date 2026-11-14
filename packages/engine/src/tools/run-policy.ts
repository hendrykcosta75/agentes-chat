import { and, type Executor, eq, schema } from "@agenteschat/db";
import { fedByRoutine, type RunAuthority } from "../authority";
import { directoryRole } from "./directory";
import type { JsonSchema } from "./json-schema";
import type { ToolDefinition } from "./types";

/**
 * What a run may do with each tool, by who is behind it (ADR 0053 §2 and its addendum of 2026-10-31). One
 * table for every brain: the Tool Gateway applies it when listing (a refused tool isn't listed, for the
 * model loop and for the bridge Claude Code and Codex reach our tools through) and again on every call,
 * and it turns `approve` into an approval card whatever the agent's own settings say.
 *
 * - `person` and `unattended` (nobody behind it: it works as the agent itself): every tool but
 *   `hand_off`; scopes and the tools' own approvals decide. A tool that needs a person's request
 *   refuses on its own when nobody is behind the run.
 * - `unattended` that a routine's report or work woke (`fedByRoutine`): what the routine read (inbound mail, a
 *   webhook) feeds it, so it keeps the routine's bounds (below), plus the reply where it is (`here`), never
 *   `hand_off` nor a mission's tools; every write to a connected app asks a person, except, on the run its report
 *   or a teammate's answer to its question woke while that is all it read, the routine's own actions (`onOwnJob`,
 *   ADR 0053 addendum 2026-11-13).
 * - `routine`: nothing that speaks for someone (reactions, GIFs and stickers, questions, reminders,
 *   routines, events, channels, secrets, permissions). It reports through `hand_off`, whose message may carry a GIF
 *   (its `gif`, as `post_message`'s, ADR 0091 addendum 2026-11-09). Otherwise it
 *   works as the agent (ADR 0109: one permission model, the agent's own): reads, the web and the browser,
 *   internal changes people can undo (issues, memory, wiki, Drive, Vault contacts, its own branches and pull
 *   requests, its computer). At `risky`, while its creator still decides the agent's approvals (`creatorDecides`), it
 *   writes to connected apps as a person's run does: what the tool marks as asking (a send, a delete, a payment, an
 *   invite, a tool an admin set to ask, merge, deploy and rollback) asks. Otherwise every write to a connected app
 *   asks a person, except the actions its creator allowed for its job (`routines.own_actions`: the gateway lets those
 *   through, `ownJobCovers`). It reaches other agents (`ask_agent`,
 *   `tell_agent`) and posts where its creator can post (`post_message`, `send_dm` to its creator): the
 *   tools hold it to its creator's rooms and agents (ADR 0053 §2, amended 2026-10-31).
 * - `routine` redoing a widget (its brief's `widget`, ADR 0135 §5): it only reads (built-in reads, connected apps'
 *   reads, the web, the browser) and answers through `update_widget`; everything else is refused with why,
 *   `hand_off` included: a widget's refresh never posts. `update_widget` is no other run's. What it starts with in
 *   hand, where a brain's harness would hold tools back behind a search: `widgetUpFront`.
 *
 * The agent's own approvals level (ADR 0173, amended 2026-11-12) moves every run. At `always` every call that changes
 * something answers `approve` (`asksAtAlways`): a connected app's write, an internal change, what speaks elsewhere, a
 * tool this table doesn't know, on a person's run, the agent's own, a routine's and one a routine's reading feeds.
 * At `never` nothing asks: this table still answers `approve` for a routine's write to a connected app, and the
 * gateway lifts every card there (`unaskedAtNever`), so a refusal here is never lifted with it.
 *
 * Tool names are written here as plain strings (not imported) so the table loads before the tool
 * modules, which import the gateway.
 */
export type PolicyDecision = { action: "allow" } | { action: "approve" } | { action: "refuse"; reason: string };

/** What a tool does, as the table sees it. */
export type ToolKind =
  /** A directory's search or way in (`find_tools`, `use_tool`): the real tool is judged on its own. */
  | { kind: "directory" }
  /** Looks only. */
  | { kind: "read" }
  /** `hand_off`: a routine's report. */
  | { kind: "hand_off" }
  /** `pass`: ends the run without a message. */
  | { kind: "pass" }
  /**
   * `set_status` (the agent's own line next to its name, ADR 0084), `withdraw_request` (its own open requests) and
   * `set_reply_style` (how the person behind the run asked to be talked to, ADR 0147): nothing else.
   */
  | { kind: "self" }
  /** Speaks in the run's own conversation (a reaction, a question, a card people act on). */
  | { kind: "here" }
  /** Speaks elsewhere or for someone: other channels, people, agents, routines, reminders, secrets. */
  | { kind: "elsewhere" }
  /** An internal change people can undo. */
  | { kind: "internal"; area: InternalArea }
  /** A write to a connected app (connector tools that aren't reads, mail). */
  | { kind: "external" }
  /**
   * The computer's own permission prompt (`permission_prompt`, Claude Code's `--permission-prompt-tool`):
   * what it allows is the command policy's, by the turn's profile. Every computer run needs it listed.
   */
  | { kind: "computer" }
  /** A mission's machine tools for its main session (`start_task`, `upload_artifact`): its own work only. */
  | { kind: "mission" }
  /** `update_widget`: a widget's refresh run reports its data (ADR 0135 §5); no other run's. */
  | { kind: "widget" }
  /** A tool this table doesn't know (no scope it reads): never a routine's. */
  | { kind: "unknown" };

export type InternalArea =
  | "issues"
  | "memory"
  | "drive"
  | "wiki"
  | "code"
  | "browser"
  | "desktop"
  | "dashboards"
  | "vault"
  | "skills";

/** How much an agent asks before acting (`agents.approvals_level`, ADR 0173). */
export const APPROVALS_LEVELS = ["always", "risky", "never"] as const;
export type ApprovalsLevel = (typeof APPROVALS_LEVELS)[number];
export const DEFAULT_APPROVALS_LEVEL: ApprovalsLevel = "risky";

/** An agent's level, read fresh on every call: narrowing it asks at once. */
export async function approvalsLevelOf(db: Executor, orgId: string, agentId: string): Promise<ApprovalsLevel> {
  const [row] = await db
    .select({ level: schema.agents.approvalsLevel })
    .from(schema.agents)
    .where(and(eq(schema.agents.orgId, orgId), eq(schema.agents.id, agentId)));
  return row?.level ?? DEFAULT_APPROVALS_LEVEL;
}

/** A computer turn's `permissions.asks`: the level, when it isn't the default. */
export const asksOf = (level: ApprovalsLevel): { asks?: "always" | "never" } =>
  level === "risky" ? {} : { asks: level };

export type PolicyTool = Pick<ToolDefinition, "name" | "scope" | "connectionId" | "sensitive" | "opensPullRequest">;

const ALLOW: PolicyDecision = { action: "allow" };
const APPROVE: PolicyDecision = { action: "approve" };
const refuse = (reason: string): PolicyDecision => ({ action: "refuse", reason });

/** Speaks for someone or beyond the run's conversation, by name. */
const ELSEWHERE = new Set([
  "post_message",
  "send_dm",
  "ask_agent",
  "tell_agent",
  "schedule_reminder",
  "cancel_reminder",
  "schedule_action",
  "create_routine",
  "update_routine",
  "delete_routine",
  "run_routine_now",
  "add_agent_to_channel",
  "create_channel",
  "request_secret",
  "request_permission",
  // An agent's own settings, as its permissions: never what a routine or what it read asks for.
  "request_settings_change",
  "request_folder_access",
  "propose_event",
  // An email to whoever runs the server, in a person's name (ADR 0160 §11): only a run a person is behind sends it.
  "send_feedback",
]);

/** Long work's tools (ADR 0121), on the run's own work: `self`. */
const SELF_WORK = new Set(["work_in_background", "post_update", "steer_work", "stop_work"]);

/** What a routine may use of `ELSEWHERE`, by name. */
const ROUTINE_REACH = new Set(["post_message", "send_dm", "ask_agent", "tell_agent"]);

/** Speaks in the run's own conversation, by name. */
const HERE = new Set([
  "react",
  "send_gif",
  "send_sticker",
  "ask_user",
  "show_block",
  "start_poll",
  "ask_choices",
  "share_artifact",
  "propose_mission",
  "browser_ask_person",
  "desktop_ask_person",
  "update_thread",
  "offer_connect_ai",
  "offer_connect_app",
  // A report about the app, as a row under the reply the person sends or dismisses (ADR 0160 §12).
  "offer_feedback",
  "offer_invites",
  "offer_install_skill",
  "propose_agent",
  "propose_settings_change",
  "propose_remove_agents",
  "propose_team",
  "offer_answers",
  "follow_up",
  "cancel_follow_up",
  // Lets another agent's wait here go, with a note here (`parked-asks.ts`).
  "release_waiting_agent",
]);

/** Reads under a scope that also writes, by name. */
const READS = new Set([
  "list_routines",
  "list_reminders",
  "find_agent",
  "get_my_usage",
  "computer_status",
  "read_file",
  "list_files",
  "list_tasks",
  "task_status",
  "get_context",
  "web_search",
  "web_fetch",
  "list_dashboards",
  "phone_screenshot",
  "phone_logs",
]);

/**
 * A mission's tools for its main session, by name: its machine tools (`mission-mcp.ts`) and its plan,
 * reports and delivery (`mission-tools.ts`, which also checks the run acts for the mission).
 */
const MISSION = new Set([
  "start_task",
  "upload_artifact",
  "update_plan",
  "record_findings",
  "report",
  "ask_decision",
  "request_review",
  "complete_mission",
  "request_approval",
]);

/**
 * Tools whose own card is the question (a secret, a permission, a setting, an event, an action approved ahead): an
 * agent that always asks adds no approval in front of them.
 */
const ASKS_ITSELF = new Set([
  "request_secret",
  "request_permission",
  "request_settings_change",
  "request_folder_access",
  "send_feedback",
  "propose_event",
  "schedule_action",
]);

/**
 * Under a scope or a kind that also acts, these only look, or only show the person a card of their own: an agent
 * that always asks doesn't ask for them. Opening a page counts as looking; a click, typing and `browser_do` don't.
 */
const LOOKS_ONLY = new Set([
  "browser_open",
  "browser_back",
  "browser_tabs",
  "browser_read",
  "browser_scroll",
  "browser_wait",
  "browser_screenshot",
  "browser_close",
  "browser_profile",
  "desktop_read",
  "desktop_screenshot",
  "git_clone",
  "team_status",
  "offer_approvals",
  "offer_open_page",
  // Their card is the question: what the person may change applies from it, anything else waits on it.
  "propose_member_changes",
  "propose_instruction_change",
]);

/** Internal changes outside their scope's own area, by name. */
const INTERNAL_BY_NAME: Readonly<Record<string, InternalArea>> = {
  git_clone: "code",
  open_pull_request: "code",
  // Their scope only says the agent may read skills: these rewrite one.
  update_skill: "skills",
  update_skill_from_source: "skills",
  // Boards and widgets for the person behind the run (ADR 0135 §10): private until the person widens them.
  create_dashboard: "dashboards",
  create_widget: "dashboards",
  share_dashboard: "dashboards",
};

/** Built-in scopes of internal changes (`issues:write` → issues…). */
const INTERNAL_BY_SCOPE: Readonly<Record<string, InternalArea>> = {
  "issues:write": "issues",
  "memory:write": "memory",
  "drive:write": "drive",
  "wiki:write": "wiki",
  "sandbox:run": "code",
  "browser:use": "browser",
  "desktop:use": "desktop",
  // Contacts and descriptions in the Vault (ADR 0144): never a value, and an agent deletes only what it saved.
  "vault:write": "vault",
};

const isReadScope = (scope: string) => /[:.]read$/.test(scope);

/**
 * A tool name or an action's slug that opens a pull request, whatever its prefix (`github_create_pull_request`,
 * `GITHUB_CREATE_A_PULL_REQUEST`, GitLab's `create_merge_request`). The name ends there: a review of one, or its
 * merge, is another tool.
 */
export const opensPullRequestName = (name: string) => /(^|_)(create|open)_(a_)?(pull|merge)_request$/i.test(name);

/** A connected app's tool that opens a pull request, by its name or by the actions this call runs (the gateway's mark). */
export const opensPullRequest = (tool: PolicyTool) =>
  Boolean(tool.connectionId) &&
  !isReadScope(tool.scope) &&
  (tool.opensPullRequest === true || opensPullRequestName(tool.name));

/** What a tool does (see `ToolKind`): provenance first, then built-in name and scope. */
export function toolKind(tool: PolicyTool): ToolKind {
  if (directoryRole(tool as ToolDefinition)) return { kind: "directory" };
  // A way in like a directory's: the gateway runs the action approved ahead it names, judged as that action.
  if (tool.name === "run_approved_action" && !tool.connectionId && tool.scope === "") return { kind: "directory" };
  // These Git tools carry a connection ID for credentials, but they are our own
  // workspace-changing actions. Their exact scopes distinguish them from MCP tools.
  if (tool.name === "git_clone" && tool.scope === "github:git.read") return { kind: "internal", area: "code" };
  if (tool.name === "open_pull_request" && tool.scope === "github:pr.write") return { kind: "internal", area: "code" };
  // Opening a pull request is the agent's own code work, like a push to its own branch, through any connected app:
  // nothing changes until someone merges it, and a merge is another tool.
  if (opensPullRequest(tool)) return { kind: "internal", area: "code" };
  // The computer's own background task (`sandbox-tools.ts`) is code work; the mission's `start_task` has no scope.
  if (tool.name === "start_task" && tool.scope === "sandbox:run") return { kind: "internal", area: "code" };
  // A connected app's tool (a catalog connector, custom server, mailbox, or database) is a read
  // only when its scope says so. Connector names can collide with built-ins (a custom MCP
  // server named "permission" exposing "prompt"). Classify by provenance
  // before consulting the built-in name table.
  if (tool.connectionId) return isReadScope(tool.scope) && !tool.sensitive ? { kind: "read" } : { kind: "external" };
  if (tool.name === "hand_off") return { kind: "hand_off" };
  if (tool.name === "update_widget" && tool.scope === "") return { kind: "widget" };
  if (tool.name === "pass") return { kind: "pass" };
  if (
    tool.name === "set_status" ||
    tool.name === "withdraw_request" ||
    tool.name === "set_reply_style" ||
    tool.name === "commit_co_author" ||
    tool.name === "wait_for_device"
  )
    return { kind: "self" };
  // Long work (ADR 0121): the run's own work only; who may go to the background is the tool source's.
  if (!tool.scope && SELF_WORK.has(tool.name)) return { kind: "self" };
  if (tool.name === "permission_prompt") return { kind: "computer" };
  // The built-in `request_approval` (ADR 0126) only asks the people who decide, from any run (its card goes where the
  // run reports); the mission's, with a scope, is the mission's.
  if (tool.name === "request_approval" && tool.scope === "") return { kind: "self" };
  if (MISSION.has(tool.name)) return { kind: "mission" };
  if (ELSEWHERE.has(tool.name)) return { kind: "elsewhere" };
  if (HERE.has(tool.name)) return { kind: "here" };
  if (READS.has(tool.name)) return { kind: "read" };
  const named = INTERNAL_BY_NAME[tool.name];
  if (named) return { kind: "internal", area: named };
  if (isReadScope(tool.scope)) return { kind: "read" };
  const area = INTERNAL_BY_SCOPE[tool.scope];
  if (area) return { kind: "internal", area };
  // Anything else (a new tool without a scope this table knows): a sensitive one asks a person, like a
  // connected app's write; any other is never a routine's.
  return tool.sensitive ? { kind: "external" } : { kind: "unknown" };
}

export const REFUSALS = {
  routineElsewhere:
    "This is a routine's background work: it can't manage routines or reminders, propose events, change channels, or ask for secrets or permissions. Put it in hand_off; the people decide.",
  routineAskUser:
    "This is a routine's background work: nobody is here to answer. Decide with your best judgement; if a person must decide, say so in hand_off.",
  routineReact: "This is a routine's background work: there is no message to react to. Just finish, or use hand_off.",
  routineMedia:
    "This is a routine's background work: nobody is in its room to send a GIF or a sticker to. A GIF goes with the routine's message: give hand_off a `gif` (when it has one), never a link to a GIF site.",
  routineHere: "This is a routine's background work in a room nobody reads: put it in hand_off; the people decide.",
  routineShare:
    "This is a routine's background work: the files you save already go where it reports, and hand_off carries their cards. Just hand off.",
  fedElsewhere:
    "A routine's report or work started this, so you keep within what that routine may do: you can't manage routines or reminders, propose events, change channels, ask for secrets or permissions, or use this tool. Say it in your reply here; the people decide.",
  fedMission:
    "A routine's report or work started this, not the mission: say in your reply what you'd do; the people decide.",
  handOffOnly: "Only background work (a routine's run) hands off: just reply.",
  missionOnly:
    "A routine's background work doesn't start a mission's tasks or upload its files: put what you'd do in hand_off; the people decide.",
  unknownTool: "A routine's background work can't use this tool: put what you'd do in hand_off; the people decide.",
  widgetOnly:
    "This run keeps a widget up to date: it only reads (your tools' reads, the web, your browser) and answers with update_widget. Nothing else here: no posting, handing off, changing or asking anyone. If you can't get the data, call update_widget with `failed` and why.",
  widgetToolOnly: "update_widget belongs to a widget's update run; in a conversation, use create_widget instead.",
} as const;

/** Tools that speak here whose refusal in a routine says what it does instead, by name; any other: `routineHere`. */
const ROUTINE_HERE_REFUSAL: Readonly<Record<string, string>> = {
  ask_user: REFUSALS.routineAskUser,
  react: REFUSALS.routineReact,
  send_gif: REFUSALS.routineMedia,
  send_sticker: REFUSALS.routineMedia,
  share_artifact: REFUSALS.routineShare,
};

/** Whether an agent that always asks (ADR 0173) asks before a call of this tool: everything that changes something. */
function asksAtAlways(what: ToolKind, tool: PolicyTool): boolean {
  switch (what.kind) {
    case "external":
      return true;
    case "elsewhere":
      return !ASKS_ITSELF.has(tool.name);
    case "internal":
    case "unknown":
      return !LOOKS_ONLY.has(tool.name);
    default:
      return false;
  }
}

/** The table (see the file's comment): what `authority` may do with `tool`, at the agent's approvals level. */
export function toolPolicy(
  authority: RunAuthority,
  tool: PolicyTool,
  level: ApprovalsLevel = DEFAULT_APPROVALS_LEVEL,
  /** A routine's own run whose creator still decides its agent's approvals (the gateway reads it fresh). */
  creatorDecides = false,
): PolicyDecision {
  const what = toolKind(tool);
  const asks = level === "always" && asksAtAlways(what, tool);
  // A widget's refresh (ADR 0135 §5): reads and `update_widget`, nothing else.
  if (authority.kind === "routine" && authority.brief?.widget) return widgetRunPolicy(what, asks);
  if (what.kind === "widget") return refuse(REFUSALS.widgetToolOnly);
  if (what.kind === "directory" || what.kind === "pass" || what.kind === "self" || what.kind === "computer") {
    return ALLOW;
  }
  // A person's run and a run nobody is behind work alike: as the agent, with every tool its scopes give.
  // The mission's own tools check that the run works for the mission (`runActsForMission`).
  const fed = authority.kind === "unattended" && fedByRoutine(authority);
  if (authority.kind !== "routine" && !fed) {
    if (what.kind === "hand_off") return refuse(REFUSALS.handOffOnly);
    return asks ? APPROVE : ALLOW;
  }
  // What a routine read feeds a run its report or work woke (`fedByRoutine`): that run keeps the routine's
  // bounds, replies where it is, and asks a person before writing to a connected app.
  switch (what.kind) {
    case "read":
      return ALLOW;
    case "hand_off":
      return fed ? refuse(REFUSALS.handOffOnly) : ALLOW;
    case "elsewhere":
      if (!ROUTINE_REACH.has(tool.name)) return refuse(fed ? REFUSALS.fedElsewhere : REFUSALS.routineElsewhere);
      return asks ? APPROVE : ALLOW;
    case "here":
      return fed ? ALLOW : refuse(ROUTINE_HERE_REFUSAL[tool.name] ?? REFUSALS.routineHere);
    case "internal":
      return asks ? APPROVE : ALLOW;
    case "external":
      return !fed && creatorDecides && level === "risky" ? ALLOW : APPROVE;
    case "mission":
      return refuse(fed ? REFUSALS.fedMission : REFUSALS.missionOnly);
    case "unknown":
      return refuse(fed ? REFUSALS.fedElsewhere : REFUSALS.unknownTool);
  }
}

/**
 * A widget's refresh run (ADR 0135 §5): the directory's way in (the real tool is judged on its own), the computer's
 * prompt, reads (built-in, connected apps', the web) and the browser to read with, and `update_widget`. Anything else
 * is refused with why, `hand_off` and `pass` included: it ends by calling `update_widget`. `asks`: its agent always
 * asks and this tool acts (a click in the browser).
 */
function widgetRunPolicy(what: ToolKind, asks: boolean): PolicyDecision {
  switch (what.kind) {
    case "directory":
    case "computer":
    case "read":
    case "widget":
      return ALLOW;
    case "internal":
      if (what.area !== "browser") return refuse(REFUSALS.widgetOnly);
      return asks ? APPROVE : ALLOW;
    default:
      return refuse(REFUSALS.widgetOnly);
  }
}

/** Most tools a widget's refresh run starts with in hand (`widgetUpFront`): past it, a search away as before. */
// ponytail: a count in list order; rank by the widget's ask and its last `sources` when workspaces outgrow it.
export const WIDGET_UP_FRONT_MAX = 60;

/**
 * Whether a widget's refresh run starts with `tool` in hand instead of a search away: `update_widget`, the web, and
 * the connected apps' reads (a big connector's directory stands for its reads). Its first data call then costs no
 * lookup round. Every other tool the run may use (built-in reads, the browser) stays listed, one search away.
 */
export function widgetUpFront(tool: PolicyTool): boolean {
  const what = toolKind(tool);
  if (what.kind === "widget") return true;
  if (tool.connectionId) return what.kind === "read" || what.kind === "directory";
  return tool.name === "web_search" || tool.name === "web_fetch";
}

/** Where an approval asked while nobody watched comes from (`approvals.origin`): the card and notification say so. */
export type ApprovalOrigin = { kind: "routine"; routineId: string; routineName: string } | { kind: "unattended" };

/** Approvals asked while nobody watched say so (`approvals.origin`); null when a person was behind the run. */
export function approvalOrigin(authority: RunAuthority): ApprovalOrigin | null {
  if (authority.kind === "person") return null;
  if (authority.kind === "routine" && authority.brief) {
    return { kind: "routine", routineId: authority.brief.routineId, routineName: authority.brief.name };
  }
  return { kind: "unattended" };
}

// ── The required reason ("why") ──────────────────────────────────────────────

/** The reason every request for a person (an approval, `ask_user`) carries, at least this long. */
export const WHY_MIN_CHARS = 40;
export const WHY_MAX_CHARS = 1000;
export const WHY_REFUSAL = `Say why first, in \`why\`: at least ${WHY_MIN_CHARS} characters (at most ${WHY_MAX_CHARS}) on what you found and why this action; people see it on the card.`;

/** A reason people can read whole: one too short or too long is refused, never cut to fit. */
const whyOf = (text: string) => (text.length >= WHY_MIN_CHARS && text.length <= WHY_MAX_CHARS ? text : null);

const WHY_PROPERTY: JsonSchema = {
  type: "string",
  minLength: WHY_MIN_CHARS,
  maxLength: WHY_MAX_CHARS,
  description:
    "Why you ask, for the people deciding (shown on the card): what you found and why this action, in their language.",
};

/** Whether a tool's own schema already has a `why` (then it is the tool's, never stripped). */
const ownsWhy = (schema: JsonSchema) =>
  typeof schema.properties === "object" && schema.properties !== null && "why" in schema.properties;

/**
 * A tool's input schema with the required `why` added (as is when the tool has its own). `replace`: the tool's own
 * `why` is optional and every call asks, so the required one takes its place.
 */
export function withWhy(schema: JsonSchema, replace = false): JsonSchema {
  if (ownsWhy(schema) && !replace) return schema;
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? schema.required.filter((r) => r !== "why") : [];
  return {
    ...schema,
    type: "object",
    properties: { ...properties, why: WHY_PROPERTY },
    required: [...required, "why"],
  };
}

/**
 * Takes the `why` out of a call's input (the tool itself never sees it): the reason, or null when it
 * is missing, too short or too long, and the input to validate and run. A tool with its own `why` keeps it.
 */
export function takeWhy(
  schema: JsonSchema,
  input: Record<string, unknown>,
): { why: string | null; input: Record<string, unknown> } {
  if (ownsWhy(schema)) {
    const own = typeof input.why === "string" ? input.why.trim() : "";
    return { why: whyOf(own), input };
  }
  const { why, ...rest } = input;
  const text = typeof why === "string" ? why.trim() : "";
  return { why: whyOf(text), input: rest };
}
