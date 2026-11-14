import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createFakePushSender,
  createMemoryRateLimiter,
  createPhonePushSender,
  createRelayPushSender,
  PushError,
  type PushMessage,
  type PushSender,
  type RelayCredentials,
} from "@agenteschat/adapters";
import { type Database, eq, schema } from "@agenteschat/db";
import { createTestDatabase } from "@agenteschat/db/testing";
import { pushRelayRoutes } from "../src/routes/push-relay";
import { createTestServer, type TestServer } from "./harness";

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

const msg = (n: number): PushMessage => ({
  to: token(n),
  platform: "android",
  title: "Acme",
  body: "Dev mentioned you",
  data: { orgId: "o", kind: "mention", notificationId: `n${n}` },
});

function relay(sender: PushSender = createFakePushSender()) {
  const app = pushRelayRoutes({ db, sender, rateLimiter: createMemoryRateLimiter() });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const register = async () => {
    const res = await post("/instances", { version: "1.0.0" });
    expect(res.status).toBe(201);
    const creds = (await res.json()) as { instanceId: string; secret: string };
    return { ...creds, auth: { authorization: `Bearer ${creds.instanceId}.${creds.secret}` } };
  };
  return { app, post, register };
}

describe("push relay routes", () => {
  test("register and send", async () => {
    const sender = createFakePushSender({ unregistered: [token(2)] });
    const { post, register } = relay(sender);
    const { instanceId, auth } = await register();

    const sent = await post("/send", { messages: [msg(1), msg(2)] }, auth);
    expect(sent.status).toBe(200);
    const { results } = (await sent.json()) as { results: { token: string; ok: boolean; unregistered: boolean }[] };
    expect(results.map((r) => [r.token, r.ok, r.unregistered])).toEqual([
      [token(1), true, false],
      [token(2), false, true],
    ]);
    expect(sender.sent).toEqual([msg(1)]);
    const [row] = await db.select().from(schema.pushRelayInstances).where(eq(schema.pushRelayInstances.id, instanceId));
    expect(row?.sent).toBe(2);
  });

  test("no credentials or wrong ones: 401; blocked: 403 blocked", async () => {
    const { post, register } = relay();
    expect((await post("/send", { messages: [msg(1)] })).status).toBe(401);
    const { instanceId, secret, auth } = await register();
    const wrong = { authorization: `Bearer ${instanceId}.${secret}x` };
    expect((await post("/send", { messages: [msg(1)] }, wrong)).status).toBe(401);
    await db
      .update(schema.pushRelayInstances)
      .set({ blockedAt: new Date() })
      .where(eq(schema.pushRelayInstances.id, instanceId));
    const res = await post("/send", { messages: [msg(1)] }, auth);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("blocked");
  });

  test("bad bodies are 400; an iPhone's message needs an iPhone's token; too large is 413", async () => {
    const { post, register } = relay();
    const { auth } = await register();
    expect((await post("/send", "not json", auth)).status).toBe(400);
    expect((await post("/send", { messages: "x" }, auth)).status).toBe(400);
    expect((await post("/send", { messages: [{ ...msg(1), to: "nope" }] }, auth)).status).toBe(400);
    expect((await post("/send", { messages: [{ ...msg(1), platform: "ios" }] }, auth)).status).toBe(400);
    const iphone = { ...msg(1), platform: "ios", to: "0f".repeat(32), apns: { topic: "chat.agentes.app" } };
    expect((await post("/send", { messages: [iphone] }, auth)).status).toBe(200);
    expect((await post("/send", { messages: [{ ...iphone, apns: { topic: "nope" } }] }, auth)).status).toBe(400);
    const huge = { messages: [{ ...msg(1), body: "x".repeat(600 * 1024) }] };
    expect((await post("/send", huge, auth)).status).toBe(413);
  });

  test("registrations are limited per address", async () => {
    const { post } = relay();
    for (let i = 0; i < 10; i++) expect((await post("/instances", {})).status).toBe(201);
    const res = await post("/instances", {});
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    // Another address still registers.
    expect((await post("/instances", {}, { "x-forwarded-for": "198.51.100.9" })).status).toBe(201);
  });

  test("a sender failing as a whole is a 502 that says whether to retry", async () => {
    const down: PushSender = {
      id: "down",
      send: async () => {
        throw new PushError("push refused the request (503)", true, 503);
      },
    };
    const { post, register } = relay(down);
    const { auth } = await register();
    const res = await post("/send", { messages: [msg(1)] }, auth);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { params: { retryable: boolean } } }).error.params.retryable).toBe(true);
  });

  test("the relay sender talks to these routes end to end", async () => {
    const fcm = createFakePushSender({ failing: [token(2)] });
    const { app } = relay(fcm);
    let saved: { instanceId: string; secret: string } | null = null;
    const credentials: RelayCredentials = {
      get: async () => saved,
      save: async (c) => {
        saved = c;
      },
      clear: async () => {
        saved = null;
      },
    };
    const base = "https://relay.example/api/push-relay/v1";
    const sender = createRelayPushSender({
      url: base,
      credentials,
      fetch: (async (url: string, init: RequestInit) =>
        app.request(url.slice(base.length), init)) as unknown as typeof fetch,
    });
    const results = await sender.send([msg(1), msg(2)]);
    expect(results).toEqual([
      { token: token(1), ok: true, unregistered: false },
      { token: token(2), ok: false, unregistered: false, retryable: true, error: "unavailable" },
    ]);
    expect(fcm.sent).toEqual([msg(1)]);

    // The relay forgot this installation: the sender registers again by itself.
    await db.delete(schema.pushRelayInstances);
    const again = await sender.send([msg(3)]);
    expect(again[0]?.ok).toBe(true);
    expect(await db.select().from(schema.pushRelayInstances)).toHaveLength(1);
  });

  test("a relay with no Apple key answers iPhones as skipped: one call, the Android ones still go", async () => {
    const fcm = createFakePushSender();
    const { app } = relay(createPhonePushSender({ android: fcm, ios: null }));
    let saved: { instanceId: string; secret: string } | null = null;
    const credentials: RelayCredentials = {
      get: async () => saved,
      save: async (c) => {
        saved = c;
      },
      clear: async () => {
        saved = null;
      },
    };
    const base = "https://relay.example/api/push-relay/v1";
    const calls: string[] = [];
    const sender = createRelayPushSender({
      url: base,
      credentials,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push(url.slice(base.length));
        return app.request(url.slice(base.length), init);
      }) as unknown as typeof fetch,
    });
    const iphone: PushMessage = {
      ...msg(2),
      to: "a1b2c3d4".repeat(8),
      platform: "ios",
      apns: { topic: "chat.agentes.app" },
    };
    const results = await sender.send([msg(1), iphone]);
    expect(results).toEqual([
      { token: token(1), ok: true, unregistered: false },
      { token: iphone.to, ok: false, unregistered: false, skipped: true, error: "the push relay sends none" },
    ]);
    expect(fcm.sent).toEqual([msg(1)]);
    expect(calls).toEqual(["/instances", "/send"]);

    // Only iPhones: still one answered call, nothing thrown for the outbox to retry.
    calls.length = 0;
    expect((await sender.send([iphone]))[0]).toMatchObject({ ok: false, unregistered: false, skipped: true });
    expect(calls).toEqual(["/send"]);
  });
});

describe("push relay on the server", () => {
  let t: TestServer | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });
  const account = JSON.stringify({
    type: "service_account",
    project_id: "relay-test",
    client_email: "push@relay-test.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n",
  });
  const register = (server: TestServer) =>
    server.app.request("/api/push-relay/v1/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

  test("served only with PUSH_RELAY_SERVE on and a Firebase account", async () => {
    t = await createTestServer({ env: { PUSH_RELAY_SERVE: "on", FIREBASE_SERVICE_ACCOUNT: account } });
    expect((await register(t)).status).toBe(201);
    await t.close();
    t = await createTestServer({ env: { PUSH_RELAY_SERVE: "on" } });
    expect((await register(t)).status).toBe(404);
    await t.close();
    t = await createTestServer({ env: { FIREBASE_SERVICE_ACCOUNT: account } });
    expect((await register(t)).status).toBe(404);
  });
});
