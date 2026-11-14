import {
  type Presence,
  PushError,
  type PushMessage,
  type PushSender,
  type WebPushKeys,
  type WebPushResult,
  type WebPushSender,
} from "@agenteschat/adapters";
import { and, asc, type Database, eq, gt, inArray, isNull, lte, notInArray, or, schema } from "@agenteschat/db";
import { mediaOf } from "./media";
import { voiceOf } from "./message-preview";
import { type NoticePrefs, noticeOn, readNoticePrefs } from "./notice-prefs";
import type { NotificationActor, NotificationLatest, NotificationSource } from "./notifications";
import { enqueue } from "./outbox";
import { type PushTextInput, pushLocale, renderPush } from "./push-messages";
import { accountClosed } from "./standing";
import { isPersonalWorkspace } from "./workspace-mode";

const { pushDevices, notifications, agents, users, approvals, sessions } = schema;

/**
 * Push to the phone app (ADR 0035, ADR 0152, ADR 0178) and to browsers (Web Push, ADR 0071). A
 * notification that should reach the person's devices enqueues one
 * `push.send` job; the job renders the text per device language and sends
 * through the `PushSender` adapter (phones: Android straight to Firebase,
 * iPhones straight to Apple, or both through the push relay) and the
 * `WebPushSender` (browsers).
 *
 * What pushes: what the person chose in this workspace (`noticeOn`, ADR 0071 §8; by default everything in
 * "Esperando você", mentions, DMs from a person, an agent's answer to them, and missions or routines that
 * stopped or failed). Not what is read, done or snoozed by the time the job runs. Grouped notifications push
 * once per group while unread (only the event that opened the row pushes). Something not waiting on the
 * person waits `PUSH_ACTIVE_DELAY_MS` while they have the app open (ADR 0071 §5): read meanwhile, it never
 * pushes.
 */

/** Devices kept per person, phones and browsers together (the oldest are dropped when a new one registers). */
export const MAX_PUSH_DEVICES = 10;

/** How long a push that isn't waiting on the person holds while they have the app open (ADR 0071 §7). */
export const PUSH_ACTIVE_DELAY_MS = 45_000;

/** How long a browser's push service keeps a push while the browser is away. */
export const WEB_PUSH_TTL_SECONDS = 86_400;

/**
 * Phone platforms: Android with its FCM token, iOS with its APNs device token. Browsers register as `web` with
 * their subscription instead.
 */
export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/**
 * A device as `POST /push/devices` registers it: a phone's token, or a browser's Web Push subscription
 * with the session that turned it on (`sessionId`: it hears pushes only while that session lasts).
 */
/**
 * `sharedWith`: the other accounts signed in on the same device, by id (ADR 0183): their registrations of this token
 * stay beside this one. Anyone else's goes (the device changed hands).
 */
export type PushDeviceInput =
  | {
      token: string;
      platform: PushPlatform;
      locale: string;
      /** An iPhone's app (its bundle id, the APNs topic, ADR 0178). Absent: pushed as the sender's first app. */
      appId?: string | null;
      /** An iPhone development build: its token is the APNs sandbox's. */
      sandbox?: boolean;
      sharedWith?: readonly string[];
    }
  | {
      platform: "web";
      endpoint: string;
      keys: WebPushKeys;
      locale: string;
      sessionId: string;
      sharedWith?: readonly string[];
    };

/**
 * An FCM registration token as the Android app gets it (ADR 0152) and an APNs device token as the iPhone app
 * does (ADR 0178), with an iPhone app's id and a notification category's: the shapes the push relay also checks.
 */
export {
  APNS_APP_ID_MAX,
  APNS_CATEGORY,
  APNS_PUSH_TOKEN,
  apnsAppIdValid,
  FCM_PUSH_TOKEN,
} from "@agenteschat/adapters";

type NotificationRow = typeof notifications.$inferSelect;

/** Whether a notification should be on the person's devices (now), given their choices in its workspace. */
export function pushWorthy(
  row: Pick<NotificationRow, "kind" | "waiting" | "readAt" | "doneAt" | "snoozedUntil">,
  now: Date,
  prefs: NoticePrefs = {},
): boolean {
  if (!noticeOn(prefs, row.kind, row.waiting)) return false;
  if (row.readAt || row.doneAt) return false;
  return !(row.snoozedUntil && row.snoozedUntil.getTime() > now.getTime());
}

/**
 * A row the person wants on their devices now (their choices, read by the caller when it has them) enqueues
 * `push.send` once per `dedupeKey`, when they have a phone or a browser registered: `notify` for a group's first
 * event, and a reminder or a snooze's wake under keys of their own.
 */
export async function enqueuePush(
  db: Database,
  row: NotificationRow,
  now = new Date(),
  prefs?: NoticePrefs,
  dedupeKey = `push.send:${row.id}`,
): Promise<boolean> {
  if (!pushWorthy(row, now, prefs ?? (await readNoticePrefs(db, row.orgId, row.userId)))) return false;
  const [device] = await db
    .select({ id: pushDevices.id })
    .from(pushDevices)
    .where(eq(pushDevices.userId, row.userId))
    .limit(1);
  if (!device) return false;
  await enqueue(db, {
    orgId: row.orgId,
    kind: "push.send",
    payload: { notificationId: row.id },
    dedupeKey,
    maxAttempts: 4,
  });
  return true;
}

// ── Devices ───────────────────────────────────────────────────────────────────

/** A subscription's keys without the base64 padding some browsers add. */
const unpadded = (keys: WebPushKeys): WebPushKeys => ({
  p256dh: keys.p256dh.replace(/=+$/, ""),
  auth: keys.auth.replace(/=+$/, ""),
});

/** Accounts that may share one device's token (a browser keeps five signed in, a phone a few per server). */
const MAX_SHARED_ACCOUNTS = 8;

/**
 * Registers (or refreshes) a phone or a browser for a person. A token (a
 * browser's endpoint) already registered by someone else moves to this person
 * (the device changed hands), unless they are signed in on the same device too
 * (`sharedWith`, ADR 0183): then each account hears its own pushes there.
 * Keeps the newest `MAX_PUSH_DEVICES` per person.
 *
 * A browser belongs to the session that turned it on (ADR 0071): signing out,
 * signing out everywhere, or the session running out stops its pushes, which
 * matters on a computer people share. False when that session is no longer
 * the person's (ended meanwhile): nothing is registered.
 */
export async function registerPushDevice(
  db: Database,
  userId: string,
  input: PushDeviceInput,
  now = new Date(),
): Promise<boolean> {
  if (await accountClosed(db, userId)) return false;
  if (input.platform === "web") {
    const [live] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, userId), gt(sessions.expiresAt, now)));
    if (!live) return false;
  }
  const device =
    input.platform === "web"
      ? {
          token: input.endpoint,
          platform: "web" as const,
          webKeys: unpadded(input.keys),
          sessionId: input.sessionId,
          locale: input.locale,
          appId: null,
          apnsSandbox: false,
        }
      : {
          token: input.token,
          platform: input.platform,
          webKeys: null,
          sessionId: null,
          locale: input.locale,
          appId: input.platform === "ios" ? (input.appId ?? null) : null,
          apnsSandbox: input.platform === "ios" && input.sandbox === true,
        };
  const stays = [userId, ...(input.sharedWith ?? []).slice(0, MAX_SHARED_ACCOUNTS)];
  const seen = {
    platform: device.platform,
    webKeys: device.webKeys,
    sessionId: device.sessionId,
    locale: device.locale,
    appId: device.appId,
    apnsSandbox: device.apnsSandbox,
    lastSeenAt: now,
  };
  await db.transaction(async (tx) => {
    // The device changed hands: whoever isn't signed in on it any more stops hearing it.
    await tx.delete(pushDevices).where(and(eq(pushDevices.token, device.token), notInArray(pushDevices.userId, stays)));
    const mine = await tx
      .update(pushDevices)
      .set(seen)
      .where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, device.token)))
      .returning({ id: pushDevices.id });
    if (mine.length > 0) return;
    const made = await tx
      .insert(pushDevices)
      .values({ userId, ...device, lastSeenAt: now })
      .onConflictDoNothing()
      .returning({ id: pushDevices.id });
    if (made.length > 0) return;
    // A database where a token is still one person's (its own unique constraint, until the migration that makes
    // it one row per account): the token moves to whoever registered last, as it always did.
    await tx.delete(pushDevices).where(eq(pushDevices.token, device.token));
    await tx.insert(pushDevices).values({ userId, ...device, lastSeenAt: now });
  });
  const devices = await db
    .select({ id: pushDevices.id })
    .from(pushDevices)
    .where(eq(pushDevices.userId, userId))
    .orderBy(asc(pushDevices.lastSeenAt));
  const extra = devices.slice(0, Math.max(0, devices.length - MAX_PUSH_DEVICES)).map((d) => d.id);
  if (extra.length > 0) await db.delete(pushDevices).where(inArray(pushDevices.id, extra));
  return true;
}

/** Forgets one of the person's devices (sign-out, notifications turned off). Other people's tokens are untouched. */
export async function unregisterPushDevice(db: Database, userId: string, token: string): Promise<boolean> {
  const rows = await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.userId, userId), eq(pushDevices.token, token)))
    .returning({ id: pushDevices.id });
  return rows.length > 0;
}

export async function listPushDevices(db: Database, userId: string) {
  return db.select().from(pushDevices).where(eq(pushDevices.userId, userId)).orderBy(asc(pushDevices.createdAt));
}

/**
 * Where a person's pushes go: every phone, and each browser whose session is still on. `ended`: browsers
 * whose session is over (signed out elsewhere, run out), to forget; a sign-in again subscribes them anew.
 */
async function pushTargets(db: Database, userId: string, now: Date) {
  const rows = await db
    .select({ device: pushDevices, sessionEndsAt: sessions.expiresAt, userLocale: users.locale })
    .from(pushDevices)
    .leftJoin(sessions, eq(sessions.id, pushDevices.sessionId))
    .innerJoin(users, eq(users.id, pushDevices.userId))
    .where(eq(pushDevices.userId, userId))
    .orderBy(asc(pushDevices.createdAt));
  // The person's language (ADR 0122), else the one the device registered: a change in the app reaches every push.
  const phones = rows
    .filter((r) => r.device.platform !== "web")
    .map((r) => ({ ...r.device, locale: r.userLocale ?? r.device.locale }));
  const web = rows.filter((r) => r.device.platform === "web");
  const on = (r: (typeof web)[number]) => r.sessionEndsAt !== null && r.sessionEndsAt.getTime() > now.getTime();
  return {
    phones,
    browsers: web
      .filter((r) => on(r) && r.device.webKeys)
      .map((r) => ({ ...r.device, locale: r.userLocale ?? r.device.locale })),
    ended: web.filter((r) => !on(r)).map((r) => r.device.token),
  };
}

// ── Delivery (job `push.send`) ────────────────────────────────────────────────

export interface PushDeps {
  db: Database;
  /** Phones (Android through FCM, iPhones through APNs: `createPhonePushSender`); absent = no phone push. */
  push?: PushSender | null;
  /** Browsers (Web Push, ADR 0071); absent = no browser push. */
  webPush?: WebPushSender | null;
  /** Who has the app open: a push not waiting on them holds `PUSH_ACTIVE_DELAY_MS` (ADR 0071 §7). */
  presence?: Pick<Presence, "online"> | null;
  /**
   * This server's address (the origin of `PUBLIC_URL`), sent with every phone push as `server`: a phone signed in to
   * several servers opens the workspace on the one the push came from (ADR 0154).
   */
  server?: string | null;
  now?: () => Date;
}

export interface PushDelivery {
  /** Devices that took it. */
  sent: number;
  /** Devices deleted because their push service said they are gone. */
  removed: number;
  /** Devices that didn't take it, for another reason. */
  failed: number;
  /** Held because the person has the app open: a later `push.send` decides. */
  held?: boolean;
}

/** Same rule as the web's approval card: production, irreversible or external actions are high risk. */
export function approvalIsHighRisk(approval: { tool: string; scope: string }): boolean {
  const text = `${approval.tool} ${approval.scope}`.toLowerCase();
  if (text.includes("merge")) return false;
  if (text.includes("rollback")) return true;
  if (text.includes("deploy") || text.includes("workflow") || text.includes("actions.run")) return true;
  if (/delete|remove|destroy|drop|purge/.test(text)) return true;
  return /send|email|mail\b|sms/.test(text) && !text.includes("post_message");
}

async function actorName(db: Database, orgId: string, actor: NotificationActor | undefined) {
  if (!actor) return null;
  if (actor.type === "agent") {
    const [a] = await db
      .select({ name: agents.name })
      .from(agents)
      .where(and(eq(agents.orgId, orgId), eq(agents.id, actor.id)));
    return a?.name ?? null;
  }
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id));
  return u?.name ?? null;
}

/** Chat notifications, whose text is what the message said. */
const SAID_KINDS = new Set(["dm", "mention", "agent_reply", "thread_reply"]);

/**
 * A chat message that was only a GIF or a sticker (ADR 0091): which, so the push says so instead of an empty line.
 * `latest.media` when the notification carries it, else the message's own.
 */
async function sentMediaOf(
  db: Database,
  orgId: string,
  kind: string,
  source: NotificationSource,
  latest: NotificationLatest,
): Promise<"gif" | "sticker" | "voice" | null> {
  if (!SAID_KINDS.has(kind) || latest.text?.trim()) return null;
  const carried = "media" in latest ? latest.media : undefined;
  if (carried === "gif" || carried === "sticker" || carried === "voice") return carried;
  if (!source.messageId) return null;
  const [message] = await db
    .select({ meta: schema.messages.meta })
    .from(schema.messages)
    .where(and(eq(schema.messages.orgId, orgId), eq(schema.messages.id, source.messageId)));
  return voiceOf(message?.meta) ? "voice" : (mediaOf(message?.meta)?.kind ?? null);
}

/**
 * The ids a push carries so a tap opens the exact place without asking the server (ADR 0035 §4): the phone maps
 * them to its screen (`apps/mobile/src/lib/push-payload.ts`), the web to its page (`apps/web/src/lib/push-open.ts`).
 * Ids only, as strings: never a label or a snippet, which the visible text already carries.
 */
export const PUSH_PLACE_KEYS = [
  "channelId",
  "threadId",
  "messageId",
  "dmId",
  "approvalId",
  "missionId",
  "handoffId",
  "routineId",
  "agentId",
  "machineId",
  "topicId",
  "issueNumber",
  // A widget or a board (ADR 0135): the apps open the widget, else the board.
  "dashboardId",
  "widgetId",
  // A device and a request about it (bring your own devices): the apps open its page or the request.
  "phoneId",
  "requestId",
] as const;

/** The in-app page a browser notification opens: the inbox, which opens the notification itself. */
export function pushPagePath(orgId: string): string {
  return `/org/${orgId}/notifications`;
}

/** Whether the person has the app open in the notification's organization (a realtime connection). */
async function isLooking(presence: PushDeps["presence"], orgId: string, userId: string): Promise<boolean> {
  if (!presence) return false;
  try {
    return (await presence.online(orgId)).includes(userId);
  } catch {
    return false;
  }
}

/**
 * What a push quotes of the latest message: never a body the server wrote (English: only the apps word it, by its code,
 * so the push says to open it), and of a reply a restart or its computer cut, only what the agent itself wrote.
 */
export function pushQuote(latest: Pick<NotificationLatest, "text" | "meta">): string | null {
  if (latest.meta?.bodyCode) return null;
  const cut = latest.meta?.brainInterrupted ?? latest.meta?.interrupted;
  return cut ? cut.text || null : (latest.text ?? null);
}

/**
 * Sends the push of one notification to every device of its person, unless
 * it was read, done or snoozed meanwhile: phones through `push` (one call),
 * browsers whose session is still on through `webPush` (one per subscription).
 * Devices their push service reports as gone are deleted, and so are browsers
 * whose session ended.
 *
 * Not waiting on the person and they have the app open: the first run holds
 * it, enqueueing itself once more `PUSH_ACTIVE_DELAY_MS` later (`held`).
 *
 * Throws (so the outbox tries again) only when no device took it and every
 * failure can be retried, so a retry never pushes a device twice; a failed
 * phone request that can't be retried, with nothing sent, also throws (the
 * job fails, as before browsers). Without senders it does nothing.
 */
export async function deliverPush(
  deps: PushDeps,
  notificationId: string,
  options: { held?: boolean } = {},
): Promise<PushDelivery> {
  const none: PushDelivery = { sent: 0, removed: 0, failed: 0 };
  if (!deps.push && !deps.webPush) return none;
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const [row] = await db.select().from(notifications).where(eq(notifications.id, notificationId));
  if (!row || !pushWorthy(row, now, await readNoticePrefs(db, row.orgId, row.userId))) return none;
  const targets = await pushTargets(db, row.userId, now);
  // A browser whose session is over hears nothing more (ADR 0071); signing in there again subscribes it anew.
  if (targets.ended.length > 0) {
    await db
      .delete(pushDevices)
      .where(and(eq(pushDevices.userId, row.userId), inArray(pushDevices.token, targets.ended)));
  }
  const phones = deps.push ? targets.phones : [];
  const browsers = deps.webPush ? targets.browsers : [];
  if (phones.length === 0 && browsers.length === 0) return none;

  if (!options.held && !row.waiting && (await isLooking(deps.presence, row.orgId, row.userId))) {
    await enqueue(db, {
      orgId: row.orgId,
      kind: "push.send",
      payload: { notificationId: row.id, held: true },
      dedupeKey: `push.send:${row.id}:held`,
      runAt: new Date(now.getTime() + PUSH_ACTIVE_DELAY_MS),
      maxAttempts: 4,
    });
    return { ...none, held: true };
  }

  const source = row.source as NotificationSource;
  const latest = row.latest as NotificationLatest;
  const actor = row.actors[0];
  const name = await actorName(db, row.orgId, actor);
  let highRisk = false;
  if (row.kind === "approval" && source.approvalId) {
    const [approval] = await db
      .select({ tool: approvals.tool, scope: approvals.scope })
      .from(approvals)
      .where(and(eq(approvals.orgId, row.orgId), eq(approvals.id, source.approvalId)));
    highRisk = approval ? approvalIsHighRisk(approval) : true;
  }
  const data: Record<string, unknown> = { orgId: row.orgId, kind: row.kind, notificationId: row.id };
  if (deps.server) data.server = deps.server;
  // Whose it is: a phone or browser signed in to this server with several accounts opens it as theirs (ADR 0183).
  data.user = row.userId;
  for (const key of PUSH_PLACE_KEYS) {
    if (source[key] != null && source[key] !== "") data[key] = String(source[key]);
  }
  const text: PushTextInput = {
    kind: row.kind,
    waiting: row.waiting,
    actorName: name,
    actorType: actor?.type ?? null,
    label: source.label,
    title: latest.title,
    text: pushQuote(latest),
    media: await sentMediaOf(db, row.orgId, row.kind, source, latest),
    suggestedBy: latest.suggestedBy ?? null,
    highRisk,
    routine: latest.origin?.kind === "routine" ? latest.origin.routineName : null,
    screen: source.screen ?? null,
    reminder: latest.reminder === true,
    still: latest.still ?? null,
    status: latest.statusTo ?? null,
    percent: latest.percent ?? null,
    reason: typeof latest.reason === "string" ? latest.reason : null,
    // Read once for every device: only the words change (ADR 0159), never who is told or when.
    personal: await isPersonalWorkspace(db, row.orgId),
  };

  let sent = 0;
  const gone: string[] = [];
  const failures: { retryable: boolean; error: string }[] = [];
  let phoneRequestFailed = false;

  if (deps.push && phones.length > 0) {
    const messages: PushMessage[] = phones.map((d) => ({
      to: d.token,
      platform: d.platform === "ios" ? "ios" : "android",
      // An iPhone's app and environment, as it registered them (ADR 0178).
      ...(d.platform === "ios"
        ? { apns: { ...(d.appId ? { topic: d.appId } : {}), ...(d.apnsSandbox ? { sandbox: true } : {}) } }
        : {}),
      ...renderPush(pushLocale(d.locale), text),
      data,
      priority: row.waiting ? "high" : "default",
      // A device's notice has buttons on the lock screen (Stop; Allow once, Always, No), by its kind.
      ...(row.kind.startsWith("device.") ? { category: row.kind } : {}),
    }));
    try {
      const results = await deps.push.send(messages);
      sent += results.filter((r) => r.ok).length;
      gone.push(...results.filter((r) => r.unregistered).map((r) => r.token));
      // Phones answer one by one (FCM, APNs): one that may take it later (429, 5xx) lets the outbox try again. A
      // platform this server sends nothing to (`skipped`) is no failure: it would keep the others from a retry.
      for (const r of results) {
        if (r.ok || r.unregistered || r.skipped) continue;
        failures.push({ retryable: r.retryable === true, error: r.error ?? "not sent" });
      }
    } catch (error) {
      phoneRequestFailed = true;
      const retryable = (error as { retryable?: unknown } | null)?.retryable;
      failures.push({ retryable: retryable !== false, error: String(error) });
    }
  }

  if (deps.webPush && browsers.length > 0) {
    const web = deps.webPush;
    const results = await Promise.all(
      browsers.map(async (d): Promise<[string, WebPushResult]> => {
        const { title, body } = renderPush(pushLocale(d.locale), text);
        const result = await web
          .send({
            endpoint: d.token,
            keys: d.webKeys as WebPushKeys,
            payload: { title, body, tag: row.id, url: pushPagePath(row.orgId), data },
            ttlSeconds: WEB_PUSH_TTL_SECONDS,
            urgency: row.waiting ? "high" : "normal",
            topic: row.id.replace(/-/g, ""),
          })
          .catch((error: unknown) => ({ ok: false, gone: false, retryable: true, error: String(error) }));
        return [d.token, result];
      }),
    );
    // A refused signature (`unauthorized`) isn't `gone`: kept, since it is as often our own key or contact.
    for (const [token, result] of results) {
      if (result.ok) sent++;
      else if (result.gone) gone.push(token);
      else failures.push({ retryable: result.retryable, error: result.error ?? "not sent" });
    }
  }

  if (gone.length > 0) {
    await db.delete(pushDevices).where(and(eq(pushDevices.userId, row.userId), inArray(pushDevices.token, gone)));
  }
  if (sent === 0 && failures.length > 0) {
    const retryable = failures.every((f) => f.retryable);
    if (retryable || phoneRequestFailed) {
      throw new PushError(`push not delivered: ${failures.map((f) => f.error).join("; ")}`, retryable);
    }
  }
  return { sent, removed: gone.length, failed: failures.length };
}

/** Ids `POST /push/stale` takes at once. */
export const PUSH_STALE_MAX = 100;

/**
 * Which of these notification ids a browser should take down (ADR 0071): every one that isn't an open,
 * unread, unsnoozed notification of this person (read, done, snoozed, gone, or someone else's). Pages
 * ask when they come back to the foreground.
 */
export async function stalePushNotifications(
  db: Database,
  userId: string,
  ids: string[],
  now = new Date(),
): Promise<string[]> {
  const wanted = [...new Set(ids)].slice(0, PUSH_STALE_MAX);
  if (wanted.length === 0) return [];
  const open = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        inArray(notifications.id, wanted),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.doneAt),
        or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)),
      ),
    );
  const still = new Set(open.map((r) => r.id));
  return wanted.filter((id) => !still.has(id));
}
