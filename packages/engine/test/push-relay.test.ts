import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createFakePushSender,
  createMemoryRateLimiter,
  createPhonePushSender,
  type KeyWrapper,
  PushError,
  type PushMessage,
  type PushSender,
} from "@agenteschat/adapters";
import { type Database, eq, schema } from "@agenteschat/db";
import { createTestDatabase } from "@agenteschat/db/testing";
import { createLocalKeyWrapper, sha256 } from "../src/crypto";
import { ValidationError } from "../src/errors";
import {
  authenticateRelayInstance,
  PUSH_RELAY_LIMITS,
  type RelayInstance,
  RelayRateLimitError,
  registerRelayInstance,
  relaySend,
} from "../src/push-relay";
import { relayCredentials } from "../src/push-relay-client";

const { pushRelayInstances, instancePush } = schema;

let db: Database;
let close: () => Promise<void>;
beforeEach(async () => {
  ({ db, close } = await createTestDatabase());
});
afterEach(async () => {
  await close();
});

/** An Android phone's FCM token. */
const token = (n: number) => `phone-${String(n).padStart(4, "0")}:APA91b${"x".repeat(140)}`;

const msg = (n: number, extra: Partial<PushMessage> = {}): PushMessage => ({
  to: token(n),
  platform: "android",
  title: "Acme",
  body: "Dev asked for your approval",
  data: { orgId: "o", kind: "approval", notificationId: `n${n}` },
  ...extra,
});

/** An iPhone's APNs device token. */
const iphoneToken = (n: number) => String(n).padStart(64, "c");

const iphone = (n: number, extra: Partial<PushMessage> = {}): PushMessage => ({
  to: iphoneToken(n),
  platform: "ios",
  title: "Acme",
  body: "Dev asked for your approval",
  data: { orgId: "o", kind: "approval", notificationId: `n${n}` },
  ...extra,
});

async function registered() {
  const creds = await registerRelayInstance(db);
  const who = await authenticateRelayInstance(db, `Bearer ${creds.instanceId}.${creds.secret}`);
  if (typeof who === "string") throw new Error(who);
  return { creds, instance: who };
}

describe("relay registration and authentication", () => {
  test("registering stores only the secret's hash; the bearer authenticates", async () => {
    const { instanceId, secret } = await registerRelayInstance(db);
    const [row] = await db.select().from(pushRelayInstances).where(eq(pushRelayInstances.id, instanceId));
    expect(row?.secretHash).toBe(sha256(secret));
    expect(row?.secretHash).not.toContain(secret);
    expect(secret.length).toBeGreaterThanOrEqual(40);

    const who = await authenticateRelayInstance(db, `Bearer ${instanceId}.${secret}`);
    expect((who as RelayInstance).id).toBe(instanceId);
    // The token alone works too.
    expect(((await authenticateRelayInstance(db, `${instanceId}.${secret}`)) as RelayInstance).id).toBe(instanceId);
  });

  test("wrong secret, unknown id, junk and nothing are unauthorized; blocked is blocked", async () => {
    const { instanceId, secret } = await registerRelayInstance(db);
    expect(await authenticateRelayInstance(db, `Bearer ${instanceId}.${secret}x`)).toBe("unauthorized");
    expect(await authenticateRelayInstance(db, `Bearer ${Bun.randomUUIDv7()}.${secret}`)).toBe("unauthorized");
    expect(await authenticateRelayInstance(db, "Bearer not-a-uuid.secret")).toBe("unauthorized");
    expect(await authenticateRelayInstance(db, `Bearer ${instanceId}`)).toBe("unauthorized");
    expect(await authenticateRelayInstance(db, `Bearer ${instanceId}.`)).toBe("unauthorized");
    expect(await authenticateRelayInstance(db, undefined)).toBe("unauthorized");
    await db.update(pushRelayInstances).set({ blockedAt: new Date() }).where(eq(pushRelayInstances.id, instanceId));
    expect(await authenticateRelayInstance(db, `Bearer ${instanceId}.${secret}`)).toBe("blocked");
  });

  test("lastSeenAt moves at most once a minute", async () => {
    const { instanceId, secret } = await registerRelayInstance(db);
    const start = new Date(Date.now() + 5 * 60_000);
    const bearer = `Bearer ${instanceId}.${secret}`;
    const seen = async () =>
      (await db.select().from(pushRelayInstances).where(eq(pushRelayInstances.id, instanceId)))[0]?.lastSeenAt;
    await authenticateRelayInstance(db, bearer, start);
    expect((await seen())?.getTime()).toBe(start.getTime());
    await authenticateRelayInstance(db, bearer, new Date(start.getTime() + 30_000));
    expect((await seen())?.getTime()).toBe(start.getTime());
    const later = new Date(start.getTime() + 61_000);
    await authenticateRelayInstance(db, bearer, later);
    expect((await seen())?.getTime()).toBe(later.getTime());
  });
});

describe("relay sending", () => {
  test("forwards only the known fields, one result per message in order, and counts them", async () => {
    const { instance } = await registered();
    const sender = createFakePushSender({ unregistered: [token(2)] });
    const deps = { db, sender, rateLimiter: createMemoryRateLimiter() };
    const extra = { ...msg(1, { priority: "high" }), sound: "loud", badge: 9 } as unknown as PushMessage;
    const results = await relaySend(deps, instance, [extra, msg(2), msg(3)]);
    expect(results).toEqual([
      { token: token(1), ok: true, unregistered: false },
      { token: token(2), ok: false, unregistered: true, error: "DeviceNotRegistered" },
      { token: token(3), ok: true, unregistered: false },
    ]);
    expect(sender.sent[0]).toEqual(msg(1, { priority: "high" }));
    const [row] = await db.select().from(pushRelayInstances).where(eq(pushRelayInstances.id, instance.id));
    expect(row?.sent).toBe(3);
  });

  test("an iPhone's message keeps its app, its environment and its buttons, and nothing else", async () => {
    const { instance } = await registered();
    const sender = createFakePushSender();
    const deps = { db, sender, rateLimiter: createMemoryRateLimiter() };
    const full = {
      ...iphone(1, { apns: { topic: "chat.agentes.app.preview", sandbox: true }, category: "device.join" }),
      badge: 9,
    } as unknown as PushMessage;
    const plain = { ...iphone(2), apns: { sandbox: false, extra: "x" } } as unknown as PushMessage;
    // An Android message's `apns` and `category` are dropped: Firebase gets neither.
    const android = msg(3, { apns: { topic: "chat.agentes.app" }, category: "device.join" });
    const results = await relaySend(deps, instance, [full, plain, iphone(4), android]);
    expect(results.map((r) => r.ok)).toEqual([true, true, true, true]);
    expect(sender.sent).toEqual([
      iphone(1, { apns: { topic: "chat.agentes.app.preview", sandbox: true }, category: "device.join" }),
      iphone(2, { apns: {} }),
      iphone(4),
      msg(3),
    ]);
  });

  test("a platform the relay sends nothing to comes back skipped", async () => {
    const { instance } = await registered();
    const sender = createPhonePushSender({ android: createFakePushSender(), ios: null });
    const deps = { db, sender, rateLimiter: createMemoryRateLimiter() };
    const results = await relaySend(deps, instance, [msg(1), iphone(2)]);
    expect(results[0]).toEqual({ token: token(1), ok: true, unregistered: false });
    expect(results[1]).toMatchObject({ token: iphoneToken(2), ok: false, unregistered: false, skipped: true });
  });

  test("a malformed message refuses the whole request", async () => {
    const { instance } = await registered();
    const sender = createFakePushSender();
    const deps = { db, sender, rateLimiter: createMemoryRateLimiter() };
    const bad: unknown[] = [
      msg(1, { to: "not-a-token" }),
      msg(1, { to: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }),
      // An FCM token isn't an iPhone's.
      msg(1, { platform: "ios" }),
      iphone(1, { to: "0".repeat(63) }),
      iphone(1, { apns: { topic: "not a bundle id" } }),
      iphone(1, { apns: { topic: 7 as never } }),
      iphone(1, { apns: { sandbox: "yes" as never } }),
      iphone(1, { apns: "chat.agentes.app" as never }),
      iphone(1, { category: "has spaces" }),
      iphone(1, { category: "x".repeat(65) }),
      msg(1, { platform: "web" as never }),
      msg(1, { title: "x".repeat(PUSH_RELAY_LIMITS.title + 1) }),
      msg(1, { body: "x".repeat(PUSH_RELAY_LIMITS.body + 1) }),
      msg(1, { title: 42 as never }),
      msg(1, { body: undefined as never }),
      msg(1, { data: { blob: "x".repeat(PUSH_RELAY_LIMITS.dataBytes) } }),
      // Each within its own limit, too much together for FCM (Japanese text is 3 bytes a character).
      msg(1, { body: "あ".repeat(PUSH_RELAY_LIMITS.body), data: { blob: "x".repeat(1500) } }),
      msg(1, { priority: "urgent" as never }),
      { ...msg(1), data: [1, 2] },
      "text",
      null,
    ];
    for (const m of bad) {
      await expect(relaySend(deps, instance, [msg(0), m])).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(relaySend(deps, instance, [])).rejects.toBeInstanceOf(ValidationError);
    const tooMany = Array.from({ length: PUSH_RELAY_LIMITS.batch + 1 }, (_, i) => msg(i));
    await expect(relaySend(deps, instance, tooMany)).rejects.toBeInstanceOf(ValidationError);
    expect(sender.sent).toHaveLength(0);
  });

  test("a phone over its hourly share gets rate_limited while the others go", async () => {
    const { instance } = await registered();
    const sender = createFakePushSender();
    const rateLimiter = createMemoryRateLimiter();
    // Other installations already filled this phone's share.
    for (let i = 0; i < PUSH_RELAY_LIMITS.perToken.limit; i++) {
      await rateLimiter.consume(`push-relay:t:${token(7)}`, PUSH_RELAY_LIMITS.perToken);
    }
    const results = await relaySend({ db, sender, rateLimiter }, instance, [msg(6), msg(7), msg(8)]);
    expect(results.map((r) => [r.token, r.ok, r.unregistered, r.error ?? null])).toEqual([
      [token(6), true, false, null],
      [token(7), false, false, "rate_limited"],
      [token(8), true, false, null],
    ]);
    expect(sender.sent.map((m) => m.to)).toEqual([token(6), token(8)]);
    const [row] = await db.select().from(pushRelayInstances).where(eq(pushRelayInstances.id, instance.id));
    expect(row?.sent).toBe(2);
  });

  test("an installation over its hourly share is refused as a whole", async () => {
    const { instance } = await registered();
    const sender = createFakePushSender();
    const rateLimiter = createMemoryRateLimiter();
    for (let i = 0; i < PUSH_RELAY_LIMITS.perInstance.limit - 1; i++) {
      await rateLimiter.consume(`push-relay:i:${instance.id}`, PUSH_RELAY_LIMITS.perInstance);
    }
    const error = await relaySend({ db, sender, rateLimiter }, instance, [msg(1), msg(2)]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RelayRateLimitError);
    expect((error as RelayRateLimitError).resetAt).toBeInstanceOf(Date);
    expect(sender.sent).toHaveLength(0);
  });

  test("per-message failures pass through with whether to retry", async () => {
    const { instance } = await registered();
    const sender: PushSender = {
      id: "fcm",
      send: async (messages) =>
        messages.map((m, i) => ({ token: m.to, ok: false, unregistered: false, retryable: i === 0, error: "e" })),
    };
    const deps = { db, sender, rateLimiter: createMemoryRateLimiter() };
    expect(await relaySend(deps, instance, [msg(1), msg(2)])).toEqual([
      { token: token(1), ok: false, unregistered: false, retryable: true, error: "e" },
      { token: token(2), ok: false, unregistered: false, retryable: false, error: "e" },
    ]);
  });

  test("a sender that throws passes its PushError on and counts nothing", async () => {
    const { instance } = await registered();
    const sender: PushSender = {
      id: "down",
      send: async () => {
        throw new PushError("push refused the request (503)", true, 503);
      },
    };
    const deps = { db, sender, rateLimiter: createMemoryRateLimiter() };
    const error = await relaySend(deps, instance, [msg(1)]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushError);
    expect((error as PushError).retryable).toBe(true);
    const [row] = await db.select().from(pushRelayInstances).where(eq(pushRelayInstances.id, instance.id));
    expect(row?.sent).toBe(0);
  });
});

describe("relay credentials", () => {
  const SECRET = "test-secret-".padEnd(48, "x");
  const URL_A = "https://relay.example/api/push-relay/v1";
  const URL_B = "https://other-relay.example/api/push-relay/v1";
  const wrappers = () => [createLocalKeyWrapper(SECRET)];

  test("saved credentials come back, the secret sealed at rest; the Web Push keys stay", async () => {
    await db.insert(instancePush).values({ id: 1, vapidPublicKey: "pub", vapidPrivateKey: "priv" });
    const creds = relayCredentials(db, wrappers, URL_A);
    expect(await creds.get()).toBeNull();
    await creds.save({ instanceId: "inst-1", secret: "s3cret-value" });
    expect(await creds.get()).toEqual({ instanceId: "inst-1", secret: "s3cret-value" });
    const [row] = await db.select().from(instancePush).where(eq(instancePush.id, 1));
    expect(row?.relayUrl).toBe(URL_A);
    expect(row?.relaySecret).not.toContain("s3cret-value");
    expect(row?.vapidPrivateKey).toBe("priv");

    await creds.clear();
    expect(await creds.get()).toBeNull();
    const [cleared] = await db.select().from(instancePush).where(eq(instancePush.id, 1));
    expect(cleared?.vapidPublicKey).toBe("pub");
  });

  test("another relay or a changed AGENTES_SECRET reads as none, so the server registers again", async () => {
    await relayCredentials(db, wrappers, URL_A).save({ instanceId: "inst-1", secret: "s" });
    expect(await relayCredentials(db, wrappers, URL_B).get()).toBeNull();
    const rotated = () => [createLocalKeyWrapper("another-secret-".padEnd(48, "y"))];
    expect(await relayCredentials(db, rotated, URL_A).get()).toBeNull();
  });

  test("a key service that doesn't answer is an error to retry, not a reason to register again", async () => {
    await relayCredentials(db, wrappers, URL_A).save({ instanceId: "inst-1", secret: "s" });
    const local = createLocalKeyWrapper(SECRET);
    const down = (): KeyWrapper[] => [
      {
        id: local.id,
        wrap: local.wrap,
        unwrap: async () => {
          throw new Error("timed out");
        },
      },
    ];
    await expect(relayCredentials(db, down, URL_A).get()).rejects.toThrow("timed out");
  });

  test("saving and clearing leave the date of the Web Push pair alone", async () => {
    const made = new Date(Date.now() - 60_000);
    await db.insert(instancePush).values({ id: 1, vapidPublicKey: "pub", vapidPrivateKey: "priv", updatedAt: made });
    const creds = relayCredentials(db, wrappers, URL_A);
    await creds.save({ instanceId: "inst-1", secret: "s" });
    await creds.clear();
    const [row] = await db.select().from(instancePush).where(eq(instancePush.id, 1));
    expect(row?.updatedAt.getTime()).toBe(made.getTime());
  });
});
