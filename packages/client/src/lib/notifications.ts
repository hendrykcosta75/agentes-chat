/**
 * The inbox's pure rules: which filter an item is
 * in, what is visible, how live events and my own actions change a loaded
 * page (and its counts), the day groups, where an item opens, how I answer
 * it, and the "Lembrar depois" times. No React, no i18n: the page turns these
 * into words.
 */
import type {
  AiStatus,
  AppNotification,
  NotificationCounts,
  NotificationFilter,
  NotificationKind,
  NotificationPage,
} from "../api/types";
import { billingHoldOf } from "./billing";
import type { Words } from "./routine-view";
import { secretNoticeLine } from "./secret-requests";

/** The inbox's filters, each counted ("Concluídas" is apart: `done`). */
export const NOTIFICATION_FILTERS = ["all", "mentions", "waiting", "unread", "reactions"] as const satisfies Exclude<
  NotificationFilter,
  "done"
>[];

/** Kinds counted under "Menções": someone talks to me. */
const MENTION_KINDS: NotificationKind[] = ["mention", "dm", "agent_question"];

/**
 * Waiting ones in this order: an agent's secret request (it expires in minutes), an agent's question, an
 * approval, someone asking to join (nobody's work waits on it), then what the right hand found to fix.
 */
const WAITING_ORDER: NotificationKind[] = [
  "secret_request",
  "agent_question",
  "approval",
  "join_request",
  "team_watch",
];

export const isSnoozed = (n: Pick<AppNotification, "snoozedUntil">, now = Date.now()) =>
  !!n.snoozedUntil && new Date(n.snoozedUntil).getTime() > now;

/** In the inbox at all: not done and not snoozed. */
export const isVisible = (n: Pick<AppNotification, "doneAt" | "snoozedUntil">, now = Date.now()) =>
  !n.doneAt && !isSnoozed(n, now);

export function matchesFilter(n: AppNotification, filter: NotificationFilter, now = Date.now()) {
  if (filter === "done") return !!n.doneAt;
  if (!isVisible(n, now)) return false;
  switch (filter) {
    case "all":
      return true;
    case "mentions":
      return MENTION_KINDS.includes(n.kind);
    case "waiting":
      return n.waiting;
    case "unread":
      return n.readAt === null;
    case "reactions":
      return n.kind === "reaction";
  }
}

/** Server order: waiting first, then the most recently updated. */
export function compareNotifications(a: AppNotification, b: AppNotification) {
  if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** "Concluídas": the latest marked done first. */
const compareDone = (a: AppNotification, b: AppNotification) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "");

/** The waiting section's order (question, approval), the newest first within a kind. */
export function sortWaiting(list: AppNotification[]) {
  return [...list].sort(
    (a, b) => WAITING_ORDER.indexOf(a.kind) - WAITING_ORDER.indexOf(b.kind) || b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** How the counts move when one item changes from `before` to `after` (either may be missing). */
export function countsDelta(
  counts: NotificationCounts,
  before: AppNotification | undefined,
  after: AppNotification | undefined,
  now = Date.now(),
): NotificationCounts {
  const next = { ...counts };
  for (const f of NOTIFICATION_FILTERS) {
    const was = before ? matchesFilter(before, f, now) : false;
    const is = after ? matchesFilter(after, f, now) : false;
    next[f] = Math.max(0, next[f] + (is ? 1 : 0) - (was ? 1 : 0));
  }
  return next;
}

/** The pages of one filter's list (React Query's infinite data). */
export interface NotificationPages {
  pages: NotificationPage[];
  pageParams: unknown[];
}

const findIn = (data: NotificationPages, id: string) => {
  for (const p of data.pages) {
    const hit = p.items.find((n) => n.id === id);
    if (hit) return hit;
  }
  return undefined;
};

/**
 * One item changed (a live event, or my own action): it leaves every page,
 * comes back in place on the first page when it still matches the filter,
 * and the counts move. `before` is the item as known anywhere (another
 * filter's list) when this list doesn't have it.
 */
export function upsertInPages(
  data: NotificationPages,
  filter: NotificationFilter,
  item: AppNotification,
  before?: AppNotification,
  now = Date.now(),
): NotificationPages {
  const old = findIn(data, item.id) ?? before;
  const [first, ...rest] = data.pages.map((p) => ({ ...p, items: p.items.filter((n) => n.id !== item.id) }));
  if (!first) return data;
  const items = matchesFilter(item, filter, now)
    ? [...first.items, item].sort(filter === "done" ? compareDone : compareNotifications)
    : first.items;
  return {
    ...data,
    pages: [{ ...first, items, counts: countsDelta(first.counts, old, item, now) }, ...rest],
  };
}

/** Gone (auto-resolved): out of every page, and out of the counts. */
export function removeFromPages(
  data: NotificationPages,
  id: string,
  before?: AppNotification,
  now = Date.now(),
): NotificationPages {
  const old = findIn(data, id) ?? before;
  const pages = data.pages.map((p) => ({ ...p, items: p.items.filter((n) => n.id !== id) }));
  const [first, ...rest] = pages;
  if (!first) return data;
  return { ...data, pages: [{ ...first, counts: countsDelta(first.counts, old, undefined, now) }, ...rest] };
}

/** The server's numbers for the badge win over what we counted. */
export function withServerCounts(data: NotificationPages, unread: number, waiting: number): NotificationPages {
  const [first, ...rest] = data.pages;
  if (!first) return data;
  return { ...data, pages: [{ ...first, counts: { ...first.counts, unread, waiting } }, ...rest] };
}

export const allItems = (data: NotificationPages | undefined) => data?.pages.flatMap((p) => p.items) ?? [];

export type DayGroup = "today" | "yesterday" | "week" | "older";
export const DAY_GROUPS: DayGroup[] = ["today", "yesterday", "week", "older"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Hoje, Ontem, Esta semana (the last 7 days), Mais antigas: by the last update, in local time. */
export function dayGroupOf(iso: string, now = new Date()): DayGroup {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "older";
}

/** Not waiting, by day group, in order; empty groups left out. `at`: the time it goes by ("Concluídas": `doneAt`). */
export function groupByDay(
  list: AppNotification[],
  now = new Date(),
  at: (n: AppNotification) => string = (n) => n.updatedAt,
): [DayGroup, AppNotification[]][] {
  const out = new Map<DayGroup, AppNotification[]>(DAY_GROUPS.map((g) => [g, []]));
  for (const n of [...list].sort((a, b) => at(b).localeCompare(at(a)))) out.get(dayGroupOf(at(n), now))?.push(n);
  return [...out].filter(([, l]) => l.length > 0);
}

/** The DM's or message's channel. */
export const channelOf = (n: Pick<AppNotification, "source">) => n.source.channelId ?? n.source.dmId ?? null;

/**
 * Who asks to join in a request notice: the first people who asked, in that order (the notice's time is the first
 * one's), and how many asked in all. A notice from before it kept the names has the newest one's only.
 */
export const askersOf = (n: Pick<AppNotification, "count" | "latest">) => ({
  names: n.latest.names?.length ? n.latest.names : [n.latest.title ?? ""],
  total: n.count,
});

/**
 * What the workspace itself tells, with nobody behind it (its computer is ready, its standing changed, one of its
 * agents was held): its headline's key, the held agent's name as `name` (`source.label`); null for what someone did.
 */
export function workspaceHeadline(n: Pick<AppNotification, "kind" | "latest">) {
  if (n.kind === "computer_ready") return "computerSetup.notification.ready" as const;
  if (n.kind === "composio_limit") return "connectors.composio.limitNotice" as const;
  if (n.kind === "computer_disk_full") return "machines.shared.diskFullNotice" as const;
  if (n.kind === "computer_no_chrome") return "machines.chromeMissingNotice" as const;
  if (n.kind === "skill_update") {
    const to = n.latest.statusTo;
    return to === "waiting"
      ? n.latest.reason === "edited" && !n.latest.title
        ? ("skills.notice.waitingEdited" as const)
        : ("skills.notice.waiting" as const)
      : to === "failed"
        ? ("skills.notice.failed" as const)
        : to === "edited"
          ? ("skills.notice.edited" as const)
          : ("skills.notice.updated" as const);
  }
  if (n.kind !== "org_standing") return null;
  const to = n.latest.statusTo;
  const billing = billingHoldOf({ state: "hold", reason: n.latest.billingHold ?? null });
  if (to === "hold" && billing) return `standing.notification.billing.${billing}` as const;
  return to === "suspended"
    ? ("standing.notification.suspended" as const)
    : to === "active"
      ? ("standing.notification.active" as const)
      : to === "agent_hold"
        ? ("standing.notification.agentHold" as const)
        : ("standing.notification.hold" as const);
}

/**
 * The restriction a notice of agentes.chat Cloud tells, as `restrictionLine` reads it: an agent held (its kind, as a
 * refused run carries it), or the workspace held or suspended with a reason (`latest.cloud`), so `review` reads as the
 * review line and an operator's reason with how to contest it. Null for any other notice, which keeps its own text.
 */
export function restrictionOf(n: Pick<AppNotification, "kind" | "latest">) {
  const l = n.latest;
  if (n.kind !== "org_standing") return null;
  if (l.statusTo === "agent_hold") return { code: "agent.paused", facts: { kind: l.holdKind, cloud: true } };
  if (!l.cloud || !l.text || (l.statusTo !== "hold" && l.statusTo !== "suspended")) return null;
  return { code: l.statusTo === "hold" ? "org.paused" : "org.suspended", facts: { reason: l.text, cloud: true } };
}

/** What the right hand's notice may be about (`latest.reason`), each worded by `notifications.teamWatch.<cause>`. */
export const TEAM_WATCH_CAUSES = [
  "sign_in",
  "connector",
  "mailbox",
  "database",
  "budget_out",
  "budget_low",
  "computer",
] as const;
export type TeamWatchCause = (typeof TEAM_WATCH_CAUSES)[number];

/** The way out of each cause, the notice's one button (`notifications.teamWatch.act.<act>`). */
const TEAM_WATCH_ACT = {
  sign_in: "sign_in",
  connector: "reconnect",
  mailbox: "reconnect",
  database: "reconnect",
  budget_out: "budget",
  budget_low: "budget",
  computer: "computer",
} as const satisfies Record<TeamWatchCause, string>;

/**
 * What the right hand found wrong (ADR 0177 §1): its cause, the key of the sentence saying it (`key`, said by
 * `teamWatchLine` with `names`, the first things it is about, and `count`, how many in all) and the name of its one
 * button (`act`). A cause this build doesn't know has neither: `text`, the server's own sentence, stands for it and
 * its button only opens. Null for any other notice.
 */
export function teamWatchOf(n: Pick<AppNotification, "kind" | "count" | "latest">) {
  if (n.kind !== "team_watch") return null;
  const names = n.latest.names ?? [];
  const cause = TEAM_WATCH_CAUSES.find((c) => c === n.latest.reason) ?? null;
  return {
    cause,
    key: cause && names.length > 0 ? `notifications.teamWatch.${cause}` : null,
    names,
    count: Math.max(n.count, names.length),
    text: n.latest.text ?? "",
    act: cause ? `notifications.teamWatch.act.${TEAM_WATCH_ACT[cause]}` : null,
  };
}

/**
 * Whether an item's headline already names the place called `name` ("Theo replied in #general"), so nothing beside
 * it says that again. The headline names its `source.label` for a reply, an agent's answer, a mention in a thread and a
 * catch-up skipped for the person who asked ("Theo não respondeu em #suporte").
 */
export const headlineNames = (n: Pick<AppNotification, "kind" | "source">, name: string) =>
  Boolean(name) &&
  n.source.label === name &&
  (n.kind === "thread_reply" ||
    n.kind === "agent_reply" ||
    n.kind === "catch_up_closed_asker" ||
    (n.kind === "mention" && !!n.source.threadId));

/** Grouped (several replies or comments, several agents' failures of one cause): it expands to show them. */
export const isExpandable = (n: AppNotification) =>
  runFailedGroupOf(n) !== null ||
  (n.count > 1 &&
    ((n.kind === "thread_reply" && !!n.source.threadId && !!channelOf(n)) ||
      (n.kind === "issue_comment" && !!n.source.issueId)));

/** Causes a shared failure row says in words (`notifications.failedCause.<reason>`); the plan's need its name. */
const FAILED_CAUSES = new Set([
  "not_logged_in",
  "plan_limit",
  "machine_offline",
  "machine_paused",
  "computer_busy",
  "runner_outdated",
  "budget_exceeded",
  "provider_error",
  "provider_unavailable",
  "gave_up",
  "missing_credential",
  "credential_revoked",
]);
const PLAN_CAUSES = new Set(["not_logged_in", "plan_limit"]);

/**
 * A `run_failed` row standing for several agents (failures of one cause close together, ADR 0097): the runs, how many
 * agents and the cause in words when it has some ("the Claude account was disconnected"). Null for a lone failure,
 * which reads as it always did.
 */
export function runFailedGroupOf(n: Pick<AppNotification, "kind" | "latest">) {
  if (n.kind !== "run_failed") return null;
  const failures = n.latest.failures ?? [];
  const agents = new Set(failures.map((f) => f.agentId)).size;
  if (agents < 2) return null;
  const { reason, plan } = n.latest;
  const cause: Words | null =
    reason && FAILED_CAUSES.has(reason) && (plan || !PLAN_CAUSES.has(reason))
      ? { key: `notifications.failedCause.${reason}`, values: plan ? { plan } : {} }
      : null;
  return { failures, agents, cause };
}

/** How I answer from the inbox, if I can (through the endpoints that already exist). */
export type ReplyTarget =
  | { kind: "message"; channelId: string; threadId: string | null }
  | { kind: "issue"; issueId: string }
  | { kind: "question"; questionId: string };

export function replyTarget(n: AppNotification): ReplyTarget | null {
  const s = n.source;
  switch (n.kind) {
    case "agent_question":
      return s.questionId ? { kind: "question", questionId: s.questionId } : null;
    case "issue_assigned":
    case "issue_comment":
      return s.issueId ? { kind: "issue", issueId: s.issueId } : null;
    case "mention":
    case "thread_reply":
    case "dm":
    case "agent_reply": {
      // A mention in an issue comment (its source may also carry the issue's channel).
      if (s.issueId) return { kind: "issue", issueId: s.issueId };
      const channelId = channelOf(n);
      return channelId ? { kind: "message", channelId, threadId: s.threadId ?? null } : null;
    }
    default:
      return null;
  }
}

/**
 * The island's quick reply: where an answer goes and the answers to pick. A workspace being deleted takes none (ADR
 * 0088 §7): `readOnly` puts the line saying why in their place.
 */
export function quickReply(n: AppNotification, deleting: boolean) {
  const answerable = replyTarget(n);
  return {
    target: deleting ? null : answerable,
    suggestions: !deleting && n.kind === "agent_question" ? (n.latest.suggestions ?? []) : [],
    readOnly: deleting && answerable !== null,
  };
}

/** Where "Abrir" goes (the app's routes). */
export type OpenTarget =
  | { to: "/org/$orgId/threads/$threadId"; params: { threadId: string }; search?: { m: string } }
  | { to: "/org/$orgId/c/$channelId"; params: { channelId: string }; search?: { m: string } }
  | { to: "/org/$orgId/dm/agent/$agentId"; params: { agentId: string }; search?: { m: string } }
  | { to: "/org/$orgId/agents/$agentId"; params: { agentId: string }; search?: { sec: "brain"; brain?: "model" } }
  | { to: "/org/$orgId/dm/person/$userId"; params: { userId: string }; search?: { m: string } }
  | { to: "/org/$orgId/issues/$number"; params: { number: string }; search?: { m: string } }
  | { to: "/org/$orgId/approvals"; search?: { open: string } }
  | { to: "/org/$orgId/proposals" }
  | { to: "/org/$orgId/routines"; search?: { open: string } }
  | { to: "/org/$orgId/threads"; search: { tab: "missions" } }
  | { to: "/org/$orgId/settings/computers/$machineId"; params: { machineId: string } }
  | {
      to: "/org/$orgId/settings/$section";
      params: {
        section: "computers" | "members" | "invites" | "usage" | "connectors" | "billing" | "approvals" | "right_hand";
      };
    }
  | { to: "/org/$orgId/home"; search?: { widget: string } }
  | { to: "/org/$orgId/dashboards" }
  | { to: "/org/$orgId/dashboards/$dashboardId"; params: { dashboardId: string }; search?: { widget: string } }
  | { to: "/org/$orgId/settings/$section"; params: { section: "skills" }; search?: { skill: string } };

/** A routine's trouble (ADR 0053): it opens in Rotinas, where its state says what happened and how to fix it. */
export const ROUTINE_TROUBLE: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  "routine_failed",
  "routine_paused",
  "routine_stalled",
  "routine_waiting_plan",
]);

/** A board's notices (ADR 0135): a widget's alert, a widget that stopped updating, an agent's request to publish. */
export const WIDGET_NOTICES: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  "widget_alert",
  "widget_failed",
  "dashboard_proposal",
]);

/**
 * An agent that needs a person in its browser (ADR 0040) goes to its request card in the
 * conversation, like any message: the browser opens in that card (the page asks for it with
 * the notification's `handoffId`). One sent to someone who can't open that conversation names
 * none (`opensOnComputer`).
 */
export function openTarget(n: AppNotification): OpenTarget | null {
  const s = n.source;
  // At the message itself: paged in, scrolled to and lit (`?m=`).
  const at = s.messageId ? { search: { m: s.messageId } } : {};
  if (n.kind === "approval")
    return { to: "/org/$orgId/approvals", ...(s.approvalId ? { search: { open: s.approvalId } } : {}) };
  // A change someone sent to whoever decides (ADR 0137) is decided on its card in the row: the DM it came from is theirs.
  if (n.kind === "change_request") return null;
  if (n.kind === "proposal_waiting") return { to: "/org/$orgId/proposals" };
  // Who approves for whom (ADR 0139) is set, seen and declined in Configurações › Sua conta › Aprovações.
  if (n.kind === "approval_cover") return { to: "/org/$orgId/settings/$section", params: { section: "approvals" } };
  // What the right hand does without asking is on its own page, which its old settings address opens.
  if (n.kind === "right_hand_paused") return { to: "/org/$orgId/settings/$section", params: { section: "right_hand" } };
  // What the right hand found (ADR 0177 §1) opens where it is fixed: the plans, the connections, the agent whose
  // budget it is, the computer.
  const found = teamWatchOf(n);
  if (found) {
    if (found.cause === "sign_in") return { to: "/org/$orgId/settings/$section", params: { section: "usage" } };
    if (found.cause === "budget_out" || found.cause === "budget_low")
      return s.agentId
        ? { to: "/org/$orgId/agents/$agentId", params: { agentId: s.agentId } }
        : { to: "/org/$orgId/settings/$section", params: { section: "usage" } };
    if (found.cause === "computer")
      return s.machineId
        ? { to: "/org/$orgId/settings/computers/$machineId", params: { machineId: s.machineId } }
        : { to: "/org/$orgId/settings/$section", params: { section: "computers" } };
    return found.cause ? { to: "/org/$orgId/settings/$section", params: { section: "connectors" } } : null;
  }
  // Requests to join are answered in People › Convites (ADR 0068, 0184).
  if (n.kind === "join_request") return { to: "/org/$orgId/settings/$section", params: { section: "invites" } };
  // "Pedir a um admin": roles are given in Members, webhooks set up from a routine; an agent is added in its channel.
  if (n.kind === "admin_ask" && n.latest.reason === "create_agents")
    return { to: "/org/$orgId/settings/$section", params: { section: "members" } };
  if (n.kind === "admin_ask" && n.latest.reason === "webhook") return { to: "/org/$orgId/routines" };
  // Someone accepted an invitation (ADR 0090): a conversation with them, to say hi.
  if (n.kind === "invitation_accepted") {
    const who = n.actors[0];
    return who?.type === "user"
      ? { to: "/org/$orgId/dm/person/$userId", params: { userId: who.id } }
      : { to: "/org/$orgId/settings/$section", params: { section: "members" } };
  }
  // A widget's alert or failure, an agent's request to publish a board (ADR 0135): the board, the widget's panel open.
  // A home board's widget opens on Home: the web knows its home board (`homeTarget`), the address alone doesn't.
  if (WIDGET_NOTICES.has(n.kind))
    return s.dashboardId
      ? {
          to: "/org/$orgId/dashboards/$dashboardId",
          params: { dashboardId: s.dashboardId },
          ...(s.widgetId ? { search: { widget: s.widgetId } } : {}),
        }
      : { to: "/org/$orgId/dashboards" };
  // What an AI app created as me: the newest agent, else the newest routine.
  if (n.kind === "app_created")
    return s.agentId
      ? { to: "/org/$orgId/agents/$agentId", params: { agentId: s.agentId } }
      : s.routineId
        ? { to: "/org/$orgId/routines", search: { open: s.routineId } }
        : null;
  // The month's Composio calls are counted in Uso.
  if (n.kind === "composio_limit") return { to: "/org/$orgId/settings/$section", params: { section: "usage" } };
  // A person's limit (ADR 0141): who decides opens that person's month in Uso › Pessoas; the person, Seu uso.
  if (n.kind === "usage_limit") {
    const theirs = n.latest.statusTo === "reached" || n.latest.statusTo === "request";
    return {
      to: "/org/$orgId/settings/$section",
      params: { section: "usage" },
      ...(theirs && s.userId ? { search: { person: s.userId } } : {}),
    };
  }
  // The agent's model left its plan's list: its page, with "Quem pensa" open on its model to choose another.
  if (n.kind === "plan_model_dropped" && s.agentId)
    return {
      to: "/org/$orgId/agents/$agentId",
      params: { agentId: s.agentId },
      search: { sec: "brain", brain: "model" },
    };
  // Someone gave an agent the person's plan: IA e uso, where their plans and the agents on them are.
  if (n.kind === "plan_lent" || n.kind === "plan_serves")
    return { to: "/org/$orgId/settings/$section", params: { section: "usage" } };
  // An update of a skill from its link: the skill, in Skills.
  if (n.kind === "skill_update")
    return {
      to: "/org/$orgId/settings/$section",
      params: { section: "skills" },
      ...(s.skillId ? { search: { skill: s.skillId } } : {}),
    };
  if (
    n.kind === "machine_connected" ||
    n.kind === "computer_ready" ||
    n.kind === "computer_disk_full" ||
    n.kind === "computer_no_chrome"
  )
    return s.machineId
      ? { to: "/org/$orgId/settings/computers/$machineId", params: { machineId: s.machineId } }
      : { to: "/org/$orgId/settings/$section", params: { section: "computers" } };
  // Someone asks for a browser profile for an agent: the computers, where profiles are given.
  if (n.kind === "browser_profile_request")
    return { to: "/org/$orgId/settings/$section", params: { section: "computers" } };
  // A routine couldn't call the agent: its page, where who talks to it is set (the report's room may be private).
  // An agent held on agentes.chat Cloud: its page too, where the hold shows.
  if ((n.kind === "agent_unreached" || n.kind === "org_standing" || n.kind === "desktop_taken") && s.agentId)
    return { to: "/org/$orgId/agents/$agentId", params: { agentId: s.agentId } };
  // The workspace held for its payment: Cobrança, where it is paid.
  if (n.kind === "org_standing" && n.latest.billingHold)
    return { to: "/org/$orgId/settings/$section", params: { section: "billing" } };
  // A reply in a task's conversation (ADR 0145) opens the task at that message.
  if (s.issueNumber != null)
    return { to: "/org/$orgId/issues/$number", params: { number: String(s.issueNumber) }, ...at };
  // A routine that failed, paused or waits for its computer: the routine in Rotinas (its state and fix).
  // What a routine found opens the agent's message in its conversation (below); without one, the routine.
  if (ROUTINE_TROUBLE.has(n.kind) || (n.kind === "routine_finished" && !s.messageId && !s.threadId))
    return s.routineId ? { to: "/org/$orgId/routines", search: { open: s.routineId } } : { to: "/org/$orgId/routines" };
  // An agent's answer or request in my DM with it opens that DM (a DM has no channel page of its own); one in a thread
  // there opens the thread, the only place its message is.
  if (s.dmId && n.actors[0]?.type === "agent" && !s.threadId)
    return { to: "/org/$orgId/dm/agent/$agentId", params: { agentId: n.actors[0].id }, ...at };
  if (n.kind === "dm" && !s.threadId) {
    const who = n.actors[0];
    if (who?.type === "agent") return { to: "/org/$orgId/dm/agent/$agentId", params: { agentId: who.id }, ...at };
    if (who) return { to: "/org/$orgId/dm/person/$userId", params: { userId: who.id }, ...at };
  }
  if (s.threadId) return { to: "/org/$orgId/threads/$threadId", params: { threadId: s.threadId }, ...at };
  const channelId = channelOf(n);
  if (channelId) return { to: "/org/$orgId/c/$channelId", params: { channelId }, ...at };
  if (s.missionId) return { to: "/org/$orgId/threads", search: { tab: "missions" } };
  return null;
}

/**
 * A board's target on the person's own home board goes to Home instead (`homeId`: their home board's id, when
 * known): My Home has no page of its own among the boards.
 */
export function homeTarget(target: OpenTarget, homeId: string | null | undefined): OpenTarget {
  if (target.to !== "/org/$orgId/dashboards/$dashboardId" || !homeId || target.params.dashboardId !== homeId)
    return target;
  return target.search ? { to: "/org/$orgId/home", search: target.search } : { to: "/org/$orgId/home" };
}

/**
 * What a board's notice is about and what can be done from the inbox and Home (ADR 0135): an alert opens its
 * widget, a failure is resolved by running it again, a request to publish is decided (Publish, Keep only for me).
 * Null for any other notice.
 */
export function widgetNoticeOf(n: Pick<AppNotification, "kind" | "source" | "latest" | "actors">) {
  if (!WIDGET_NOTICES.has(n.kind)) return null;
  const s = n.source;
  const agentId = s.agentId ?? (n.actors[0]?.type === "agent" ? n.actors[0].id : null);
  const base = { dashboardId: s.dashboardId ?? null, widgetId: s.widgetId ?? null, agentId, title: s.label ?? "" };
  if (n.kind === "widget_alert") return { ...base, kind: "alert" as const, text: n.latest.text ?? "" };
  // Its failure's detail as the widget keeps it: the agent's words (`agent_reported`), or why its agent has no AI.
  if (n.kind === "widget_failed")
    return {
      ...base,
      kind: "failed" as const,
      reason: n.latest.reason ?? "error",
      detail: n.latest.text ?? n.latest.detail ?? null,
    };
  return {
    ...base,
    kind: "proposal" as const,
    audience: n.latest.statusTo === "roles" ? ("roles" as const) : ("workspace" as const),
    roles: n.latest.names ?? [],
    text: n.latest.text ?? "",
  };
}

/**
 * A target as the web's address (`/org/<id>/c/<id>?m=<id>`), for what opens it outside the web app's router (the
 * phone, for a page it has no screen of its own for).
 */
export function targetPath(orgId: string, target: OpenTarget): string {
  const params: Record<string, string> = { orgId, ...("params" in target ? target.params : {}) };
  const path = target.to.replace(/\$(\w+)/g, (_, key: string) => encodeURIComponent(params[key] ?? ""));
  const search = "search" in target && target.search ? Object.entries(target.search) : [];
  const query = search.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  return query ? `${path}?${query}` : path;
}

/** A help request whose card is in a conversation I can't open: it opens on the agent's computer, in a dialog. */
export const opensOnComputer = (n: Pick<AppNotification, "kind" | "source" | "actors">): string | null =>
  n.kind === "browser_handoff" && !n.source.channelId && !n.source.dmId && !n.source.threadId
    ? (n.source.agentId ?? (n.actors[0]?.type === "agent" ? n.actors[0].id : null))
    : null;

/**
 * The workspace's computer is ready and its agents have no AI yet: opening it opens "Conectar uma IA" (the one
 * next step there is) instead of a page. `ai` unknown yet: the page.
 */
export const opensConnectAi = (
  n: Pick<AppNotification, "kind">,
  ai: Pick<AiStatus, "any" | "agents"> | undefined,
): boolean => n.kind === "computer_ready" && ai !== undefined && !ai.any && ai.agents.length > 0;

/** Mission and routine steps as strip cells: done, the one it stopped at, the rest to do. */
export function stepCells(steps: { done: number; total: number; failedAt?: number }) {
  const total = Math.max(0, Math.min(40, steps.total));
  // `failedAt` is 1-based; without it a stop is the first step not done.
  const stop = steps.failedAt != null ? steps.failedAt - 1 : null;
  return Array.from({ length: total }, (_, i) =>
    i === stop ? ("stopped" as const) : i < steps.done ? ("done" as const) : ("todo" as const),
  );
}

/** "Lembrar depois": in 1 hour, tomorrow at 9, next Monday at 9 (the person's local time). */
export function snoozeTimes(now = new Date()) {
  const hour = new Date(now.getTime() + 3_600_000);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0);
  // Next week's Monday (from a Monday, the one after).
  const toMonday = ((8 - now.getDay()) % 7 || 7) as number;
  const nextWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + toMonday, 9, 0, 0, 0);
  return { hour, tomorrow, nextWeek };
}

/**
 * What a waiting item asks of you: approve, answer an agent, help in a browser, give
 * a secret, let someone in, or review tools a connected server changed.
 */
export type WaitingCardKind = "approval" | "question" | "browser" | "secret" | "join" | "limit";

export interface WaitingCard {
  kind: WaitingCardKind;
  /**
   * The exact request: the action to approve, the question, what to do in the browser, who asks to join,
   * the tools that changed.
   */
  title: string;
  /** Only requests expire. */
  expiresAt: string | null;
  /** The one button: "Revisar" (a request), "Responder" or "Abrir" (the agent's browser, a secret's card). */
  action: "review" | "answer" | "open";
}

/** A waiting inbox item as a card: who asks (`actors`), the kind, the exact request, the deadline, one button. */
export function waitingCardOf(n: Pick<AppNotification, "kind" | "count" | "latest">): WaitingCard {
  const l = n.latest;
  if (n.kind === "browser_handoff")
    return { kind: "browser", title: l.text ?? l.title ?? "", expiresAt: l.expiresAt ?? null, action: "open" };
  // Its name and what it is for, as its card says: typed there, in the conversation, never here.
  if (n.kind === "secret_request")
    return { kind: "secret", title: secretNoticeLine(n), expiresAt: l.expiresAt ?? null, action: "open" };
  if (n.kind === "approval")
    return { kind: "approval", title: l.title ?? l.text ?? "", expiresAt: l.expiresAt ?? null, action: "review" };
  // No actor (they aren't a member yet): the first who asked is the title; `joinRequestLine` says them all.
  if (n.kind === "join_request")
    return { kind: "join", title: askersOf(n).names[0] ?? "", expiresAt: null, action: "review" };
  // A board's notice (ADR 0135) has nobody to answer: it opens the widget or the board, where it is decided.
  if (WIDGET_NOTICES.has(n.kind))
    return { kind: "question", title: l.text ?? l.title ?? "", expiresAt: null, action: "open" };
  // A person at their limit asks for more (ADR 0141): raised or refused on the card itself.
  if (n.kind === "usage_limit") return { kind: "limit", title: "", expiresAt: null, action: "review" };
  // What the right hand found has nobody to answer: it opens where it is fixed.
  if (n.kind === "team_watch") return { kind: "question", title: l.text ?? "", expiresAt: null, action: "open" };
  return { kind: "question", title: l.text ?? l.title ?? "", expiresAt: null, action: "answer" };
}

/** `@handle` tokens in a snippet (the page highlights mine). */
export const MENTION_RE = /(@[\p{L}\p{N}_.-]*[\p{L}\p{N}_])/u;
