import { describe, expect, test } from "bun:test";
import { PushError, type PushMessage } from "../src/push";
import { createRelayPushSender, type RelayCredentials } from "../src/push-relay";

const RELAY_URL = "https://relay.example/api/push-relay/v1";

const msg = (n: number): PushMessage => ({
  to: `phone-${String(n).padStart(4, "0")}:APA91b${"a".repeat(140)}`,
  platform: "android",
  title: "Oi",
  body: "Tudo certo?",
  data: { orgId: "o", kind: "mention", notificationId: `n${n}` },
});

/** An iPhone's message: an APNs device token, with its app and Apple's environment unless told otherwise. */
const iphone = (
  n: number,
  apns: PushMessage["apns"] = { topic: "chat.agentes.app.preview", sandbox: true },
): PushMessage => ({ ...msg(n), to: String(n).padStart(64, "e"), platform: "ios", apns });

function memoryCredentials(initial: { instanceId: string; secret: string } | null = null) {
  let saved = initial;
  const log: string[] = [];
  const store: RelayCredentials & { log: string[]; current: () => typeof saved } = {
    log,
    current: () => saved,
    async get() {
      return saved;
    },
    async save(c) {
      log.push(`save:${c.instanceId}`);
      saved = c;
    },
    async clear() {
      log.push("clear");
      saved = null;
    },
  };
  return store;
}

type Call = { path: string; auth: string | null; body: Record<string, unknown> };

/**
 * A relay in memory: registers instances, knows their secrets, answers `/send` like the real one.
 * `forget()` drops every instance (the relay's database was reset); `block` refuses one.
 */
function fakeRelay() {
  const instances = new Map<string, string>();
  const blocked = new Set<string>();
  const calls: Call[] = [];
  let next = 0;
  let sendStatus: { status: number; body: unknown } | null = null;
  const gone = new Set<string>();
  const busy = new Set<string>();
  const skipping = new Set<string>();
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const handler = (async (url: string, init: RequestInit) => {
    const path = url.slice(RELAY_URL.length);
    const auth = new Headers(init.headers).get("authorization");
    const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    calls.push({ path, auth, body });
    if (path === "/instances") {
      const instanceId = `00000000-0000-7000-8000-${String(++next).padStart(12, "0")}`;
      instances.set(instanceId, `secret-${next}`);
      return json({ instanceId, secret: `secret-${next}` }, 201);
    }
    const [id, secret] = (auth ?? "").replace("Bearer ", "").split(".");
    if (!id || instances.get(id) !== secret) return json({ error: { code: "unauthorized", message: "no" } }, 401);
    if (blocked.has(id)) return json({ error: { code: "blocked", message: "blocked" } }, 403);
    if (path === "/send") {
      if (sendStatus) return json(sendStatus.body, sendStatus.status);
      const messages = body.messages as PushMessage[];
      const resultOf = (m: PushMessage) => {
        if (gone.has(m.to)) return { token: m.to, ok: false, unregistered: true, error: "Unregistered" };
        if (busy.has(m.to))
          return { token: m.to, ok: false, unregistered: false, retryable: true, error: "unavailable" };
        if (skipping.has(m.platform))
          return { token: m.to, ok: false, unregistered: false, skipped: true, error: "this server sends no ios push" };
        return { token: m.to, ok: true, unregistered: false };
      };
      return json({ results: messages.map(resultOf) });
    }
    return json({ error: { code: "not_found", message: "?" } }, 404);
  }) as unknown as typeof fetch;
  return {
    fetch: handler,
    calls,
    instances,
    gone,
    busy,
    skipping,
    block: (id: string) => blocked.add(id),
    forget: () => instances.clear(),
    failSend: (status: number, body: unknown) => {
      sendStatus = { status, body };
    },
  };
}

describe("relay push sender", () => {
  test("registers on first use, saves the credentials, then sends with them", async () => {
    const relay = fakeRelay();
    const credentials = memoryCredentials();
    const sender = createRelayPushSender({ url: `${RELAY_URL}/`, credentials, fetch: relay.fetch, version: "1.2.3" });
    expect(sender.id).toBe("relay");
    relay.gone.add(msg(2).to);
    relay.busy.add(msg(3).to);

    const results = await sender.send([{ ...msg(1), priority: "high" }, msg(2), msg(3)]);
    expect(results).toEqual([
      { token: msg(1).to, ok: true, unregistered: false },
      { token: msg(2).to, ok: false, unregistered: true, error: "Unregistered" },
      { token: msg(3).to, ok: false, unregistered: false, retryable: true, error: "unavailable" },
    ]);
    expect(relay.calls.map((c) => c.path)).toEqual(["/instances", "/send"]);
    expect(relay.calls[0]?.body).toEqual({ version: "1.2.3" });
    const saved = credentials.current();
    expect(saved?.secret).toBe("secret-1");
    expect(relay.calls[1]?.auth).toBe(`Bearer ${saved?.instanceId}.secret-1`);
    const firstSend = relay.calls[1]?.body.messages as PushMessage[] | undefined;
    expect(firstSend?.[0]?.priority).toBe("high");

    // Next time: no registration.
    await sender.send([msg(4)]);
    expect(relay.calls.map((c) => c.path)).toEqual(["/instances", "/send", "/send"]);
  });

  test("a token that can't be its platform's answers as gone and never reaches the relay", async () => {
    const relay = fakeRelay();
    const sender = createRelayPushSender({ url: RELAY_URL, credentials: memoryCredentials(), fetch: relay.fetch });
    const older = { ...msg(2), to: "ExponentPushToken[older-android-build]" };
    const olderIphone = { ...iphone(3), to: "ExponentPushToken[older-iphone-build]" };
    expect(await sender.send([older, msg(1), olderIphone])).toEqual([
      { token: older.to, ok: false, unregistered: true, error: "not an FCM registration token" },
      { token: msg(1).to, ok: true, unregistered: false },
      { token: olderIphone.to, ok: false, unregistered: true, error: "not an APNs device token" },
    ]);
    const sent = relay.calls.filter((c) => c.path === "/send").flatMap((c) => c.body.messages as PushMessage[]);
    expect(sent.map((m) => m.to)).toEqual([msg(1).to]);
  });

  test("an iPhone's message carries its app, its environment and its buttons", async () => {
    const relay = fakeRelay();
    const sender = createRelayPushSender({ url: RELAY_URL, credentials: memoryCredentials(), fetch: relay.fetch });
    const withButtons = { ...iphone(1), category: "device.join" };
    // Android has neither: a category there is the app's own business, and never the relay's.
    const results = await sender.send([withButtons, iphone(2, {}), { ...msg(3), category: "device.join" }]);
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    const sent = relay.calls.filter((c) => c.path === "/send").flatMap((c) => c.body.messages as PushMessage[]);
    expect(sent).toEqual([
      {
        to: iphone(1).to,
        platform: "ios",
        title: "Oi",
        body: "Tudo certo?",
        data: { orgId: "o", kind: "mention", notificationId: "n1" },
        apns: { topic: "chat.agentes.app.preview", sandbox: true },
        category: "device.join",
      },
      {
        to: iphone(2).to,
        platform: "ios",
        title: "Oi",
        body: "Tudo certo?",
        data: { orgId: "o", kind: "mention", notificationId: "n2" },
        apns: {},
      },
      {
        to: msg(3).to,
        platform: "android",
        title: "Oi",
        body: "Tudo certo?",
        data: { orgId: "o", kind: "mention", notificationId: "n3" },
      },
    ]);
  });

  test("a platform the relay sends nothing to comes back skipped, the device kept", async () => {
    const relay = fakeRelay();
    relay.skipping.add("ios");
    const sender = createRelayPushSender({ url: RELAY_URL, credentials: memoryCredentials(), fetch: relay.fetch });
    expect(await sender.send([iphone(1)])).toEqual([
      { token: iphone(1).to, ok: false, unregistered: false, skipped: true, error: "the push relay sends none" },
    ]);
  });

  test("the message goes as the server would send it to Firebase", async () => {
    const relay = fakeRelay();
    const sender = createRelayPushSender({ url: RELAY_URL, credentials: memoryCredentials(), fetch: relay.fetch });
    const messages: PushMessage[] = [{ ...msg(1), priority: "high" }, msg(2)];
    await sender.send(messages);
    expect(relay.calls.at(-1)?.body.messages).toEqual(messages);
  });

  test("concurrent first sends register once", async () => {
    const relay = fakeRelay();
    const credentials = memoryCredentials();
    const sender = createRelayPushSender({ url: RELAY_URL, credentials, fetch: relay.fetch });
    await Promise.all([sender.send([msg(1)]), sender.send([msg(2)]), sender.send([msg(3)])]);
    expect(relay.calls.filter((c) => c.path === "/instances")).toHaveLength(1);
  });

  test("a 401 clears the credentials, registers again once and retries once", async () => {
    const relay = fakeRelay();
    const credentials = memoryCredentials();
    const sender = createRelayPushSender({ url: RELAY_URL, credentials, fetch: relay.fetch });
    await sender.send([msg(1)]);
    relay.forget();

    const results = await sender.send([msg(2)]);
    expect(results[0]?.ok).toBe(true);
    expect(relay.calls.map((c) => c.path)).toEqual(["/instances", "/send", "/send", "/instances", "/send"]);
    expect(credentials.log.map((l) => l.split(":")[0])).toEqual(["save", "clear", "save"]);
    expect(credentials.current()?.secret).toBe("secret-2");
  });

  test("a second 401 right after registering gives up for this attempt", async () => {
    const relay = fakeRelay();
    // The relay forgets every installation as soon as it registers it: it keeps answering 401.
    const forgetful = (async (url: string, init: RequestInit) => {
      const res = await relay.fetch(url, init);
      if (url.endsWith("/instances")) relay.forget();
      return res;
    }) as unknown as typeof fetch;
    const credentials = memoryCredentials({ instanceId: "stale", secret: "x" });
    const sender = createRelayPushSender({ url: RELAY_URL, credentials, fetch: forgetful });
    const error = await sender.send([msg(1)]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushError);
    expect((error as PushError).status).toBe(401);
    expect(relay.calls.map((c) => c.path)).toEqual(["/send", "/instances", "/send"]);
  });

  test("a blocked installation fails without retrying", async () => {
    const relay = fakeRelay();
    const credentials = memoryCredentials();
    const sender = createRelayPushSender({ url: RELAY_URL, credentials, fetch: relay.fetch });
    await sender.send([msg(1)]);
    relay.block(credentials.current()?.instanceId as string);
    const error = await sender.send([msg(2)]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushError);
    expect((error as PushError).retryable).toBe(false);
    expect((error as PushError).status).toBe(403);
    expect((error as PushError).message).toContain("blocked");
    // The credentials stay: being blocked is not being unknown.
    expect(credentials.current()).not.toBeNull();
  });

  test("429 and relay failures are retryable; a bad request is not; the relay's hint wins", async () => {
    const refused = (code: string, params?: Record<string, unknown>) => ({ error: { code, message: code, params } });
    const cases: { status: number; body: unknown; retryable: boolean }[] = [
      { status: 429, body: refused("rate_limited"), retryable: true },
      { status: 502, body: refused("upstream_failed", { retryable: true }), retryable: true },
      { status: 502, body: refused("upstream_failed", { retryable: false }), retryable: false },
      { status: 500, body: {}, retryable: true },
      { status: 400, body: refused("invalid_request"), retryable: false },
    ];
    for (const c of cases) {
      const relay = fakeRelay();
      const sender = createRelayPushSender({ url: RELAY_URL, credentials: memoryCredentials(), fetch: relay.fetch });
      relay.failSend(c.status, c.body);
      const error = await sender.send([msg(1)]).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PushError);
      expect([c.status, (error as PushError).retryable]).toEqual([c.status, c.retryable]);
    }
  });

  test("an unreachable relay is retryable", async () => {
    const sender = createRelayPushSender({
      url: RELAY_URL,
      credentials: memoryCredentials({ instanceId: "i", secret: "s" }),
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    const error = await sender.send([msg(1)]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushError);
    expect((error as PushError).retryable).toBe(true);
  });

  test("sends in batches of at most 100, results in order", async () => {
    const relay = fakeRelay();
    const sender = createRelayPushSender({ url: RELAY_URL, credentials: memoryCredentials(), fetch: relay.fetch });
    const messages = Array.from({ length: 250 }, (_, i) => msg(i));
    const results = await sender.send(messages);
    const sends = relay.calls.filter((c) => c.path === "/send");
    expect(sends.map((c) => (c.body.messages as unknown[]).length)).toEqual([100, 100, 50]);
    expect(results.map((r) => r.token)).toEqual(messages.map((m) => m.to));
  });

  test("a wrong number of results is a retryable failure", async () => {
    const relay = fakeRelay();
    const sender = createRelayPushSender({ url: RELAY_URL, credentials: memoryCredentials(), fetch: relay.fetch });
    relay.failSend(200, { results: [] });
    const error = await sender.send([msg(1), msg(2)]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PushError);
    expect((error as PushError).retryable).toBe(true);
  });
});
