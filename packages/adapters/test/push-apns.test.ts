import { describe, expect, test } from "bun:test";
import type { PushMessage } from "../src/push";
import {
  APNS_ORIGIN,
  APNS_PUSH_TOKEN,
  APNS_SANDBOX_ORIGIN,
  APNS_TOKEN_TTL_MS,
  type ApnsKey,
  apnsAppIdValid,
  apnsProviderToken,
  apnsRequest,
  apnsResultOf,
  createApnsPushSender,
  type Http2Client,
} from "../src/push-apns";

const APP = "chat.agentes.app";
const PREVIEW = "chat.agentes.app.preview";

/** An iPhone's APNs device token. */
const token = (n: number) => String(n).padStart(64, "0");

const msg = (n: number, extra: Partial<PushMessage> = {}): PushMessage => ({
  to: token(n),
  platform: "ios",
  title: "Dev",
  body: "Tudo certo?",
  data: { orgId: "o", kind: "mention", notificationId: `n${n}` },
  ...extra,
});

/** A P-256 key as Apple's .p8 file has it (PKCS #8 PEM), made for the test. */
async function testKey(): Promise<{ key: ApnsKey; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { key: { key: pem, keyId: "ABC123DEFG", teamId: "XYZ987WVUT" }, publicKey: pair.publicKey };
}

type Call = { origin: string; path: string; headers: Record<string, string>; body: unknown };
type Answer = { status: number; body?: unknown };

/** APNs in memory: answers each request with `answer(call)`, 200 by default. */
function fakeApns(answer: (call: Call, n: number) => Answer | Error = () => ({ status: 200 })) {
  const calls: Call[] = [];
  let closed = 0;
  const http2: Http2Client = {
    async request(origin, request) {
      const call = { origin, path: request.path, headers: request.headers, body: JSON.parse(request.body) };
      calls.push(call);
      const got = answer(call, calls.length);
      if (got instanceof Error) throw got;
      return { status: got.status, body: got.body === undefined ? "" : JSON.stringify(got.body) };
    },
    close() {
      closed++;
    },
  };
  return { http2, calls, closed: () => closed };
}

describe("APNs request", () => {
  test("an alert with the data under `body`, always priority 10, a day's expiration", () => {
    const now = 1_800_000_000_000;
    const { headers, body } = apnsRequest(msg(1, { priority: "default", category: "device.join" }), APP, now);
    expect(headers).toEqual({
      "apns-topic": APP,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(now / 1000 + 86_400),
      "content-type": "application/json",
    });
    expect(body).toEqual({
      aps: { alert: { title: "Dev", body: "Tudo certo?" }, sound: "default", category: "device.join" },
      body: { orgId: "o", kind: "mention", notificationId: "n1" },
    });
    expect(apnsRequest(msg(1), APP, now).body.aps).toEqual({
      alert: { title: "Dev", body: "Tudo certo?" },
      sound: "default",
    });
  });

  test("the shapes of a device token and of an app's id", () => {
    expect(APNS_PUSH_TOKEN.test(token(1))).toBe(true);
    expect(APNS_PUSH_TOKEN.test("ABCDEF".repeat(11))).toBe(true);
    expect(APNS_PUSH_TOKEN.test("0".repeat(63))).toBe(false);
    expect(APNS_PUSH_TOKEN.test(`phone-0001:APA91b${"x".repeat(140)}`)).toBe(false);
    expect(apnsAppIdValid(PREVIEW)).toBe(true);
    expect(apnsAppIdValid("app")).toBe(false);
    expect(apnsAppIdValid("chat.agentes/app")).toBe(false);
    expect(apnsAppIdValid(`a.${"b".repeat(160)}`)).toBe(false);
  });
});

describe("APNs answers", () => {
  test("gone tokens are deleted, busy ones retried, the rest is final", () => {
    const reason = (r: string) => JSON.stringify({ reason: r });
    expect(apnsResultOf("t", 200, "")).toEqual({ token: "t", ok: true, unregistered: false });
    expect(apnsResultOf("t", 410, reason("Unregistered"))).toMatchObject({ ok: false, unregistered: true });
    expect(apnsResultOf("t", 400, reason("BadDeviceToken"))).toMatchObject({ unregistered: true });
    expect(apnsResultOf("t", 400, reason("DeviceTokenNotForTopic"))).toMatchObject({ unregistered: true });
    expect(apnsResultOf("t", 429, reason("TooManyRequests"))).toMatchObject({ unregistered: false, retryable: true });
    expect(apnsResultOf("t", 503, "not json")).toEqual({
      token: "t",
      ok: false,
      unregistered: false,
      retryable: true,
      error: "APNs answered 503",
    });
    expect(apnsResultOf("t", 400, reason("PayloadEmpty"))).toEqual({
      token: "t",
      ok: false,
      unregistered: false,
      retryable: false,
      error: "APNs answered 400 PayloadEmpty",
    });
    expect(apnsResultOf("t", 403, reason("TopicDisallowed"))).toMatchObject({ unregistered: false, retryable: false });
  });
});

describe("APNs push sender", () => {
  test("signs a provider token Apple can verify and shares it between sends", async () => {
    const { key, publicKey } = await testKey();
    const apns = fakeApns();
    let now = 1_800_000_000_000;
    const sender = createApnsPushSender({ key, appIds: [APP, PREVIEW], http2: apns.http2, now: () => now });
    expect(sender.id).toBe("apns");
    const results = await sender.send([msg(1), msg(2, { apns: { topic: PREVIEW, sandbox: true } })]);
    expect(results).toEqual([
      { token: token(1), ok: true, unregistered: false },
      { token: token(2), ok: true, unregistered: false },
    ]);
    expect(apns.calls.map((c) => [c.origin, c.path, c.headers["apns-topic"]])).toEqual([
      [APNS_ORIGIN, `/3/device/${token(1)}`, APP],
      [APNS_SANDBOX_ORIGIN, `/3/device/${token(2)}`, PREVIEW],
    ]);
    const auth = apns.calls[0]?.headers.authorization ?? "";
    expect(auth.startsWith("bearer ")).toBe(true);
    expect(apns.calls[1]?.headers.authorization).toBe(auth);
    const [head, claims, signature] = auth.slice("bearer ".length).split(".");
    const decode = (part: string | undefined) => JSON.parse(Buffer.from(part ?? "", "base64url").toString());
    expect(decode(head)).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(decode(claims)).toEqual({ iss: "XYZ987WVUT", iat: now / 1000 });
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      Buffer.from(signature ?? "", "base64url"),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(verified).toBe(true);

    // Still the same token just before 50 minutes, a new one after.
    now += APNS_TOKEN_TTL_MS - 1000;
    await sender.send([msg(3)]);
    expect(apns.calls[2]?.headers.authorization).toBe(auth);
    now += 2000;
    await sender.send([msg(4)]);
    expect(apns.calls[3]?.headers.authorization).not.toBe(auth);
    sender.close();
    expect(apns.closed()).toBe(1);
  });

  test("the provider token's own function matches what the sender sends", async () => {
    const { key } = await testKey();
    const signing = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const jwt = await apnsProviderToken(key, signing.privateKey, 1_800_000_000_000);
    expect(jwt.split(".")).toHaveLength(3);
    expect(Buffer.from(jwt.split(".")[2] ?? "", "base64url")).toHaveLength(64);
  });

  test("a token that isn't hex is gone and an app outside the list is refused, neither leaving the server", async () => {
    const { key } = await testKey();
    const apns = fakeApns();
    const sender = createApnsPushSender({ key, appIds: [APP], http2: apns.http2 });
    const results = await sender.send([
      msg(1, { to: "ExponentPushToken[an-older-build]" }),
      msg(2, { apns: { topic: "com.example.other" } }),
      msg(3),
    ]);
    expect(results[0]).toEqual({
      token: "ExponentPushToken[an-older-build]",
      ok: false,
      unregistered: true,
      error: "not an APNs device token",
    });
    expect(results[1]).toMatchObject({ token: token(2), ok: false, unregistered: false, retryable: false });
    expect(results[1]?.error).toContain("com.example.other");
    expect(results[2]).toMatchObject({ ok: true });
    expect(apns.calls.map((c) => c.path)).toEqual([`/3/device/${token(3)}`]);
  });

  test("BadDeviceToken is tried once on the other environment before the token counts as gone", async () => {
    const { key } = await testKey();
    const bad = { status: 400, body: { reason: "BadDeviceToken" } };
    const wrongSide = fakeApns((call) => (call.origin === APNS_ORIGIN ? bad : { status: 200 }));
    const sender = createApnsPushSender({ key, appIds: [APP], http2: wrongSide.http2 });
    expect(await sender.send([msg(1)])).toEqual([{ token: token(1), ok: true, unregistered: false }]);
    expect(wrongSide.calls.map((c) => c.origin)).toEqual([APNS_ORIGIN, APNS_SANDBOX_ORIGIN]);

    const nowhere = fakeApns(() => bad);
    const gone = await createApnsPushSender({ key, appIds: [APP], http2: nowhere.http2 }).send([
      msg(1, { apns: { sandbox: true } }),
    ]);
    expect(gone[0]).toMatchObject({ ok: false, unregistered: true, error: "APNs answered 400 BadDeviceToken" });
    expect(nowhere.calls.map((c) => c.origin)).toEqual([APNS_SANDBOX_ORIGIN, APNS_ORIGIN]);
  });

  test("a refused provider token is made again once, at most every 20 minutes", async () => {
    const { key } = await testKey();
    const expired = { status: 403, body: { reason: "ExpiredProviderToken" } };
    let now = 1_800_000_000_000;
    let refuse = 1;
    const apns = fakeApns(() => (refuse-- > 0 ? expired : { status: 200 }));
    const sender = createApnsPushSender({ key, appIds: [APP], http2: apns.http2, now: () => now });
    now += 1000;
    expect((await sender.send([msg(1)]))[0]).toMatchObject({ ok: true });
    expect(apns.calls).toHaveLength(2);
    expect(apns.calls[1]?.headers.authorization).not.toBe(apns.calls[0]?.headers.authorization);

    // Refused again a minute later: no new token yet, a final failure that names the variables.
    now += 60_000;
    refuse = 5;
    const again = (await sender.send([msg(2)]))[0];
    expect(again).toMatchObject({ ok: false, unregistered: false, retryable: false });
    expect(again?.error).toContain("APNS_KEY");
    expect(apns.calls).toHaveLength(3);
  });

  test("the network failing is retryable, a key that can't sign is final", async () => {
    const { key } = await testKey();
    const down = fakeApns(() => new Error("connection reset"));
    const failed = await createApnsPushSender({ key, appIds: [APP], http2: down.http2 }).send([msg(1)]);
    expect(failed[0]).toMatchObject({ ok: false, unregistered: false, retryable: true });
    expect(failed[0]?.error).toContain("could not reach APNs");

    const apns = fakeApns();
    const broken = { ...key, key: "-----BEGIN PRIVATE KEY-----\nbm90IGEga2V5\n-----END PRIVATE KEY-----\n" };
    const unsigned = await createApnsPushSender({ key: broken, appIds: [APP], http2: apns.http2 }).send([msg(1)]);
    expect(unsigned[0]).toMatchObject({ ok: false, unregistered: false, retryable: false });
    expect(apns.calls).toEqual([]);
  });
});
