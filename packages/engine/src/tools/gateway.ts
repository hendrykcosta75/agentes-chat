import {
  ASK_AGAIN,
  commandKind,
  heldForPerson as heldMessage,
  loneMerge,
  type MergeDone,
  PERMISSION_TOOL,
  type PubSub,
} from "@agenteschat/adapters";
import { startInFlight } from "@agenteschat/adapters/in-flight";
import { and, desc, eq, inArray, isNotNull, isNull, or, schema, sql } from "@agenteschat/db";
import { auditsCall, callSubject, callTitle, recordToolCall, type ToolCallSubject } from "../agent-audit";
import { getAgentCached } from "../agents";
import {
  COMMAND_RULE_TOOL,
  coveringRules,
  decidesAgentApprovals,
  MAX_OWN_ACTIONS,
  OWN_ACTION_NAME,
  type RememberedKind,
  rememberedKindOf,
  rulesApprover,
  SQL_READS,
  sqlReadsTarget,
} from "../approval-rules";
import {
  fedByRoutine,
  MAX_AUTHORITY_CHAIN,
  type RunAuthority,
  runAuthorityById,
  steeredByOf,
  UUID,
} from "../authority";
import { type CostKind, costlyGate, costlyKind, LONG_STEPS, unrequested } from "../brakes";
import { countToolCall } from "../connector-usage";
import { actionLevel, nameWords, openEnded } from "../connectors/classify";
import { missingConnectors, type ServerCatalog } from "../connectors/listing";
import { answersAgentsOnly, consultationOrigin } from "../consultations";
import { recordOutcome } from "../context/outcomes";
import { sha256 } from "../crypto";
import { provenReadOnly } from "../databases/guard";
import { isUnexpectedError, ToolOffError } from "../errors";
import { cutMarked, cutText, pgSafeJson, pgSafeText } from "../format";
import { mergeReposOfCall, recordMergeDone, reposOfGithubCall } from "../git/repos";
import { recordRead } from "../outbound";
import { routineCreatorOf } from "../requester";
import { isRightHand, RIGHT_HAND_NOT_OFFERED } from "../right-hand";
import { type RoutineBrief, routineBriefOf } from "../routine-brief";
import { keysOfCall, RUN_CODE_TOOL, routineKeysAllowed, routineKeysKind } from "../routine-keys";
import { addRunStep } from "../runs";
import { describeWhen } from "../schedule";
import { REQUEST_SECRET_TOOL } from "../secrets";
import {
  callTargets,
  checkTeamAction,
  commandAction,
  forgetPendingCommand,
  isOutsideTool,
  recordTeamAction,
  summarizeCall,
  type TeamCheck,
} from "../team-actions";
import { carriesCredential, promptAnswer, toolCommand, toolDetail } from "../tool-detail";
import { untrustedBlock } from "../untrusted";
import { checkToolCall } from "./checks";
import { connectorFirst } from "./connector-first";
import { type BlockedTool, compactSchema, presentTools, resolveCall } from "./directory";
import { canonicalJson, validateJson } from "./json-schema";
import { missingPermissions, REQUEST_PERMISSION_TOOL } from "./permission";
import {
  type ApprovalsLevel,
  approvalOrigin,
  approvalsLevelOf,
  DEFAULT_APPROVALS_LEVEL,
  opensPullRequest,
  opensPullRequestName,
  type PolicyDecision,
  takeWhy,
  toolKind,
  toolPolicy,
  WHY_REFUSAL,
  withWhy,
} from "./run-policy";
import {
  accessWithNeeds,
  BUILTIN_SCOPES,
  freshGrantedKeys,
  grantedScopeKeys,
  holdsConnection,
  isAllowed,
  NOT_IN_ALL,
  toolAccess,
} from "./scopes";
import type { AheadOutcome, AheadRequest, ToolContext, ToolDefinition, ToolOutput, ToolSource } from "./types";

const { approvals, agents, agentConsultations, agentRuns, agentRunSteps, messages, routines } = schema;
type AuditOutcome = schema.AuditOutcome;

/** Merge, deploy and rollback need a person whatever a connector says, unless the agent never asks (ADR 0173). */
export const ALWAYS_SENSITIVE = /(^|[^a-z])(merge|deploy|rollback|revert_deploy|promote)([^a-z]|$)/i;

/**
 * Sensitive by a word of its name or scope. Not a tool that opens a pull request (`create_merge_request`): the word
 * names what it opens, and merging it is another tool.
 */
const sensitiveByName = (name: string, scope = "") =>
  !opensPullRequestName(name) && (ALWAYS_SENSITIVE.test(name) || ALWAYS_SENSITIVE.test(scope));

export const isSensitive = (tool: Pick<ToolDefinition, "name" | "scope" | "sensitive" | "unasked">) =>
  !tool.unasked && (tool.sensitive === true || sensitiveByName(tool.name, tool.scope));

/**
 * Also as a noun or under another name: a deployment, a build, a dispatch or a release (they start workflows), a
 * branch's reference, an alias or a rolling release (production traffic), a re-run, a restore.
 */
const NEVER_FOR_GOOD =
  /^(merge|deploy|redeploy|rollback|revert|restore|promote|workflow|build|dispatch|reference|release|alias|rolling|rerun|rerequest)/;
/**
 * Verbs right after the app that start what then runs on its own (`RAILWAY_COMMIT_ENVIRONMENT_CHANGES` deploys) or
 * run whatever their arguments say (`VERCEL_EXECUTE_SANDBOX_COMMAND`).
 */
const NEVER_LEADS = new Set(["commit", "trigger", "run", "execute", "invoke"]);
/**
 * An action slug (`VERCEL_CREATE_NEW_DEPLOYMENT`) or tool name that is never approved ahead, never a routine's own
 * action, and high risk.
 */
export const alwaysAsks = (name: string) => {
  if (opensPullRequestName(name)) return false;
  const words = nameWords(name);
  return (
    ALWAYS_SENSITIVE.test(name) ||
    openEnded(name) ||
    NEVER_LEADS.has(words[1] ?? "") ||
    words.some((w) => NEVER_FOR_GOOD.test(w))
  );
};

/** What a mailbox's scopes say is not high risk: a draft stays in the mailbox, reading and filing change nothing. */
const MAIL_QUIET = new Set(["mail:draft", "mail:read", "mail:organize"]);
/** Production, can't be undone, or leaves the company; mirrors the client's `approvalRisk` (`approval-kind.ts`). */
const RISKY_WORDS =
  /deploy|rollback|workflow|actions\.run|delete|remove|destroy|drop|purge|send|email|mail\b|sms|share|publish/i;
/**
 * Merge, deploy, rollback, sends, deletes and whatever else `alwaysAsks` names: a person covering someone decides
 * these only when that person turned it on (`approval_covers.risky`).
 */
export const highRisk = (tool: string, scope: string) =>
  !MAIL_QUIET.has(scope) && (alwaysAsks(tool) || ALWAYS_SENSITIVE.test(scope) || RISKY_WORDS.test(`${tool} ${scope}`));

/**
 * The kinds "Aprovar sempre" keeps for this call (`approval_rules`), the narrowest first: a saved rule of any of them
 * lets the call run without asking, and the first is what its card offers. Every call that asks has one (ADR 0173,
 * amended 2026-11-12), on every run a person, the agent, a routine or a routine's reading is behind: a merge, a
 * deploy and a tool that runs whatever its input says too. Only at the level that asks for some things: an agent that
 * always asks keeps no rule, and one that never asks needs none.
 *
 * - A mailbox's tools are never kept: a rule belongs to a connector's connection and theirs is the mail account, and
 *   whether a send asks is the mailbox's own setting, with its owner the one who decides.
 * - A tool that names one exact target per call (`rememberTarget`) is kept by that target alone.
 * - Our tools whose job is asking (`asksByChoice`) are never kept: the agent chose to ask.
 * - A tool that runs one shell command on the agent's computer (`rememberCommand`) is kept by the command's kind
 *   (`commandKind`: `gh pr merge`), for that agent alone. Only a command with no kind (a script, a pipeline) is kept
 *   by the tool itself, and that rule covers no command that has a kind.
 * - A tool that runs SQL (`sqlReads`) is kept by the reads of its project when the Postgres guard proves the call
 *   read-only, then by the tool itself.
 * - Any other is kept by its name and, when it runs other actions, by each action (none: the tool itself).
 */
export async function rememberKinds(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  authority: RunAuthority | null,
  level: ApprovalsLevel,
): Promise<RememberedKind[]> {
  if (!authority || level !== "risky" || tool.scope.startsWith("mail:")) return [];
  if (tool.rememberTarget && tool.connectionId) {
    const target = tool.rememberTarget(input);
    return target ? [{ tool: tool.name, actions: [target] }] : [];
  }
  if (asksByChoice(tool)) return [];
  const kinds: RememberedKind[] = [];
  if (tool.rememberCommand && !tool.connectionId) {
    const command = tool.rememberCommand(input);
    const kind = command ? (commandKind(command) ?? commandKind(command, true)) : null;
    // A command with a kind of its own is kept by that kind alone: the whole-tool rule someone kept on a script's
    // card must not also cover a merge or a deploy the computer holds.
    if (kind) return [{ tool: COMMAND_RULE_TOOL, actions: [kind] }];
  }
  if (tool.sqlReads && tool.connectionId) {
    const sql = input[tool.sqlReads.arg];
    if (typeof sql === "string" && (await provenReadOnly(sql))) {
      kinds.push({ tool: tool.sqlReads.tool, actions: [`${SQL_READS}${sqlReadsTarget(input, tool.sqlReads.arg)}`] });
    }
  }
  kinds.push({ tool: tool.rememberAs ?? tool.name, actions: tool.actions?.(input) ?? [] });
  return kinds;
}

/** Our own tools whose job is asking a person: the agent chose to ask, so one that never asks still does. */
const ASKING_TOOLS = new Set(["request_approval", REQUEST_PERMISSION_TOOL, "send_feedback"]);
export const asksByChoice = (tool: Pick<ToolDefinition, "name" | "scope" | "connectionId">) =>
  tool.connectionId ? tool.name === "request_branch_push" && serverGitTool(tool) : ASKING_TOOLS.has(tool.name);

/**
 * "Nunca perguntar" (`agents.approvals_level` = `never`, ADR 0173 as amended 2026-11-12): whether a call of this tool
 * runs without any card, on every run that has one (a person's, the agent's own, a routine's, one a routine's reading
 * feeds). Everything the agent may already use: merge, deploy, rollback, a tool that runs whatever its arguments say,
 * someone's mailbox, a command the computer holds, a workspace where every command asks. Only our tools whose job is
 * asking keep their card. It is the one place that says so: the call, the listing, a held command and the autonomy
 * brakes all read it. It lifts asking and nothing else: the policy's refusals, scopes, a tool turned off, the budget
 * and the tools' own checks all come before or apart from it. A call outside a run (a mission task's) has no level.
 */
export function unaskedAtNever(level: ApprovalsLevel, tool: ToolDefinition, authority: RunAuthority | null): boolean {
  return level === "never" && authority !== null && !asksByChoice(tool);
}

/**
 * Names of deletions, money and a pull request's approval, which "Sempre nesta rotina" never covers; a routine's send
 * or post is its job.
 */
const NEVER_IN_ROUTINE =
  /^(delete|deletes|deleted|remove|removes|destroy|drop|purge|erase|wipe|trash|truncate|overwrite|revoke|unbind|pay|pays|payment|payments|payout|payouts|refund|refunds|charge|charges|transfer|transfers|invoice|invoices|purchase|buy|renew|checkout|withdraw|withdrawal|approve|review|reviews)$/;
const neverInRoutine = (name: string) => nameWords(name).some((w) => NEVER_IN_ROUTINE.test(w));

/** Words of a tool that runs whatever its input says: code, a command, a script, a raw request, a query, a migration. */
const RUNS_ITS_INPUT = new Set(
  "run exec execute eval evaluate invoke trigger shell bash script command code terminal workbench proxy raw http query request call api function custom migration apply".split(
    " ",
  ),
);
/** Words of a call that posts in public, changes who gets in, moves money or puts other people's work away. */
const REACHES_FAR = new Set(
  "post posts tweet article pin video upload sharing collaborator member subscription budget clear archive cancel dns".split(
    " ",
  ),
);
/** A name that says all its call does, and nothing a person reads one by one: no merge, send, post, delete or payment. */
const plainAction = (name: string) =>
  !highRisk(name, "") &&
  actionLevel(name) !== "sensitive" &&
  !neverInRoutine(name) &&
  !nameWords(name).some((w) => RUNS_ITS_INPUT.has(w) || REACHES_FAR.has(w));

type AskedCall = Pick<
  Approval,
  "tool" | "scope" | "connectionId" | "highRisk" | "approvers" | "approveAlways" | "origin"
>;

/** A waiting call that is SQL the Postgres guard proved read-only when it asked (`rememberKinds`). */
export function readsSqlOnly(a: Pick<Approval, "approveAlways">): boolean {
  const kept = rememberedKindOf(a.approveAlways)?.actions ?? [];
  return kept.length > 0 && kept.every((action) => action.startsWith(SQL_READS));
}

/**
 * Whether a waiting call may be approved together with others in one tap, as far as its row tells. It errs towards
 * leaving a call on its own card: only a connected app's named action passes, or SQL proven read-only (`readsSqlOnly`).
 * Never one that is high risk, sends, posts, deletes or pays by any word of its name, runs whatever its input says
 * (Composio's executor too: nothing vouches for the actions its input names), asks by choice, or names who decides
 * (`request_approval`, someone's mailbox). Our own tools stay out whole: a command on the agent's computer, its
 * browser, the workspace's people, keys and settings. A row does not say why its call asked, so a name is never
 * enough: the connection has its say after this (`routineIds` in `approvals.ts`).
 */
export function routineCall(a: AskedCall): boolean {
  if (!a.connectionId || a.approvers || a.scope.startsWith("mail:")) return false;
  if (asksByChoice({ name: a.tool, scope: a.scope, connectionId: a.connectionId })) return false;
  if (readsSqlOnly(a)) return true;
  // At the level that asks for some things (the only one that offers a kind to keep), a person's run asks a
  // connected app's call only when the tool is marked to ask.
  if (!a.origin && a.approveAlways) return false;
  if (a.highRisk) return false;
  return [a.tool, ...(rememberedKindOf(a.approveAlways)?.actions ?? [])].every(plainAction);
}

/** The scope of the GitHub connector's `merge_pull_request`. */
const GITHUB_MERGE_SCOPE = "github:pr.merge";

/**
 * Approved ahead (ADR 0015 addendum, 2026-10-31): how long after its time the routine's run may still do an action
 * a person approved for it (a computer waking up, a slow start). Later it asks a person again.
 */
export const AHEAD_GRACE_MS = 30 * 60_000;

/** The built-in a routine's run does an action approved ahead with, by its id (the gateway runs the stored call). */
export const RUN_APPROVED_ACTION = "run_approved_action";

/** What a routine's run reads when it tries an action a person refused ahead of its time. */
export const AHEAD_REFUSED =
  "A person refused this exact action ahead of its time: don't do it, and don't try it another way. Say so in hand_off.";

/**
 * Why a call can't be approved ahead, or null when it can: a connected app's tool that allows it (`ahead`), whose
 * wrapped actions, when it runs others, are a shape we know, with nothing in its names, scope or actions that always
 * asks (merge, deploy, rollback and the rest of the never-for-good list above, GraphQL, SQL, a raw request).
 */
export function aheadRefusal(tool: ToolDefinition, input: Record<string, unknown>): string | null {
  if (!tool.ahead || !tool.connectionId) return "Only a connected app's own action can be approved ahead.";
  const actions = tool.actions ? tool.actions(input) : [];
  if (!actions) return "This call doesn't say which actions it runs, so it can't be approved ahead.";
  if ([tool.name, tool.rememberAs ?? "", tool.scope, ...actions].some((name) => name && alwaysAsks(name))) {
    return "Merge, deploy, rollback and the like can't be approved ahead.";
  }
  return null;
}

/** Hash an approval is bound to: tool, scope, connection and the exact parameters. */
export const actionHash = (action: {
  tool: string;
  scope: string;
  connectionId: string | null;
  params: Record<string, unknown>;
}) => sha256(canonicalJson(action));

export const APPROVAL_TTL_MS = 24 * 3600_000;
/** How much of a call's `describe().detail` an approval card keeps. */
export const APPROVAL_DETAIL_CHARS = 2000;
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
/** The most of a tool's output the model gets. */
export const MAX_RESULT_CHARS = 50_000;
/** Server-owned Git tools have a connection ID only to use that connection's credential. */
const serverGitTool = (tool: Pick<ToolDefinition, "name" | "scope">) =>
  (tool.name === "git_clone" && tool.scope === "github:git.read") ||
  (tool.name === "open_pull_request" && tool.scope === "github:pr.write") ||
  ((tool.name === "delete_branches" || tool.name === "request_branch_push") && tool.scope === "github:git.write");
/**
 * One of the server's own tools, never a connected app's: its name is written here, not by a workspace or by the
 * server it connected.
 */
const ownTool = (tool: Pick<ToolDefinition, "name" | "scope" | "connectionId">) =>
  !tool.connectionId || serverGitTool(tool);

/**
 * An `external` tool's output (an MCP server's answer) reaches the model inside the one envelope for
 * outside content (`untrustedBlock`): markers in it neutralised, so the text can't close the block
 * early. The result is already capped (`MAX_RESULT_CHARS`), so the envelope doesn't cut it again.
 */
export const wrapExternal = (source: string, text: string) => untrustedBlock(source, text, MAX_RESULT_CHARS + 100);
/** What run steps and approvals keep: the text people see, without the model's envelope. */
const shown = (text: string) =>
  cutText(text.replace(/^<external_data source="[^"]*">\n([\s\S]*)\n<\/external_data>$/, "$1"), 4000);

/**
 * An approved action already claimed (it runs at most once): what it returned, or, with nothing recorded
 * (it still runs elsewhere, or a restart or a dropped connection cut it), that it may not have finished.
 */
const ranBefore = (approval: { result: unknown }): ToolOutput =>
  (approval.result as ToolOutput | null) ?? {
    content:
      "This approved action was already started and its result isn't recorded: it may still be running, or it was cut off before finishing. Check its state before doing it again.",
    isError: true,
  };

/** The answer to a call that carries a credential (`carriesCredential`) on a run a routine's reading feeds (`fedByRoutine`). */
export const CREDENTIAL_REFUSAL =
  "Refused: this call carries what looks like a key, token or private key. Work that comes from a routine's background work never sends credentials anywhere: leave the value out (you may say one was found, and where).";

/** `ask_user` (questions.ts): it waits for a person, so it carries a `why` like an approval. */
const ASK_USER = "ask_user";

const isBuiltIn = (tool: Pick<ToolDefinition, "scope" | "connectionId">) => tool.scope === "" && !tool.connectionId;

/** `input` with the text under `from` moved to `to`; blank text stays, for the refusal to say `to` is missing. */
function renamed(input: Record<string, unknown>, from: string, to: string) {
  const { [from]: value, ...rest } = input;
  return typeof value !== "string" || !value.trim() || to in input ? input : { ...rest, [to]: value };
}

/**
 * The names models guess for a field of our tools when a computer brain's harness held the schema back. Only these:
 * a call that also has the real field stays as it is, and any other mistake is refused with what the tool takes.
 */
const INPUT_ALIASES = new Map<string, (input: Record<string, unknown>) => Record<string, unknown>>([
  ["offer_connect_app", (input) => renamed(input, "reason", "why")],
  ["browser_ask_person", (input) => renamed(input, "message", "instructions")],
  [
    "browser_do",
    (input) =>
      Array.isArray(input.steps)
        ? {
            ...input,
            steps: input.steps.map((s) => (s && typeof s === "object" ? renamed(s, "action", "do") : s)),
          }
        : input,
  ],
]);

/** Whether a call of this tool opens an approval card, by the policy's answer or the tool's own marks. */
const needsApproval = (tool: ToolDefinition, decision: PolicyDecision) =>
  decision.action === "approve" || isSensitive(tool);

/** Whether a call of this tool waits for a person: an approval, or a built-in question. */
const asksPerson = (tool: ToolDefinition, decision: PolicyDecision) =>
  needsApproval(tool, decision) || (tool.name === ASK_USER && isBuiltIn(tool));

/** A call that asks a person's approval because it says why (`whyAsks`: a command the computer held). */
const asksWithWhy = (tool: ToolDefinition, input: Record<string, unknown>) =>
  tool.whyAsks === true && input.why !== undefined;

/**
 * The card's reason for a command the computer held for a person (`command.approval_needed`), from what the computer
 * said (`approvalMessage`: "This is a merge: a person approves it first."); null for any other result. Also null when
 * the computer named a way that needs nobody (a push to the agent's own branch and a pull request), a secret read
 * (refused, never asked) or words it doesn't know (an older runner): the agent reads them and may still ask with why.
 */
function heldCommandReason(output: ToolOutput): string | null {
  if (output.data?.code !== "command.approval_needed") return null;
  const held = /^[^:]*: (.+?): a person approves it first\. (.*)$/s.exec(output.content);
  if (!held?.[1] || held[2]?.trim() !== ASK_AGAIN) return null;
  return `${held[1].trim()}, so the computer waits for a person's approval before running it.`;
}

/**
 * Whether the computer held a command for a person's approval, whatever else it offered: what an agent that never
 * asks runs again as approved. Not a secret read, which carries the same code but is refused, never asked.
 */
const heldForPerson = (output: ToolOutput) =>
  output.data?.code === "command.approval_needed" && heldMessage(output.content);

/** A check that failed for any reason never stops the action (ADR 0064): it only misses a notice. */
const UNCHECKED: TeamCheck = { proceed: true, reason: null };

/**
 * Why the agent may not call a tool that exists, in words it can pass on: turned off by name, a connector it holds
 * with less access than the tool needs (`request_permission` only offers what it has none of), or a permission it
 * can ask for. Each says who can change it.
 */
/**
 * The gateway's own refusals carry `data.refusal`, a word the apps say in the person's language under the call's line
 * (`chat.work.refusal.<refusal>`, as a refused command's code): the text itself is the agent's, in English.
 */
async function refusalOf(
  ctx: ToolContext,
  tool: ToolDefinition,
  access: ReturnType<typeof accessWithNeeds>,
  granted: Set<string>,
) {
  const of = access.of;
  if (access.state === "denied") {
    return `${of === tool ? "this tool" : of.name} is turned off for this agent, not for good: an admin can turn it back on, on the agent's page in Tools and access (in Portuguese, Ferramentas e acesso). Say so in plain words (the person asking may be that admin), never that it can't be done`;
  }
  if (of === tool && holdsConnection(granted, tool.connectionId)) {
    const level = /^custom:[^:]+:(read|write)$/.exec(tool.scope)?.[1];
    return `${tool.name} exists, but this agent's access to ${tool.connectorLabel ?? "its connector"} doesn't cover it (it needs ${level ? `${level} access` : `the scope ${tool.scope}`}). Only an admin can change that, on the agent's page in Tools and access (in Portuguese, Ferramentas e acesso): say so (the person asking may be that admin), never that the tool doesn't exist`;
  }
  const permission = of === tool && tool.connectionId ? `connector:${tool.connectionId}` : of.scope;
  if ((await missingPermissions(ctx)).some((m) => m.id === permission)) {
    return `this agent lacks the scope ${of.scope}. If the request needs it, call ${REQUEST_PERMISSION_TOOL} now with permission "${permission}": a card asks a person and your work goes on once they decide. Never ask the person to try again`;
  }
  return `this agent lacks the scope ${of.scope}, which ${REQUEST_PERMISSION_TOOL} can't offer. Only an admin can give it, on the agent's page in Tools and access (in Portuguese, Ferramentas e acesso): say so, never ask the person to try again`;
}

/** `permission_prompt`'s question (Claude Code and Codex commands): a new command, or the state of one asked. */
function promptQuestion(input: Record<string, unknown>) {
  if (typeof input.request_id === "string" && input.request_id) return { poll: input.request_id, action: null };
  const inner = input.input;
  const action =
    typeof input.tool_name === "string" && inner && typeof inner === "object" && !Array.isArray(inner)
      ? commandAction(input.tool_name, inner as Record<string, unknown>)
      : null;
  return { poll: null, action };
}

/**
 * A computer command's ending for the audit: allowed, refused, or waiting for a person. Asking again
 * about one still waiting is no new action (nothing to record).
 */
function promptOutcome(prompt: { poll: string | null }, output: ToolOutput): AuditOutcome | undefined {
  const answer = promptAnswer(output.content);
  if (answer.behavior === "allow") return "done";
  if (answer.behavior === "deny") return "refused";
  if (answer.status === "pending") return prompt.poll ? undefined : "pending";
  return output.isError ? "failed" : undefined;
}

/**
 * A costly step of a run (ADR 0131 §3): the call's own (`costlyKind`), or a long run's (`LONG_STEPS` calls already),
 * counted only for runs the brakes apply to.
 */
async function costOf(ctx: ToolContext, name: string, input: Record<string, unknown>): Promise<CostKind | null> {
  const own = costlyKind(name, input);
  if (own) return own;
  // Polling a held prompt is no new step.
  if (name === PERMISSION_TOOL && typeof input.request_id === "string") return null;
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(agentRunSteps)
    .where(and(eq(agentRunSteps.runId, ctx.runId), eq(agentRunSteps.kind, "tool_call")));
  return Number(row?.n ?? 0) > LONG_STEPS ? "long" : null;
}

/** Who is behind the call's run (ADR 0053). Null for a mission task's call: no run, the mission's own gates. */
const authorityOf = (ctx: ToolContext): Promise<RunAuthority | null> =>
  ctx.runId ? runAuthorityById(ctx.db, ctx.orgId, ctx.runId) : Promise.resolve(null);

const ALLOWED: PolicyDecision = { action: "allow" };
const policyFor = (
  authority: RunAuthority | null,
  tool: ToolDefinition,
  level = DEFAULT_APPROVALS_LEVEL,
  creatorDecides = false,
) => (authority ? toolPolicy(authority, tool, level, creatorDecides) : ALLOWED);

/**
 * A tool as a run sees it: one the policy says asks a person becomes sensitive (its card, and the
 * "asks a person's approval" in a directory), and every tool that asks a person takes the required
 * `why` the card shows. The same list goes to the model loop and to the bridge.
 */
function asListed(tool: ToolDefinition, decision: PolicyDecision, never = false): ToolDefinition {
  // An agent that never asks sees the tool as it runs for it: no card, no `why`.
  if (never && needsApproval(tool, decision)) return { ...tool, sensitive: false, unasked: true };
  if (!asksPerson(tool, decision)) return tool;
  return {
    ...tool,
    ...(decision.action === "approve" ? { sensitive: true } : {}),
    // A tool whose own `why` is only for a command the computer held: when every call asks, the reason is required.
    inputSchema: withWhy(tool.inputSchema, tool.whyAsks === true && needsApproval(tool, decision)),
  };
}

export type ToolCall = { toolUseId: string; name: string; input: Record<string, unknown> };
export type Approval = typeof approvals.$inferSelect;

export type InvokeResult =
  /**
   * `ran`: the action approved ahead this call did, as it is now (its cards are told, `invokeWithChip`).
   * `autoApproved`: a rule ("Aprovar sempre") let it run, whose person and whether a reads one (its live line).
   */
  | { type: "result"; output: ToolOutput; ran?: Approval; autoApproved?: { by: string | null; reads: boolean } }
  | { type: "approval"; approval: Approval }
  /** `ask_user`: the executor posts the question and suspends the run. */
  | { type: "question"; text: string; choices: string[] | null; requestedForUserId: string | null; why: string }
  /** `request_secret`: the executor posts the card and suspends the run. */
  | { type: "secret"; requestId: string };

/**
 * The only way an agent's tool call runs (docs/adr/0015). For each call:
 * 1. the tool is looked up by name in the run's tool set (never trusting the
 *    model's claim of what it is);
 * 2. the agent's scope for it is read from `agent_scopes` (a prompt can't change it);
 * 3. the input is validated against the tool's JSON Schema;
 * 4. the run's policy (`run-policy.ts`: who is behind the run) refuses it,
 *    lets it run, or makes it ask a person;
 * 5. a call that asks a person (an approval, `ask_user`) must say why: the
 *    `why` is taken out of the input and kept on the approval or question;
 * 6. sensitive tools (and a `whyAsks` tool's call that says why) create an
 *    `approvals` row bound to the action hash and stop there, unless a rule
 *    someone approved for good covers the call ("Aprovar sempre",
 *    `approval_rules`); others run, with errors turned into error results. A
 *    tool that runs other actions (Composio's executor) is the connection's
 *    read when every action it runs only reads;
 * 7. `tool_call` / `tool_result` / `approval` steps are recorded;
 * 8. an outside call (a connected app's write, a command that leaves the
 *    computer) is held once when the team already did it to the same target,
 *    and recorded for the team once it went out (ADR 0064, `team-actions.ts`).
 */
/** A tool's answer carries text from outside the org (ADR 0117): an external or reading tool that said something. */
const readsOutsideText = (tool: ToolDefinition, output: ToolOutput) =>
  Boolean(tool.external || tool.readsOutside) && output.content.trim() !== "";

export function createToolGateway(deps: {
  sources: ToolSource[];
  now?: () => Date;
  /** What this server can connect: `find_tools` names each connector a search asks for that the agent lacks. */
  catalog?: ServerCatalog;
  /**
   * Said after one of our own tools breaks with an error nobody wrote for the model (`isUnexpectedError`): where the
   * server takes feedback, that the agent may offer a report (`APP_FAULT_HINT`, ADR 0160 §12).
   */
  faultHint?: string;
  /** Live events (the autonomy brakes' proposal card, ADR 0131). */
  pubsub?: PubSub;
}) {
  const now = deps.now ?? (() => new Date());

  async function allTools(ctx: ToolContext) {
    const byName = new Map<string, ToolDefinition>();
    const rightHand = isRightHand(await getAgentCached(ctx.db, ctx.orgId, ctx.agentId));
    for (const source of deps.sources) {
      for (const tool of await source.tools(ctx)) {
        if (!TOOL_NAME.test(tool.name)) continue;
        if (rightHand && RIGHT_HAND_NOT_OFFERED.has(tool.name)) continue;
        const current = byName.get(tool.name);
        // A connected MCP server must not shadow one of our own tools just
        // because its source appears earlier in the list.
        if (!current || (current.connectionId && ownTool(tool))) byName.set(tool.name, tool);
      }
    }
    return byName;
  }

  /**
   * Every tool this agent may call now: every source, filtered by granted scopes and by the run's
   * policy (a refused tool isn't listed), by name. Tools that ask a person carry the required `why`.
   * `heldBack` collects the names its scopes grant that the run's policy refused.
   */
  async function granted(ctx: ToolContext, heldBack?: string[]): Promise<ToolDefinition[]> {
    return grantedFor(ctx, await authorityOf(ctx), undefined, heldBack);
  }

  /** `known`: this call's `allTools`, when already read. */
  async function grantedFor(
    ctx: ToolContext,
    authority: RunAuthority | null,
    known?: Map<string, ToolDefinition>,
    heldBack?: string[],
  ): Promise<ToolDefinition[]> {
    const [keys, all, level, decides] = await Promise.all([
      grantedScopeKeys(ctx.db, ctx.orgId, ctx.agentId),
      known ?? allTools(ctx),
      approvalsLevelOf(ctx.db, ctx.orgId, ctx.agentId),
      creatorDecides(ctx, authority),
    ]);
    return [...all.values()]
      .filter((t) => isAllowed(accessWithNeeds(keys, t).state))
      .flatMap((t) => {
        const decision = policyFor(authority, t, level, decides);
        if (decision.action !== "refuse") return [asListed(t, decision, unaskedAtNever(level, t, authority))];
        heldBack?.push(t.name);
        return [];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * What `find_tools` names as not allowed yet: every tool of this server's sources the agent may not use
   * (and the run could, once allowed), with each permission `request_permission` offers for it (its own,
   * and the one of a tool it `needs`), so the card can grant what the agent asks for; or none when an admin
   * turned that tool, or the one it needs, off by name; or an empty list for one more scope of a connector the
   * agent already has some of, which only an admin gives. Any other permission `request_permission` doesn't offer
   * (a mailbox's or a database's the agent has nothing of) isn't named.
   */
  async function notAllowed(
    ctx: ToolContext,
    authority: RunAuthority | null,
    all: Map<string, ToolDefinition>,
  ): Promise<BlockedTool[]> {
    const [keys, missing] = await Promise.all([
      grantedScopeKeys(ctx.db, ctx.orgId, ctx.agentId),
      missingPermissions(ctx),
    ]);
    const offered = new Map(missing.map((m) => [m.id, m]));
    return [...all.values()].flatMap((tool): BlockedTool[] => {
      const own = toolAccess(keys, tool);
      const needs = tool.needs && { scope: tool.needs.scope, state: toolAccess(keys, tool.needs) };
      const lacks = [
        ...(isAllowed(own) ? [] : [tool.connectionId ? `connector:${tool.connectionId}` : tool.scope]),
        ...(needs && !isAllowed(needs.state) ? [needs.scope] : []),
      ];
      if (lacks.length === 0 || policyFor(authority, tool).action === "refuse") return [];
      if (own === "denied" || needs?.state === "denied") return [{ tool, permissions: null }];
      const asked = lacks.flatMap((id) => offered.get(id) ?? []);
      // A connector the agent holds with less access than this tool needs: only an admin changes that.
      if (asked.length < lacks.length) {
        return !isAllowed(own) && holdsConnection(keys, tool.connectionId) ? [{ tool, permissions: [] }] : [];
      }
      // The computer's scopes ("all tools" never covers them) say what they give, for the person approving.
      const permissions = asked.map((m) => {
        const plain = NOT_IN_ALL.has(m.scope) ? BUILTIN_SCOPES[m.scope]?.description : undefined;
        return { id: m.id, label: plain ? `${m.label}: ${plain}` : m.label };
      });
      return [{ tool, permissions }];
    });
  }

  /**
   * Tools this agent may call now, as the model sees them: each big
   * connector listed as its directory, and with tools on demand
   * (`ctx.loadedGroups`, ADR 0043) the groups not loaded behind `find_tools` /
   * `use_tool` (tools/directory.ts).
   */
  async function list(ctx: ToolContext): Promise<ToolDefinition[]> {
    return presentTools(await granted(ctx), isSensitive, ctx.loadedGroups);
  }

  /** A connector's call counts toward its usage (ADR 0103), whatever it returned. `approvalsGiven` 1: an approved one. */
  async function run(
    tool: ToolDefinition,
    input: Record<string, unknown>,
    ctx: ToolContext,
    approvalsGiven = 0,
  ): Promise<ToolOutput> {
    const output = await outputOf(tool, input, ctx);
    if (tool.connector) {
      const { orgId, agentId } = ctx;
      const errors = output.isError ? 1 : 0;
      await countToolCall(ctx.db, { orgId, agentId, connector: tool.connector, calls: 1, errors, approvalsGiven });
    }
    return output;
  }

  async function outputOf(tool: ToolDefinition, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutput> {
    const done = startInFlight(`tool ${tool.name}`, ctx.runId);
    try {
      const output = await tool.execute(input, ctx);
      if (output.outcome) {
        await recordOutcome(ctx.db, {
          orgId: ctx.orgId,
          agentId: ctx.agentId,
          runId: ctx.runId,
          channelId: ctx.channelId,
          threadRootId: ctx.threadRootId,
          source: "tool",
          ...output.outcome,
        }).catch(() => {});
      }
      // A NUL or a lone surrogate (a binary printed by a command) would make every save of this result fail.
      const text = pgSafeText(output.content);
      const capped = {
        ...output,
        content: text.length > MAX_RESULT_CHARS ? `${cutText(text, MAX_RESULT_CHARS)}\n[truncated]` : text,
      };
      return tool.external ? { ...capped, content: wrapExternal(tool.name, capped.content) } : capped;
    } catch (error) {
      const message = pgSafeText(error instanceof Error ? error.message : String(error));
      // Our own tool breaking in a way nobody foresaw is the app's fault, not the agent's nor an outside service's.
      const hint =
        deps.faultHint && !tool.external && !tool.connectionId && isUnexpectedError(error) ? deps.faultHint : "";
      // An MCP server's error text is its own words too.
      return {
        content: `Tool failed: ${tool.external ? wrapExternal(tool.name, message) : message}${hint && `\n${hint}`}`,
        isError: true,
        ...(error instanceof ToolOffError ? { data: { toolOff: error.toolOff } } : {}),
      };
    } finally {
      done();
    }
  }

  /**
   * `schedule_action` (`ToolContext.prepareAhead`, ADR 0015 addendum): the call a routine's run will make at its
   * time, checked now as it will be then (a connected app's write that asks a person, the agent's scope, the input,
   * no credential, the arguments' rules), then asked now: an approval of that exact call for that run (`routine_id`,
   * `run_at`), where the person is. Deciding it resumes this run; the action itself waits for its time.
   */
  async function prepareAhead(
    ctx: ToolContext,
    authority: RunAuthority | null,
    request: AheadRequest,
  ): Promise<AheadOutcome> {
    const no = (message: string): AheadOutcome => ({ ok: false, message });
    if (authority?.kind !== "person") return no("Only a person's request can have an action approved ahead.");
    const tool = (await allTools(ctx)).get(request.tool.trim());
    if (!tool)
      return no(`No tool named "${request.tool}": use its exact name (a big connector's find_tools gives it).`);
    const input = takeWhy(tool.inputSchema, request.input).input;
    const refusal = aheadRefusal(tool, input);
    if (refusal) return no(refusal);
    const actions = tool.actions?.(input) ?? [];
    if (toolKind(tool).kind !== "external" || (actions.length > 0 && actions.every((a) => actionLevel(a) === "read"))) {
      return no("This doesn't ask a person at its time: there is nothing to approve ahead.");
    }
    const access = accessWithNeeds(await freshGrantedKeys(ctx.db, ctx.orgId, ctx.agentId), tool);
    if (!isAllowed(access.state)) return no(`Not allowed: this agent lacks the scope ${access.of.scope}.`);
    const problems = validateJson(tool.inputSchema, input);
    if (problems.length > 0) {
      return no(
        `Invalid arguments: ${problems.join("; ")}\nInput schema of ${tool.name}: ${compactSchema(tool.inputSchema)}`,
      );
    }
    // The routine's run is nobody's: it never sends a credential (ADR 0053 §3).
    if (carriesCredential(input)) return no(CREDENTIAL_REFUSAL);
    const check = await checkToolCall(tool, input, ctx);
    if (!check.ok) return no(check.message);
    const slot = await request.slot();
    const [owner, origin, level] = await Promise.all([
      ownerOf(ctx),
      ctx.runId ? consultationOrigin(ctx.db, ctx.orgId, ctx.runId) : null,
      approvalsLevelOf(ctx.db, ctx.orgId, ctx.agentId),
    ]);
    // An agent that never asks: nothing waits for approval, so the stored call is the run's to do at its time.
    const unasked = unaskedAtNever(level, tool, authority);
    const described = tool.describe?.(input) ?? { title: tool.name, detail: canonicalJson(input) };
    const connectionId = tool.connectionId ?? null;
    const [approval] = await ctx.db
      .insert(approvals)
      .values({
        orgId: ctx.orgId,
        runId: ctx.runId,
        agentId: ctx.agentId,
        channelId: origin?.channelId ?? ctx.channelId,
        threadRootId: origin?.threadRootId ?? ctx.threadRootId,
        toolUseId: ctx.toolUseId ?? crypto.randomUUID(),
        tool: tool.name,
        scope: tool.scope,
        connectionId,
        params: input,
        actionHash: actionHash({ tool: tool.name, scope: tool.scope, connectionId, params: input }),
        title: cutMarked(described.title, 300),
        detail: cutMarked(described.detail ?? "", APPROVAL_DETAIL_CHARS),
        why: request.why,
        ownerUserId: owner,
        requestedByUserId: authority.personId,
        highRisk: highRisk(tool.name, tool.scope),
        // Decided by its time at the latest (else its run asks then), and within a day like any request.
        expiresAt: new Date(Math.min(slot.runAt.getTime(), now().getTime() + APPROVAL_TTL_MS)),
        routineId: slot.routineId,
        runAt: slot.runAt,
        ...(unasked ? { status: "approved" as const, decidedAt: now() } : {}),
      })
      .returning();
    if (!approval) throw new Error("approval insert returned nothing");
    if (unasked) {
      const [routine] = await ctx.db
        .select({ timezone: routines.timezone })
        .from(routines)
        .where(and(eq(routines.id, slot.routineId), eq(routines.orgId, ctx.orgId)));
      const when = describeWhen(slot.runAt, routine?.timezone ?? "UTC");
      return {
        ok: true,
        approval,
        scheduled: `Set, with nobody asked since you never ask: «${approval.title}» goes out by itself ${when}. Tell the person it's set, with that day and time in their words. To change its content or time, call schedule_action again with replaces set to ${approval.id}.`,
      };
    }
    if (tool.connector) {
      const { orgId, agentId } = ctx;
      await countToolCall(ctx.db, { orgId, agentId, connector: tool.connector, approvalsAsked: 1 });
    }
    return { ok: true, approval };
  }

  /**
   * What a person last decided ahead about this exact call (its hash) for this routine run's slot, while that slot
   * is within its grace: approved and not run yet, or refused. The latest decision wins: the same post refused and
   * then prepared again and approved goes out, and one approved and then refused on another card doesn't. One the
   * agent set by itself while it never asked (approved, with nobody deciding) counts only while it still never asks:
   * narrowed since, the call asks.
   */
  async function aheadFor(ctx: ToolContext, brief: RoutineBrief, hash: string, level: ApprovalsLevel) {
    const slot = new Date(brief.dueAt);
    if (!UUID.test(brief.routineId) || Number.isNaN(slot.getTime())) return null;
    if (slot.getTime() < now().getTime() - AHEAD_GRACE_MS) return null;
    const [row] = await ctx.db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.orgId, ctx.orgId),
          eq(approvals.agentId, ctx.agentId),
          eq(approvals.routineId, brief.routineId),
          eq(approvals.runAt, slot),
          eq(approvals.actionHash, hash),
          inArray(approvals.status, ["approved", "refused"]),
          level === "never" ? undefined : or(eq(approvals.status, "refused"), isNotNull(approvals.decidedByUserId)),
          isNull(approvals.executedAt),
        ),
      )
      .orderBy(desc(approvals.decidedAt), desc(approvals.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** The routine a run works for, when it is still this agent's. */
  async function routineOf(ctx: ToolContext, brief: RoutineBrief) {
    const [row] = await ctx.db
      .select({
        ownActions: routines.ownActions,
        creator: routines.createdByUserId,
        owner: agents.ownerUserId,
        target: routines.target,
      })
      .from(routines)
      .innerJoin(agents, and(eq(agents.id, routines.agentId), eq(agents.orgId, routines.orgId)))
      .where(
        and(
          eq(routines.id, brief.routineId),
          eq(routines.orgId, ctx.orgId),
          eq(routines.agentId, ctx.agentId),
          isNull(routines.deletedAt),
        ),
      );
    return row ?? null;
  }

  /** Whether a routine's own run has a creator who still decides its agent's approvals (`toolPolicy`). Read fresh. */
  async function creatorDecides(ctx: ToolContext, authority: RunAuthority | null) {
    if (authority?.kind !== "routine" || !authority.brief || !UUID.test(authority.brief.routineId)) return false;
    const row = await routineOf(ctx, authority.brief);
    return row?.creator ? decidesAgentApprovals(ctx.db, ctx.orgId, row.creator, row.owner) : false;
  }

  /** The messages a run read after its trigger, as they joined it (between steps or live: `steeredMessageIds`). */
  async function joinedReads(ctx: ToolContext, runId: string) {
    const steps = await ctx.db
      .select({ data: agentRunSteps.data })
      .from(agentRunSteps)
      .where(
        and(
          eq(agentRunSteps.orgId, ctx.orgId),
          eq(agentRunSteps.runId, runId),
          eq(agentRunSteps.kind, "context"),
          sql`${agentRunSteps.data} ? 'steeredMessageIds'`,
        ),
      );
    const ids = steps.flatMap((s) => (Array.isArray(s.data.steeredMessageIds) ? s.data.steeredMessageIds : []));
    return [...new Set(ids)].filter((id): id is string => typeof id === "string" && UUID.test(id));
  }

  /** The notice a message is, as the server wrote it; never a person's message. */
  async function noticeOfMessage(ctx: ToolContext, messageId: string) {
    const [m] = await ctx.db
      .select({ authorType: messages.authorType, meta: messages.meta })
      .from(messages)
      .where(and(eq(messages.orgId, ctx.orgId), eq(messages.id, messageId)));
    if (!m || m.authorType === "person") return null;
    return (m.meta.notice ?? null) as { kind?: unknown; refs?: Record<string, unknown> } | null;
  }

  /** The run that asked the question a `consult_reply` notice answers, when a teammate of this agent answered it. */
  async function answeredAsker(ctx: ToolContext, notice: { kind?: unknown; refs?: Record<string, unknown> } | null) {
    const id = notice?.kind === "consult_reply" ? notice.refs?.consultationId : null;
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const [c] = await ctx.db
      .select({ askerRunId: agentConsultations.askerRunId, targetAgentId: agentConsultations.targetAgentId })
      .from(agentConsultations)
      .where(
        and(
          eq(agentConsultations.orgId, ctx.orgId),
          eq(agentConsultations.id, id),
          eq(agentConsultations.askerAgentId, ctx.agentId),
          eq(agentConsultations.kind, "question"),
          eq(agentConsultations.status, "answered"),
        ),
      );
    return c && c.targetAgentId !== ctx.agentId ? c.askerRunId : null;
  }

  /**
   * Whether a run nobody is behind still does routine `routineId`'s own job (ADR 0053, addendum 2026-11-13): that
   * routine's report woke it (`routine_handoff`) and nothing joined it since, or a teammate's answer to a question a
   * run doing that job asked woke it (that routine's own run included) and what joined it since is only more answers
   * to that run's questions. Walked through the server's links (a notice's run, a consultation's asker), never text.
   */
  async function onOwnJob(ctx: ToolContext, routineId: string) {
    let runId = ctx.runId;
    let mustBeRoutine = false;
    for (let depth = 0; depth <= MAX_AUTHORITY_CHAIN; depth++) {
      const [run] = await ctx.db
        .select({
          agentId: agentRuns.agentId,
          background: agentRuns.background,
          triggerMessageId: agentRuns.triggerMessageId,
          transcript: agentRuns.transcript,
        })
        .from(agentRuns)
        .where(and(eq(agentRuns.orgId, ctx.orgId), eq(agentRuns.id, runId)));
      if (!run || run.agentId !== ctx.agentId) return false;
      if (run.background) {
        const [trigger] = await ctx.db
          .select({ meta: messages.meta })
          .from(messages)
          .where(and(eq(messages.orgId, ctx.orgId), eq(messages.id, run.triggerMessageId)));
        return routineBriefOf(trigger?.meta)?.routineId === routineId;
      }
      // A person who wrote into a run is behind it from then on: what it asked is theirs, not the routine's.
      if (mustBeRoutine || steeredByOf(run.transcript)) return false;
      const notice = await noticeOfMessage(ctx, run.triggerMessageId);
      const joined = await joinedReads(ctx, runId);
      if (notice?.kind === "routine_handoff") {
        const reporter = notice.refs?.runId;
        if (joined.length > 0 || typeof reporter !== "string" || !UUID.test(reporter)) return false;
        runId = reporter;
        mustBeRoutine = true;
        continue;
      }
      const asker = await answeredAsker(ctx, notice);
      if (!asker) return false;
      for (const id of joined) if ((await answeredAsker(ctx, await noticeOfMessage(ctx, id))) !== asker) return false;
      runId = asker;
    }
    return false;
  }

  /**
   * Whether a routine's run may do this call without a card (`routines.own_actions`, ADR 0053 §2 addendum of
   * 2026-11-03: setting the routine up approved its job, so it doesn't ask every run). Every action the call runs is one its creator
   * allowed for the routine, the call could be approved ahead at all (`aheadRefusal`: a connected app's own action,
   * nothing that runs whatever its input says, never merge, deploy, rollback and the like), and the creator still
   * decides this agent's approvals. Read fresh: a removed action or a creator who lost the right asks at once.
   */
  async function ownJobCovers(
    ctx: ToolContext,
    brief: RoutineBrief,
    tool: ToolDefinition,
    input: Record<string, unknown>,
  ) {
    if (!UUID.test(brief.routineId) || aheadRefusal(tool, input)) return false;
    const names = tool.actions ? tool.actions(input) : [tool.name];
    if (!names?.length) return false;
    const row = await routineOf(ctx, brief);
    if (!row?.creator || row.ownActions.length === 0) return false;
    const own = new Set(row.ownActions.map((a) => a.toLowerCase()));
    if (!names.every((n) => own.has(n.toLowerCase()))) return false;
    return decidesAgentApprovals(ctx.db, ctx.orgId, row.creator, row.owner);
  }

  /**
   * What "Sempre nesta rotina" keeps for a call a routine's run asks about, or null when it isn't offered. Its name
   * says it all: the actions `ownJobCovers` would then let run, none a merge, a deploy or the like (`aheadRefusal`) nor
   * a deletion or a payment (`neverInRoutine`), for a live routine with room for them, that isn't a widget's. Not for
   * a call with its own approvers (someone's mailbox: only they say yes). A creator who no longer decides this
   * agent's approvals makes own actions ask anyway, so it isn't offered either.
   */
  async function routineKind(
    ctx: ToolContext,
    brief: RoutineBrief,
    tool: ToolDefinition,
    input: Record<string, unknown>,
  ): Promise<RememberedKind | null> {
    if (!UUID.test(brief.routineId) || tool.approvers || aheadRefusal(tool, input)) return null;
    const names = tool.actions ? tool.actions(input) : [tool.name];
    if (!names?.length || !names.every((n) => OWN_ACTION_NAME.test(n))) return null;
    if ([tool.name, tool.scope, ...names].some(neverInRoutine)) return null;
    const row = await routineOf(ctx, brief);
    if (!row?.creator || row.target.type === "widget") return null;
    if (new Set([...row.ownActions, ...names]).size > MAX_OWN_ACTIONS) return null;
    if (!(await decidesAgentApprovals(ctx.db, ctx.orgId, row.creator, row.owner))) return null;
    return { tool: tool.name, actions: names, routineId: brief.routineId };
  }

  /** The one merge a call of the GitHub connector makes, or null. */
  function mergeOfCall(tool: ToolDefinition, input: Record<string, unknown>): MergeDone | null {
    if (tool.scope !== GITHUB_MERGE_SCOPE) return null;
    const [repo, ...others] = reposOfGithubCall(input) ?? [];
    const pr = Number(input.pullNumber);
    if (!repo || others.length > 0 || !Number.isInteger(pr) || pr <= 0) return null;
    return { repo, pr, ref: null };
  }

  /**
   * "Pode fazer merge sem perguntar": the merge a call of the GitHub connector makes, when it is in a repository this
   * agent merges in without asking. A command on the computer is told the same list and decides there (`mergeRepos`).
   */
  async function connectorMerge(ctx: ToolContext, tool: ToolDefinition, input: Record<string, unknown>) {
    const merge = mergeOfCall(tool, input);
    if (!merge) return null;
    const allowed = await mergeReposOfCall(ctx);
    return allowed.some((r) => r.toLowerCase() === merge.repo.toLowerCase()) ? merge : null;
  }

  /** The call an action approved ahead stores, by its id (`run_approved_action`), when it is this agent's. */
  async function storedAhead(ctx: ToolContext, id: unknown) {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const [row] = await ctx.db
      .select({ tool: approvals.tool, params: approvals.params, why: approvals.why, runAt: approvals.runAt })
      .from(approvals)
      .where(and(eq(approvals.id, id), eq(approvals.orgId, ctx.orgId), eq(approvals.agentId, ctx.agentId)));
    return row?.runAt ? row : null;
  }

  /** What the run that asked reads once a person approved its action ahead: when it goes out by itself. */
  async function aheadNote(ctx: ToolContext, approval: Approval & { runAt: Date }) {
    const [routine] = approval.routineId
      ? await ctx.db
          .select({ timezone: routines.timezone })
          .from(routines)
          .where(and(eq(routines.id, approval.routineId), eq(routines.orgId, ctx.orgId)))
      : [];
    return `Approved ahead: «${approval.title}» goes out by itself ${describeWhen(approval.runAt, routine?.timezone ?? "UTC")}, without asking again. Tell the person it's set, with that day and time in their words. To change its content or time, call schedule_action again with replaces set to ${approval.id}.`;
  }

  /**
   * Runs an approved action, exactly as hashed: the stored params, the same tool and scope, at most once. Scope and
   * the arguments' rules are re-checked (they may have changed while it waited). `toolUseId`: the call it answers.
   */
  async function runApproved(ctx: ToolContext, approval: Approval, toolUseId: string): Promise<ToolOutput> {
    if (approval.status !== "approved") return { content: "This action was not approved", isError: true };
    if (approval.executedAt) return ranBefore(approval);
    const expected = actionHash({
      tool: approval.tool,
      scope: approval.scope,
      connectionId: approval.connectionId,
      params: approval.params,
    });
    const tool = (await allTools(ctx)).get(approval.tool);
    // Why the approved action can't run any more; null = it may.
    const refusal = async (): Promise<string | null> => {
      if (expected !== approval.actionHash) return "Approval does not match the action";
      if (!tool || tool.scope !== approval.scope || (tool.connectionId ?? null) !== approval.connectionId)
        return `The tool ${approval.tool} is no longer available (its connector was removed or changed since the approval): say so, and that once it's connected again, asking again runs it`;
      const access = accessWithNeeds(await freshGrantedKeys(ctx.db, ctx.orgId, ctx.agentId), tool);
      if (!isAllowed(access.state))
        return `Not allowed: this agent lost the scope ${access.of.scope} since the approval. An admin can give it back on the agent's page in Tools and access (in Portuguese, Ferramentas e acesso); then asking again runs it`;
      // Rules about the arguments again: a repository or recipient may have been removed while waiting.
      const check = await checkToolCall(tool, approval.params, ctx);
      return check.ok ? null : check.message;
    };
    let output: ToolOutput;
    let outside = false;
    const refused = await refusal();
    if (refused || !tool) output = { content: refused ?? "Not allowed", isError: true };
    else {
      // Claim the execution first: a retried job never runs the action twice. One approved ahead may have been
      // withdrawn or lapsed since it was read: only a row still approved runs.
      const claimed = await ctx.db
        .update(approvals)
        .set({ executedAt: now() })
        .where(
          sql`${approvals.id} = ${approval.id} and ${approvals.executedAt} is null
            and (${approvals.runAt} is null or ${approvals.status} = 'approved')`,
        )
        .returning({ id: approvals.id });
      if (claimed.length === 0) {
        const [row] = await ctx.db
          .select({ result: approvals.result, status: approvals.status })
          .from(approvals)
          .where(sql`${approvals.id} = ${approval.id}`);
        if (approval.runAt && row?.status !== "approved") {
          return { content: "This action was not approved", isError: true };
        }
        return ranBefore(row ?? approval);
      }
      output = await run(tool, approval.params, { ...ctx, toolUseId, approved: true }, 1);
      outside = readsOutsideText(tool, output);
      // Team actions (ADR 0064): what a person approved and went out is the team's too.
      if (isOutsideTool(tool) && !output.isError) {
        await recordTeamAction(ctx.db, {
          orgId: ctx.orgId,
          agentId: ctx.agentId,
          runId: ctx.runId || null,
          channelId: approval.channelId,
          source: "approval",
          tool: tool.name,
          summary: summarizeCall(tool, approval.params),
          targets: callTargets(approval.params, output.data),
        });
      }
    }
    await ctx.db
      .update(approvals)
      .set({ result: { content: shown(output.content), isError: output.isError === true } })
      .where(sql`${approvals.id} = ${approval.id}`);
    recordRead(ctx.runId, approval.tool, output.content, output.data, approval.params);
    await addRunStep(ctx.db, { id: ctx.runId, orgId: ctx.orgId }, "tool_result", {
      toolUseId,
      name: approval.tool,
      approvalId: approval.id,
      isError: output.isError === true,
      content: shown(output.content),
      ...(tool?.external ? { external: true } : {}),
      ...(output.data || outside ? { data: { ...output.data, ...(outside ? { outside: true } : {}) } } : {}),
    });
    // The audit: the approved action ran (or couldn't any more). Who approved it is the approval's row.
    if (tool) {
      const kind = toolKind(tool).kind;
      const outcome: AuditOutcome = refused ? "refused" : output.isError ? "failed" : "done";
      if (auditsCall(kind, tool, outcome)) {
        await recordToolCall(ctx.db, {
          orgId: ctx.orgId,
          agentId: ctx.agentId,
          runId: ctx.runId || null,
          channelId: approval.channelId,
          authority: await authorityOf(ctx).catch(() => null),
          tool: tool.name,
          kind,
          connector: tool.connectorLabel ?? null,
          title: approval.title,
          input: approval.params,
          outcome,
          reason: outcome === "done" ? null : shown(output.content),
          approvalId: approval.id,
        });
      }
    }
    return output;
  }

  return {
    list,
    granted,

    async invoke(ctx: ToolContext, raw: ToolCall): Promise<InvokeResult> {
      // The model's arguments land in jsonb and text columns (steps, approvals, the audit): a NUL would fail them.
      const requested = { ...raw, input: pgSafeJson(raw.input) };
      // Who is behind the run decides what it may do: listing already hid refused tools, this is the call.
      const [all, authority, level] = await Promise.all([
        allTools(ctx),
        authorityOf(ctx),
        approvalsLevelOf(ctx.db, ctx.orgId, ctx.agentId),
      ]);
      // A directory (tools/directory.ts): `use_tool` runs the tool it names by that tool's own name, so everything
      // below (steps, policy, scope, schema, checks, approval) is that tool's; `find_tools` runs as is. Any tool goes
      // through any `use_tool`, a directory's own and one already listed too: a computer brain's harness may still
      // list what it had when it started, and one the agent may not use is refused below, saying why.
      let call = requested;
      // An action approved ahead, by its id (`run_approved_action`): its stored call goes the way a direct call
      // does, with its reason, so the approval it meets below is the one a person gave for this run.
      const named = all.get(call.name);
      if (named?.name === RUN_APPROVED_ACTION && isBuiltIn(named)) {
        const stored = await storedAhead(ctx, call.input.id);
        if (stored) call = { ...call, name: stored.tool, input: { why: stored.why, ...stored.params } };
      }
      let directoryTool: ToolDefinition | undefined;
      let unknownInDirectory: string | null = null;
      if (!all.has(call.name)) {
        const usable = await grantedFor(ctx, authority, all);
        const blocked = async () => {
          const [tools, connectors] = await Promise.all([
            notAllowed(ctx, authority, all).catch(() => []),
            deps.catalog
              ? missingConnectors(ctx.db, ctx.orgId, deps.catalog, { usable, listed: all.values() }).catch(() => [])
              : [],
          ]);
          const ask = usable.some((t) => t.name === REQUEST_PERMISSION_TOOL) ? REQUEST_PERMISSION_TOOL : null;
          return { tools, ask, connectors };
        };
        const resolved = resolveCall(presentTools(usable, isSensitive, ctx.loadedGroups, blocked), all, call);
        if ("error" in resolved) unknownInDirectory = resolved.error;
        else {
          call = resolved.call;
          directoryTool = resolved.find;
        }
      }
      const viaDirectory = call !== requested;
      const step = { id: ctx.runId, orgId: ctx.orgId };
      // A mission task's call through the bridge has no run (ADR 0032): nothing to record steps on.
      const record: typeof addRunStep = (db, run, kind, data) =>
        ctx.runId ? addRunStep(db, run, kind, data) : Promise.resolve();
      let tool = unknownInDirectory ? undefined : (all.get(call.name) ?? directoryTool);
      const alias = tool && !tool.connectionId ? INPUT_ALIASES.get(tool.name) : undefined;
      if (alias) call = { ...call, input: alias(call.input) };
      // What the live chip shows (the short label of a built-in tool, never a connector's input; the app and its
      // service): the chat's line of this call says the same after the run. A permission check also keeps its
      // command, masked, to open.
      const detail = toolDetail(call.name, call.input);
      const command = toolCommand(call.name, call.input);
      await record(ctx.db, step, "tool_call", {
        toolUseId: call.toolUseId,
        name: call.name,
        input: call.input,
        ...(detail ? { detail } : {}),
        ...(command ? { command } : {}),
        // What the name was resolved to, kept with the call: the same name may be a connected server's another day.
        ...(tool && ownTool(tool) ? { builtIn: true } : {}),
        ...(tool?.connectorLabel ? { connector: tool.connectorLabel } : {}),
        ...(tool?.service ? { service: tool.service } : {}),
        ...(tool?.serviceIcon ? { serviceIcon: tool.serviceIcon } : {}),
      });
      /** The rules ("Aprovar sempre") this call ran under instead of asking. */
      let approvedBy: string[] | null = null;
      /** What the call's line in the chat says of it: approved by a rule, whose person, a read-only SQL one or not. */
      let autoApproved: { by: string | null; reads: boolean } | null = null;
      /** It ran without the card it would have opened, because its agent never asks (`unaskedAtNever`). */
      let unasked = false;
      // The audit (agent-audit.ts): every call that matters, with how it ended. A routine's belongs where it
      // delivers, never to its room.
      const actionChannel =
        authority?.kind === "routine" ? (authority.brief?.deliverTo.channelId ?? ctx.channelId) : ctx.channelId;
      const audit = (
        outcome: AuditOutcome,
        extra: {
          reason?: string | null;
          refusal?: string | null;
          approvalId?: string;
          secretRequestId?: string;
          about?: ToolCallSubject | null;
        } = {},
      ) => {
        if (!tool) return Promise.resolve();
        const kind = toolKind(tool).kind;
        if (!auditsCall(kind, tool, outcome)) return Promise.resolve();
        return recordToolCall(ctx.db, {
          orgId: ctx.orgId,
          agentId: ctx.agentId,
          runId: ctx.runId || null,
          channelId: actionChannel || null,
          authority,
          tool: tool.name,
          kind,
          connector: tool.connectorLabel ?? null,
          title: callTitle(tool, call.input),
          input: call.input,
          outcome,
          approvalRules: approvedBy,
          unasked: unasked && outcome !== "refused",
          ...extra,
        });
      };
      /**
       * `outcome`: what the audit says; none for a call that never really was one (a malformed input). `ran`: the
       * tool itself answered (not a gateway refusal).
       */
      const finish = async (output: ToolOutput, outcome?: AuditOutcome, ran = false) => {
        // A result read from outside marks the run (`runReadOutside`, ADR 0117), an error too: its text came from there.
        const outside = ran && tool && readsOutsideText(tool, output) ? { outside: true } : null;
        const data = output.data || outside ? { ...output.data, ...outside } : null;
        recordRead(ctx.runId, call.name, output.content, output.data, call.input);
        await record(ctx.db, step, "tool_result", {
          toolUseId: call.toolUseId,
          name: call.name,
          isError: output.isError === true,
          content: shown(output.content),
          // `shown` drops the outside-content envelope; learning still needs to know the text came from outside.
          ...(tool?.external ? { external: true } : {}),
          ...(data ? { data } : {}),
          ...(autoApproved ? { autoApproved } : {}),
        });
        const refusal = typeof output.data?.refusal === "string" ? output.data.refusal : null;
        if (outcome)
          await audit(
            outcome,
            outcome === "done" ? { about: callSubject(output) } : { reason: shown(output.content), refusal },
          );
        return { type: "result" as const, output, ...(autoApproved ? { autoApproved } : {}) };
      };

      if (unknownInDirectory) return finish({ content: unknownInDirectory, isError: true });
      if (!tool) return finish({ content: `Unknown tool ${call.name}`, isError: true });
      // A tool that runs other actions (Composio's executor): a call whose actions all only read is the
      // connection's read, when the agent may read the connection. Everything below then sees a read.
      if (tool.actions && tool.readScope) {
        const bare = takeWhy(tool.inputSchema, call.input).input;
        const actions = tool.actions(bare);
        if (actions?.length && actions.every((a) => actionLevel(a) === "read")) {
          const read: ToolDefinition = { ...tool, scope: tool.readScope, sensitive: false };
          const keys = await freshGrantedKeys(ctx.db, ctx.orgId, ctx.agentId);
          if (isAllowed(accessWithNeeds(keys, read).state)) {
            tool = read;
            call = { ...call, input: bare };
          }
        }
      }
      // The same tool running only actions that open a pull request is judged as a connected app's own tool for it.
      if (tool.actions && !opensPullRequest(tool)) {
        const actions = tool.actions(takeWhy(tool.inputSchema, call.input).input);
        if (actions?.length && actions.every(opensPullRequestName)) tool = { ...tool, opensPullRequest: true };
      }
      if (tool.sensitive && tool.asksNobody?.(call.input)) tool = { ...tool, sensitive: false };
      const builtIn = isBuiltIn(tool);
      const decides = level === "risky" && (await creatorDecides(ctx, authority));
      // A call that only looks is judged as at the default level: an agent that always asks asks for changes.
      const decision = policyFor(
        authority,
        tool,
        tool.looksOnly?.(call.input) ? DEFAULT_APPROVALS_LEVEL : level,
        decides,
      );
      if (decision.action === "refuse") {
        return finish(
          { content: decision.reason, isError: true, data: { code: "tool.not_allowed", refusal: "policy" } },
          "refused",
        );
      }
      // A directory's search lists only tools the agent already holds; each real tool is checked on its own.
      if (tool !== directoryTool) {
        const granted = await freshGrantedKeys(ctx.db, ctx.orgId, ctx.agentId);
        const access = accessWithNeeds(granted, tool);
        if (!isAllowed(access.state)) {
          const refusal = await refusalOf(ctx, tool, access, granted);
          return finish(
            { content: `Not allowed: ${refusal}`, isError: true, data: { refusal: "noAccess" } },
            "refused",
          );
        }
      }
      // A call that asks a person says why (shown on its card); the tool itself never sees it. It is
      // asked for last: a call refused for any other reason (its input, a repository outside the agent's
      // list) gets that reason first.
      const never = unaskedAtNever(level, tool, authority);
      const wouldAsk = needsApproval(tool, decision) || asksWithWhy(tool, call.input);
      unasked = never && wouldAsk;
      let approves = wouldAsk && !never;
      // Only its `why` makes it ask: a command the computer holds, or (a merge this agent does alone) doesn't.
      const askedByWhy = approves && decision.action !== "approve" && !isSensitive(tool);
      let why = "";
      let whyMissing = false;
      if (asksPerson(tool, decision) || asksWithWhy(tool, call.input)) {
        const taken = takeWhy(tool.inputSchema, call.input);
        why = taken.why ?? "";
        whyMissing = !taken.why && !unasked;
        call = { ...call, input: taken.input };
      }
      // Team actions (ADR 0064): an outside call repeated after the agent was told the team already did it
      // may say why (kept on the record); the tool never sees it.
      const outside = isOutsideTool(tool);
      let repeatWhy: string | null = null;
      const schemaProps = tool.inputSchema.properties as Record<string, unknown> | undefined;
      if (outside && !asksPerson(tool, decision) && "why" in call.input && schemaProps?.why === undefined) {
        const { why: given, ...rest } = call.input;
        repeatWhy = typeof given === "string" ? given : null;
        call = { ...call, input: rest };
      }
      // A key for a service we connect natively opens no card: the agent gets the way in. `person_said` is only ever
      // offered by that answer, so the tool's schema doesn't carry it.
      if (tool.name === REQUEST_SECRET_TOOL && !tool.connectionId) {
        const { person_said: said, ...asked } = call.input;
        call = { ...call, input: asked };
        if (deps.catalog) {
          const tools = { usable: await grantedFor(ctx, authority, all), all: [...all.values()] };
          const way = await connectorFirst(ctx, deps.catalog, asked, String(said ?? ""), tools).catch(() => null);
          if (way) return finish({ content: way, data: { code: "secret.connector_first" } });
        }
      }
      const problems = validateJson(tool.inputSchema, call.input);
      if (problems.length > 0) {
        // Through a directory the model never saw the schema up front: show it, so the next call can be right.
        const listed = asListed(tool, decision, never);
        const schemaHint = viaDirectory ? `\nInput schema of ${tool.name}: ${compactSchema(listed.inputSchema)}` : "";
        // Everything the call lacks in one answer: told one field at a time, a model swaps one for the other.
        const needsWhy = whyMissing ? `. ${WHY_REFUSAL}` : "";
        return finish({ content: `Invalid input: ${problems.join("; ")}${needsWhy}${schemaHint}`, isError: true });
      }
      // A run a routine's reading feeds never sends a credential anywhere (ADR 0053 §3): a key it read on its
      // computer (a sandbox that can't keep it from being read) can't leave through any tool, on any brain. Any
      // other run uses the agent's own grants, as a person's does.
      if (fedByRoutine(authority) && carriesCredential(call.input)) {
        return finish(
          { content: CREDENTIAL_REFUSAL, isError: true, data: { code: "tool.credential", refusal: "credential" } },
          "refused",
        );
      }
      // The call's arguments (GitHub repositories, mail folders and recipients…), before running or asking anyone.
      const check = await checkToolCall(tool, call.input, ctx);
      if (!check.ok) return finish({ content: check.message, isError: true, data: check.data ?? {} }, "refused");
      // A brain's own merge is refused with "ask with run_code and why": whether it may run alone is the computer's to
      // say, so that one command goes there first. Held after all, it asks with this why, whatever the computer offered.
      const script = askedByWhy ? tool.rememberCommand?.(call.input) : null;
      const computerDecides = Boolean(script && loneMerge(script)) && (await mergeReposOfCall(ctx)).length > 0;
      if (computerDecides) approves = false;
      // "Aprovar sempre": a call of a kind someone approved for good runs like an allowed one, why or not.
      const ruled = tool;
      /** The first saved rule that covers the call, kept for its line in the chat and the audit. */
      const coveredBy = async (kinds: RememberedKind[]) => {
        const at = { orgId: ctx.orgId, agentId: ctx.agentId, connectionId: ruled.connectionId ?? null };
        for (const kind of kinds) {
          const rules = await coveringRules(ctx.db, at, kind);
          if (!rules) continue;
          approvedBy = rules;
          autoApproved = {
            by: await rulesApprover(ctx.db, rules),
            reads: kind.actions.some((a) => a.startsWith(SQL_READS)),
          };
          return true;
        }
        return false;
      };
      const kinds = approves ? await rememberKinds(tool, call.input, authority, level) : [];
      const remember = kinds[0] ?? null;
      if (await coveredBy(kinds)) approves = false;
      // The routine's own job: an action its creator allowed when they set it up runs like an allowed one, every run,
      // unless its agent always asks. The run its report woke does that job too, and so does the run a teammate's
      // answer to that job's question woke (`onOwnJob`, ADR 0053, addendum 2026-11-13): anything else that woke or
      // joined it (the end of a task, another routine's report, another agent's message) is not the job the person
      // set up, and would choose an allowed action's arguments.
      const ownJobBrief =
        !approves || level === "always"
          ? null
          : authority?.kind === "routine"
            ? authority.brief
            : authority?.kind === "unattended" &&
                fedByRoutine(authority) &&
                authority.brief &&
                (await onOwnJob(ctx, authority.brief.routineId))
              ? authority.brief
              : null;
      const ownJob = ownJobBrief ? await ownJobCovers(ctx, ownJobBrief, tool, call.input) : false;
      if (ownJob) approves = false;
      // A routine's own run puts Vault keys in a command only where its creator allowed them, or its agent never asks
      // (ADR 0144 §2): else a person says yes first, and "Sempre nesta rotina" keeps those keys as the routine's own.
      const keyNames =
        tool.name === RUN_CODE_TOOL && !tool.connectionId && !never && authority?.kind === "routine" && authority.brief
          ? keysOfCall(call.input)
          : [];
      const keysAt =
        keyNames.length > 0 && authority?.kind === "routine" && authority.brief
          ? { orgId: ctx.orgId, agentId: ctx.agentId, routineId: authority.brief.routineId }
          : null;
      const keysAsk =
        keysAt && UUID.test(keysAt.routineId) && !(await routineKeysAllowed(ctx.db, keysAt, keyNames))
          ? (level !== "always" && (await routineKeysKind(ctx.db, keysAt, tool.name, keyNames))) || false
          : null;
      if (keysAsk !== null) approves = true;
      // "Pode fazer merge sem perguntar": a merge in a repository its owner or an admin chose, with no card. An agent
      // that never asks merges anywhere it may, and leaves the same receipt.
      const mergeAlone: MergeDone | null = approves
        ? await connectorMerge(ctx, tool, call.input)
        : unasked
          ? mergeOfCall(tool, call.input)
          : null;
      if (mergeAlone) approves = false;
      // Approved ahead: the exact call a person approved for this routine run's slot runs like an allowed one, why
      // or not; the one they refused never runs, whatever the agent's level, a write its creator's run does unasked too.
      const ahead =
        (approves || unasked || decides) && authority?.kind === "routine" && authority.brief
          ? await aheadFor(
              ctx,
              authority.brief,
              actionHash({
                tool: tool.name,
                scope: tool.scope,
                connectionId: tool.connectionId ?? null,
                params: call.input,
              }),
              level,
            )
          : null;
      if (ahead?.status === "refused") {
        return finish({ content: AHEAD_REFUSED, isError: true, data: { code: "approval.ahead_refused" } }, "refused");
      }
      if (whyMissing && !approvedBy && !ahead && !ownJob && !mergeAlone)
        return finish({ content: WHY_REFUSAL, isError: true, data: { code: "tool.why_missing" } });
      // Costly work nobody asked for directly (ADR 0131 §3): a person's go first, on every brain.
      const isPrompt = tool.name === PERMISSION_TOOL && builtIn;
      const cost = ctx.runId && unrequested(authority) ? await costOf(ctx, tool.name, call.input) : null;
      if (cost) {
        const refusal = await costlyGate(
          { db: ctx.db, pubsub: deps.pubsub },
          {
            orgId: ctx.orgId,
            agentId: ctx.agentId,
            runId: ctx.runId,
            channelId: ctx.channelId,
            threadRootId: ctx.threadRootId,
          },
          authority,
          cost,
          toolCommand(call.name, call.input) ?? callTitle(tool, call.input) ?? tool.name,
          never,
        );
        if (refusal) {
          const content = isPrompt
            ? JSON.stringify({ behavior: "deny", message: refusal.message, code: "autonomy" })
            : refusal.message;
          return finish({ content, isError: !isPrompt, data: { code: refusal.code } }, "refused");
        }
      }
      const withRepo = (output: ToolOutput): ToolOutput =>
        check.data ? { ...output, data: { ...output.data, ...check.data } } : output;

      // Team actions (ADR 0064): before acting outside, has the team already done this to the same target?
      const prompt = tool.name === PERMISSION_TOOL && builtIn ? promptQuestion(call.input) : null;
      const targets = outside ? callTargets(call.input) : (prompt?.action?.targets ?? []);
      let teamReason: string | null = null;
      if (outside || prompt?.action) {
        const seen = await checkTeamAction(ctx.db, ctx, {
          tool: prompt?.action?.tool ?? tool.name,
          targets,
          why: repeatWhy ?? (why || null),
        }).catch(() => UNCHECKED);
        if (!seen.proceed) {
          // A computer command is answered the way its prompt expects: a refusal with the notice.
          const content = prompt
            ? JSON.stringify({ behavior: "deny", message: seen.notice, code: "team" })
            : seen.notice;
          return finish({ content, isError: !prompt, data: { code: "team.action_seen" } }, "refused");
        }
        teamReason = seen.reason;
      }
      const recordAction = (input: {
        source: "tool" | "command";
        tool: string;
        summary: string;
        targets: string[];
        ref?: string;
      }) =>
        recordTeamAction(ctx.db, {
          orgId: ctx.orgId,
          agentId: ctx.agentId,
          runId: ctx.runId || null,
          channelId: actionChannel || null,
          reason: teamReason,
          ...input,
        });

      // Its tool_result step, audit and team action are the approved action's own (`runApproved`).
      if (ahead) {
        const output = withRepo(await runApproved(ctx, ahead, call.toolUseId));
        const [ran] = await ctx.db.select().from(approvals).where(eq(approvals.id, ahead.id));
        return { type: "result", output, ...(ran ? { ran } : {}) };
      }
      const askPerson = async (why: string, remember: RememberedKind | null): Promise<InvokeResult> => {
        const owner = await ownerOf(ctx);
        // A routine's request goes to the conversation it reports to, never its room; one asked by another
        // agent (ADR 0034) where the person is, not in the agents' DM.
        // Consulted for a creator outside its agent's audience: it stays in the agents' DM (`answersAgentsOnly`).
        const deliverTo =
          authority?.kind === "routine" && !(ctx.runId && (await answersAgentsOnly(ctx.db, ctx.orgId, ctx.runId)))
            ? authority.brief?.deliverTo
            : undefined;
        const origin = deliverTo
          ? { channelId: deliverTo.channelId, threadRootId: deliverTo.threadId ?? ctx.threadRootId }
          : ctx.runId
            ? await consultationOrigin(ctx.db, ctx.orgId, ctx.runId)
            : null;
        const asked = tool.approvers
          ? await tool.approvers(
              call.input,
              ctx,
              authority ? (authority.personId ?? routineCreatorOf(authority)) : null,
            )
          : null;
        if (asked && !asked.ok) return finish({ content: asked.message, isError: true }, "refused");
        const described = tool.describe?.(call.input) ?? { title: `${tool.name}`, detail: canonicalJson(call.input) };
        const connectionId = tool.connectionId ?? null;
        const [approval] = await ctx.db
          .insert(approvals)
          .values({
            orgId: ctx.orgId,
            runId: ctx.runId,
            missionId: tool.missionId ?? null,
            agentId: ctx.agentId,
            channelId: origin?.channelId ?? ctx.channelId,
            threadRootId: origin?.threadRootId ?? ctx.threadRootId,
            toolUseId: call.toolUseId,
            tool: tool.name,
            scope: tool.scope,
            connectionId,
            params: call.input,
            actionHash: actionHash({ tool: tool.name, scope: tool.scope, connectionId, params: call.input }),
            title: cutMarked(described.title, 300),
            detail: cutMarked(described.detail ?? "", APPROVAL_DETAIL_CHARS),
            why,
            origin: authority ? approvalOrigin(authority) : null,
            ownerUserId: owner,
            expiresAt: new Date(now().getTime() + APPROVAL_TTL_MS),
            approveAlways: remember,
            approvers: asked?.approvers ?? null,
            requestedByUserId: authority ? (authority.personId ?? routineCreatorOf(authority)) : null,
            highRisk: highRisk(tool.name, tool.scope),
          })
          .onConflictDoNothing()
          .returning();
        // The same call asked again (a retried job) finds the first request: no second one to count.
        if (approval && tool.connector) {
          const { orgId, agentId } = ctx;
          await countToolCall(ctx.db, { orgId, agentId, connector: tool.connector, approvalsAsked: 1 });
        }
        const row =
          approval ??
          (
            await ctx.db
              .select()
              .from(approvals)
              .where(and(eq(approvals.runId, ctx.runId), eq(approvals.toolUseId, call.toolUseId)))
          )[0];
        if (!row) throw new Error("approval insert returned nothing");
        await record(ctx.db, step, "approval", { approvalId: row.id, toolUseId: call.toolUseId, title: row.title });
        await audit("pending", { reason: why || null, approvalId: row.id });
        return { type: "approval", approval: row };
      };
      if (approves) {
        // A card of a run doing a routine's job (its own run, or one its report or a teammate's answer woke:
        // `ownJobBrief`) offers "Sempre nesta rotina" where the action can be its own: the narrower word for the same
        // job. Not for an agent that always asks: its routine's own actions ask too.
        const own = keysAsk
          ? keysAsk
          : keysAsk === null && ownJobBrief
            ? await routineKind(ctx, ownJobBrief, tool, call.input)
            : null;
        return askPerson(why, own ?? remember);
      }
      const runCtx: ToolContext = { ...ctx, toolUseId: call.toolUseId };
      // Our own tools only (`schedule_action`), never a connected server's.
      if (!tool.connectionId) runCtx.prepareAhead = (request) => prepareAhead(runCtx, authority, request);
      let output = withRepo(await run(tool, call.input, runCtx));
      // The computer held a command for a person (a merge, a deploy): the card goes out now, as a call with `why`
      // would have asked, so it never rests on the agent calling again. Approved, it runs the approved way.
      const held = tool.whyAsks && ctx.runId && !ctx.approved ? heldCommandReason(output) : null;
      const stillAsks = computerDecides && output.data?.code === "command.approval_needed";
      if (tool.whyAsks && !ctx.approved && heldForPerson(output)) {
        // An agent that never asks, or a kind someone approved for good ("Aprovar sempre"): the computer ran nothing
        // when it held the command, so running it again the approved way does it once. What it never runs (a push
        // our git proxy refuses) comes back refused again.
        const heldKinds = never ? [] : await rememberKinds(tool, call.input, authority, level);
        if (never || (await coveredBy(heldKinds))) {
          output = withRepo(await run(tool, call.input, { ...runCtx, approved: true }));
          unasked = never;
        } else if (held || stillAsks) {
          return askPerson(why || (held ?? ""), heldKinds[0] ?? null);
        }
      } else if (held || stillAsks) {
        return askPerson(why || (held ?? ""), (await rememberKinds(tool, call.input, authority, level))[0] ?? null);
      }
      const merged = mergeAlone ?? (tool.whyAsks ? (output.data?.merge as MergeDone | undefined) : null);
      if (merged && !output.isError) await recordMergeDone(ctx, merged, tool.name).catch(() => {});
      if (outside && !output.isError) {
        await recordAction({
          source: "tool",
          tool: tool.name,
          summary: summarizeCall(tool, call.input),
          targets: callTargets(call.input, output.data),
        });
      }
      if (prompt) {
        const answer = promptAnswer(output.content);
        if (prompt.action && (answer.behavior === "allow" || answer.status === "pending")) {
          // A command waiting for a person counts already; it goes away if they say no.
          await recordAction({
            source: "command",
            tool: prompt.action.tool,
            summary: prompt.action.command,
            targets: prompt.action.targets,
            ...(answer.status === "pending" && answer.request_id ? { ref: answer.request_id } : {}),
          });
        }
        if (prompt.poll && answer.behavior === "deny") await forgetPendingCommand(ctx.db, ctx.orgId, prompt.poll);
      }
      if (builtIn && output.waitForAnswer?.text) {
        return { type: "question", ...output.waitForAnswer, why };
      }
      const asked = tool.connectionId ? undefined : output.waitForApproval;
      if (asked) {
        await record(ctx.db, step, "approval", { approvalId: asked.id, toolUseId: call.toolUseId, title: asked.title });
        await audit("pending", { reason: asked.why || null, approvalId: asked.id });
        return { type: "approval", approval: asked };
      }
      if (!tool.connectionId && output.waitForSecret?.requestId) {
        // The reader follows the request (delivered, declined, expired) from here.
        await audit("pending", { secretRequestId: output.waitForSecret.requestId });
        return { type: "secret", requestId: output.waitForSecret.requestId };
      }
      return finish(output, prompt ? promptOutcome(prompt, output) : output.isError ? "failed" : "done", true);
    },

    /**
     * What a decision resumes (the run that asked): the approved action, run once exactly as hashed. One approved
     * ahead waits for its time instead: the routine's run then does it (`aheadFor`), and this run hears when.
     */
    async executeApproved(ctx: ToolContext, approval: Approval): Promise<ToolOutput> {
      const runAt = approval.runAt;
      if (approval.status === "approved" && runAt) return { content: await aheadNote(ctx, { ...approval, runAt }) };
      return runApproved(ctx, approval, approval.toolUseId);
    },
  };

  async function ownerOf(ctx: ToolContext) {
    const rows = await ctx.db
      .select({ ownerUserId: agents.ownerUserId })
      .from(agents)
      .where(sql`${agents.id} = ${ctx.agentId} and ${agents.orgId} = ${ctx.orgId}`);
    return rows[0]?.ownerUserId ?? null;
  }
}

export type ToolGateway = ReturnType<typeof createToolGateway>;
