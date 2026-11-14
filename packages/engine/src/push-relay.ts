import type { PushMessage, PushResult, PushSender, RateLimiter } from "@agenteschat/adapters";
import { type Database, eq, schema, sql } from "@agenteschat/db";
import { randomToken, safeEqual, sha256 } from "./crypto";
import { ValidationError } from "./errors";
import { APNS_CATEGORY, APNS_PUSH_TOKEN, apnsAppIdValid, FCM_PUSH_TOKEN } from "./push";

const { pushRelayInstances } = schema;

/**
 * The push relay's side (ADR 0152, ADR 0178), on the server that holds the phone app's Firebase service
 * account and APNs key (`PUSH_RELAY_SERVE`). Self-hosted installations register on their own (no account)
 * and send their phone pushes here; the relay checks and limits them and passes them to Firebase Cloud
 * Messaging (Android) and to Apple's APNs (iPhone). Message text is never stored or logged: only counts.
 */

export const PUSH_RELAY_LIMITS = {
  /** Messages per request. */
  batch: 100,
  /** Characters; the server's own pushes keep well under (80 and 180). */
  title: 200,
  body: 1000,
  /** `data` as JSON, in bytes. */
  dataBytes: 2048,
  /** Title, text and data together, in bytes: FCM and APNs take 4 KB for the whole message, their own fields included. */
  totalBytes: 3584,
  /** Messages per installation per hour. */
  perInstance: { limit: 3000, windowMs: 3600_000 },
  /** Messages to one phone per hour, from every installation together. */
  perToken: { limit: 120, windowMs: 3600_000 },
} as const;

/** `lastSeenAt` moves at most this often (one write a minute, not one per request). */
const SEEN_EVERY_MS = 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RelayInstance = typeof pushRelayInstances.$inferSelect;

export interface RelayDeps {
  db: Database;
  /** The relay's own sender: Firebase with the Android app's service account, APNs with the iPhone app's key. */
  sender: PushSender;
  rateLimiter: RateLimiter;
}

/** The installation sent more than its hourly share: the route answers 429. */
export class RelayRateLimitError extends Error {
  constructor(readonly resetAt: Date) {
    super("Too many push messages from this installation; try again later");
    this.name = "RelayRateLimitError";
  }
}

/** A new installation: its id and a secret shown only now (the relay keeps its SHA-256). */
export async function registerRelayInstance(db: Database): Promise<{ instanceId: string; secret: string }> {
  const secret = randomToken(32);
  const [row] = await db
    .insert(pushRelayInstances)
    .values({ secretHash: sha256(secret) })
    .returning({ id: pushRelayInstances.id });
  if (!row) throw new Error("push relay instance was not created");
  return { instanceId: row.id, secret };
}

/**
 * Who is calling, from `Authorization: Bearer <instanceId>.<secret>` (the header's value or just the
 * token). Unknown id or wrong secret: `unauthorized` (the client registers again). Blocked by the
 * relay's operator: `blocked`.
 */
export async function authenticateRelayInstance(
  db: Database,
  bearer: string | null | undefined,
  now = new Date(),
): Promise<RelayInstance | "unauthorized" | "blocked"> {
  const token = (bearer ?? "").replace(/^Bearer\s+/i, "").trim();
  const dot = token.indexOf(".");
  if (dot <= 0) return "unauthorized";
  const id = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!UUID.test(id) || !secret || secret.length > 200) return "unauthorized";
  const [row] = await db.select().from(pushRelayInstances).where(eq(pushRelayInstances.id, id)).limit(1);
  // Hash either way, so a wrong id and a wrong secret take the same work.
  const hash = sha256(secret);
  if (!row || !safeEqual(hash, row.secretHash)) return "unauthorized";
  if (row.blockedAt) return "blocked";
  if (now.getTime() - row.lastSeenAt.getTime() >= SEEN_EVERY_MS) {
    await db.update(pushRelayInstances).set({ lastSeenAt: now }).where(eq(pushRelayInstances.id, row.id));
    row.lastSeenAt = now;
  }
  return row;
}

/**
 * An iPhone message's app and environment (ADR 0178). The relay's APNs sender refuses an app that isn't one
 * of its own (`APNS_APP_IDS`), so here only the shape is checked.
 */
function relayApns(input: unknown, bad: (why: string) => Error): PushMessage["apns"] {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw bad("apns must be an object");
  const { topic, sandbox } = input as Record<string, unknown>;
  if (topic !== undefined && (typeof topic !== "string" || !apnsAppIdValid(topic))) {
    throw bad("apns.topic must be the app's bundle id");
  }
  if (sandbox !== undefined && typeof sandbox !== "boolean") throw bad("apns.sandbox must be true or false");
  return { ...(topic ? { topic } : {}), ...(sandbox ? { sandbox: true } : {}) };
}

/** Checks one message from an installation and keeps only the fields Firebase or Apple get. */
function relayMessage(input: unknown, index: number): PushMessage {
  const bad = (why: string) => new ValidationError(`messages.${index}: ${why}`, "invalid_request", { index });
  if (!input || typeof input !== "object" || Array.isArray(input)) throw bad("must be an object");
  const m = input as Record<string, unknown>;
  if (m.platform !== "android" && m.platform !== "ios") throw bad("platform must be android or ios");
  const ios = m.platform === "ios";
  if (typeof m.to !== "string" || !(ios ? APNS_PUSH_TOKEN : FCM_PUSH_TOKEN).test(m.to)) {
    throw bad(ios ? "to must be an APNs device token" : "to must be an FCM registration token");
  }
  const title = m.title;
  if (typeof title !== "string" || title.length > PUSH_RELAY_LIMITS.title) {
    throw bad(`title must be text up to ${PUSH_RELAY_LIMITS.title} characters`);
  }
  const body = m.body;
  if (typeof body !== "string" || body.length > PUSH_RELAY_LIMITS.body) {
    throw bad(`body must be text up to ${PUSH_RELAY_LIMITS.body} characters`);
  }
  const data = m.data ?? {};
  if (typeof data !== "object" || Array.isArray(data) || data === null) throw bad("data must be an object");
  const dataBytes = Buffer.byteLength(JSON.stringify(data));
  if (dataBytes > PUSH_RELAY_LIMITS.dataBytes) {
    throw bad(`data must be at most ${PUSH_RELAY_LIMITS.dataBytes} bytes as JSON`);
  }
  if (Buffer.byteLength(title) + Buffer.byteLength(body) + dataBytes > PUSH_RELAY_LIMITS.totalBytes) {
    throw bad(`title, body and data must be at most ${PUSH_RELAY_LIMITS.totalBytes} bytes together`);
  }
  if (m.priority !== undefined && m.priority !== "default" && m.priority !== "high") {
    throw bad("priority must be default or high");
  }
  const message: PushMessage = {
    to: m.to,
    platform: ios ? "ios" : "android",
    title,
    body,
    data: data as Record<string, unknown>,
    ...(m.priority ? { priority: m.priority as "default" | "high" } : {}),
  };
  if (!ios) return message;
  const apns = relayApns(m.apns, bad);
  if (m.category !== undefined && (typeof m.category !== "string" || !APNS_CATEGORY.test(m.category))) {
    throw bad("category must be a notification category's id");
  }
  return { ...message, ...(apns ? { apns } : {}), ...(m.category ? { category: m.category } : {}) };
}

/**
 * Sends an installation's messages through Firebase and APNs: one result per message, in order. The whole
 * request is refused when a message is malformed (`ValidationError`) or the installation is over its
 * hourly share (`RelayRateLimitError`); a phone over its own hourly share gets a final non-ok result
 * (`rate_limited`, not unregistered) while the others go.
 */
export async function relaySend(deps: RelayDeps, instance: RelayInstance, input: unknown[]): Promise<PushResult[]> {
  if (!Array.isArray(input) || input.length === 0) throw new ValidationError("messages: at least one is needed");
  if (input.length > PUSH_RELAY_LIMITS.batch) {
    throw new ValidationError(`messages: at most ${PUSH_RELAY_LIMITS.batch} per request`, "invalid_request", {
      max: PUSH_RELAY_LIMITS.batch,
    });
  }
  const messages = input.map((m, i) => relayMessage(m, i));

  // The installation's share counts every message it asks for (the limiter counts one per call).
  const shares = await Promise.all(
    messages.map(() => deps.rateLimiter.consume(`push-relay:i:${instance.id}`, PUSH_RELAY_LIMITS.perInstance)),
  );
  const over = shares.find((r) => !r.allowed);
  if (over) throw new RelayRateLimitError(over.resetAt);

  const perPhone = await Promise.all(
    messages.map((m) => deps.rateLimiter.consume(`push-relay:t:${m.to}`, PUSH_RELAY_LIMITS.perToken)),
  );
  const results: (PushResult | null)[] = [];
  const forward: PushMessage[] = [];
  messages.forEach((m, i) => {
    if (perPhone[i]?.allowed) {
      results.push(null);
      forward.push(m);
    } else results.push({ token: m.to, ok: false, unregistered: false, retryable: false, error: "rate_limited" });
  });
  if (forward.length === 0) return results as PushResult[];

  const sent = await deps.sender.send(forward);
  await deps.db
    .update(pushRelayInstances)
    .set({ sent: sql`${pushRelayInstances.sent} + ${forward.length}` })
    .where(eq(pushRelayInstances.id, instance.id));
  let next = 0;
  return results.map((r, i) => {
    if (r) return r;
    const got = sent[next++];
    const token = messages[i]?.to ?? "";
    return got ? { ...got, token } : { token, ok: false, unregistered: false, retryable: true, error: "no result" };
  });
}
