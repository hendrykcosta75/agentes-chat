import type { NotificationKind } from "@agenteschat/client";
import { type OpenTarget, ROUTINE_TROUBLE, WIDGET_NOTICES } from "@agenteschat/client/lib/notifications";

/**
 * A click on a browser notification (Web Push, ADR 0071) lands where a click on the same notification in the
 * inbox lands. The push names its notification (`data.notificationId`, in `data.orgId`); the service worker
 * (public/sw.js) either tells a tab already open (`PUSH_OPEN_MESSAGE` in web-push.ts) or opens a new one at
 * `/org/<orgId>/notifications?open=<id>`, and the workspace reads the notification there, marks it read and
 * goes where the inbox's "Abrir" goes (`components/NotificationOpen.tsx`). The pure parts live here.
 */

/** What a push carries to find its notification again (the server's `data`, `packages/engine/src/push.ts`). */
export interface PushOpenData {
  orgId: string;
  notificationId: string;
  kind: string | null;
  channelId?: string;
  threadId?: string;
  approvalId?: string;
  missionId?: string;
  handoffId?: string;
  messageId?: string;
  /** A board's notice (ADR 0135), when the push names its board and widget. */
  dashboardId?: string;
  widgetId?: string;
  /** Whose notification it is: a browser signed in with several accounts opens it as theirs (ADR 0183). */
  user?: string;
}

/** The ids a push carries besides its notification's, as the server names them. */
const PLACE_KEYS = [
  "channelId",
  "threadId",
  "approvalId",
  "missionId",
  "handoffId",
  "messageId",
  "dashboardId",
  "widgetId",
] as const;

/** An id that can go in a path as it is: what the server makes (UUIDs), never a slash, a dot or a query. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const isId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

/** The push's `data`, checked: `null` without a workspace and a notification to open. */
export function pushOpenDataOf(raw: unknown): PushOpenData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!isId(data.orgId) || !isId(data.notificationId)) return null;
  const out: PushOpenData = {
    orgId: data.orgId,
    notificationId: data.notificationId,
    kind: typeof data.kind === "string" && /^[a-z_]{1,40}$/.test(data.kind) ? data.kind : null,
  };
  for (const key of PLACE_KEYS) if (isId(data[key])) out[key] = data[key];
  if (isId(data.user)) out.user = data.user;
  return out;
}

/** The query parameter the inbox reads to open one notification (`?open=<id>`). */
export const PUSH_OPEN_PARAM = "open";

/** The page that opens a notification on load: the inbox, which reads it, opens it and steps aside. */
export function pushOpenPath(orgId: string, notificationId: string): string {
  return `/org/${orgId}/notifications?${PUSH_OPEN_PARAM}=${encodeURIComponent(notificationId)}`;
}

/** The notification an in-app path asks to open (`pushOpenPath`), or `null` for any other page. */
export function pushOpenOf(path: string): { orgId: string; notificationId: string } | null {
  let url: URL;
  try {
    url = new URL(path, "https://app.invalid");
  } catch {
    return null;
  }
  const match = /^\/org\/([^/]+)\/notifications\/?$/.exec(url.pathname);
  const id = url.searchParams.get(PUSH_OPEN_PARAM);
  if (!match || !isId(match[1]) || !isId(id)) return null;
  return { orgId: match[1], notificationId: id };
}

/** The `open` search value of the inbox's route (`validateSearch`): an id, or nothing. */
export function notificationsSearch(search: Record<string, unknown>): { open?: string } {
  const value = search[PUSH_OPEN_PARAM];
  return isId(value) ? { open: value } : {};
}

/** A click the service worker passed to an open tab: where to go, and the push's data when it had any. */
export interface PushOpen {
  /** The in-app path (only this site's pages, never the API). */
  path: string;
  /** The notification to open; `null` from a push without one (or an older service worker). */
  data: PushOpenData | null;
}

/**
 * The tab's side of a click (`PUSH_OPEN_MESSAGE`), from the message's `url` and `data`. Without a usable path,
 * the notification's own page (`pushOpenPath`); `null` when there is nothing in this site to go to.
 */
export function pushOpenFrom(
  message: { url?: unknown; data?: unknown },
  inApp: (url: unknown) => string | null,
): PushOpen | null {
  const data = pushOpenDataOf(message.data);
  const path = inApp(message.url) ?? (data ? pushOpenPath(data.orgId, data.notificationId) : null);
  if (!path) return null;
  // An older service worker sends only the address: the notification it names, when it names one.
  if (!data) {
    const named = pushOpenOf(path);
    return { path, data: named ? { ...named, kind: null } : null };
  }
  return { path, data };
}

/**
 * Where a pushed notification goes when the notification itself can't be read (gone, or the server didn't
 * answer): the same places `openTarget` picks, from what the push carried. `null` = the inbox.
 */
export function fallbackTarget(data: PushOpenData): OpenTarget | null {
  const kind = data.kind;
  if (kind === "approval")
    return { to: "/org/$orgId/approvals", ...(data.approvalId ? { search: { open: data.approvalId } } : {}) };
  // A request is answered in People › Convites (ADR 0184). Someone who joined by an invitation (ADR 0090) opens a
  // conversation with them, from the notification (`openTarget`); a push names no person to talk to, so without it,
  // Members, where they now are.
  if (kind === "join_request") return { to: "/org/$orgId/settings/$section", params: { section: "invites" } };
  if (kind === "invitation_accepted") return { to: "/org/$orgId/settings/$section", params: { section: "members" } };
  // Settings › Computers is Devices now: its old address redirects there.
  if (kind === "machine_connected" || kind === "computer_ready")
    return { to: "/org/$orgId/settings/$section", params: { section: "computers" } };
  if (kind && ROUTINE_TROUBLE.has(kind as NotificationKind)) return { to: "/org/$orgId/routines" };
  // A board's notice (ADR 0135): its board with the widget open when the push names them, else the boards.
  if (kind && WIDGET_NOTICES.has(kind as NotificationKind))
    return data.dashboardId
      ? {
          to: "/org/$orgId/dashboards/$dashboardId",
          params: { dashboardId: data.dashboardId },
          ...(data.widgetId ? { search: { widget: data.widgetId } } : {}),
        }
      : { to: "/org/$orgId/dashboards" };
  // A help request's card may be in a DM, which a push can't tell from a channel (`/c/<dm id>` doesn't exist).
  if (kind === "browser_handoff") return null;
  const at = data.messageId ? { search: { m: data.messageId } } : {};
  if (data.threadId) return { to: "/org/$orgId/threads/$threadId", params: { threadId: data.threadId }, ...at };
  if (data.channelId) return { to: "/org/$orgId/c/$channelId", params: { channelId: data.channelId }, ...at };
  if (data.missionId) return { to: "/org/$orgId/threads", search: { tab: "missions" } };
  return null;
}

// ── Who opens it ────────────────────────────────────────────────────────────

/** Answers whether it took the click; otherwise the tab just goes to the path. */
export type PushOpenHandler = (open: PushOpen) => boolean;

let handler: PushOpenHandler | null = null;

/**
 * The open workspace takes clicks on browser notifications (`PushOpens`): it reads the notification and goes
 * straight to its place, with no stop at the inbox. Answers the function that lets go of it.
 */
export function setPushOpenHandler(next: PushOpenHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/** A click from the service worker: the workspace's handler, or else a plain move to its path. */
export function dispatchPushOpen(open: PushOpen, go: (path: string) => void): void {
  let taken = false;
  try {
    taken = handler?.(open) ?? false;
  } catch {
    taken = false;
  }
  if (!taken) go(open.path);
}
