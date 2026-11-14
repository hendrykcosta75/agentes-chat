import { afterEach, describe, expect, test } from "bun:test";
import { generateKeyPairSync, verify } from "node:crypto";
import { eq, schema } from "@agenteschat/db";
import { appleClientSecret } from "../src/auth";
import type { SocketData } from "../src/realtime/ws";
import {
  type Browser,
  browser,
  createTestServer,
  deletionCode,
  deletionsDue,
  ORIGIN,
  seedOrg,
  signUp,
  type TestServer,
} from "./harness";

/**
 * The phone app (ADR 0035): no `Origin`, `X-Agentes-Client: mobile`, the
 * session cookie in a `Cookie` header; push devices; account deletion; Sign
 * in with Apple.
 */

let t: TestServer;
afterEach(async () => {
  const current = t;
  t = undefined as unknown as TestServer;
  await current?.close();
});

const MOBILE = { "x-agentes-client": "mobile" };
/** The account's password, which the app sends to prove it's them (`DELETE /account`). */
/** An iPhone's APNs device token (ADR 0178). */
const TOKEN = "0a1b2c3d".repeat(8);
/** An Android phone's FCM registration token (ADR 0152). */
const FCM_TOKEN = `phone-of-bia:APA91b${"b".repeat(140)}`;

/** A request the way the app sends it: no Origin, the app header, the stored cookie. */
const fromApp = (b: Browser, path: string, init: { method?: string; json?: unknown } = {}) =>
  b(path, { ...init, origin: null, headers: MOBILE });

async function errorCode(res: Response) {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

/** A second person in the owner's org (invited, signed up, accepted). */
async function addPerson(owner: Browser, orgId: string, email: string) {
  const { url } = (await (
    await owner(`/api/app/organizations/${orgId}/invitations`, { json: { email, role: "member" } })
  ).json()) as { url: string };
  const person = browser(t);
  await signUp(person, email);
  expect((await person(`/api/app/invitations/${url.split("/invite/")[1]}/accept`, { json: {} })).status).toBe(200);
  return person;
}

describe("app sessions: CSRF without an Origin", () => {
  test("browser origin ok, foreign origin refused, no origin needs the app header", async () => {
    t = await createTestServer();
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const create = (init: Parameters<Browser>[1]) => owner("/api/app/organizations", init);

    const web = await create({ json: { name: "Web" } });
    expect(web.status).toBe(201);
    // Set up, so the phone's is a workspace of its own (one still being set up comes back instead).
    const { organization } = (await web.json()) as { organization: { id: string } };
    await owner(`/api/app/organizations/${organization.id}/onboarding`, { method: "PATCH", json: { finished: true } });
    const foreign = await create({ json: { name: "X" }, origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
    expect(await errorCode(foreign)).toBe("bad_origin");
    // A foreign Origin is refused even with the app header.
    expect((await create({ json: { name: "X" }, origin: "https://evil.example", headers: MOBILE })).status).toBe(403);
    expect((await create({ json: { name: "X" }, origin: null })).status).toBe(403);
    const webHeader = await create({ json: { name: "X" }, origin: null, headers: { "x-agentes-client": "web" } });
    expect(webHeader.status).toBe(403);

    const app = await fromApp(owner, "/api/app/organizations", { json: { name: "Phone" } });
    expect(app.status).toBe(201);
    // Reads work the same (no CSRF on GET), with the cookie only.
    const me = (await (await fromApp(owner, "/api/app/me")).json()) as { organizations: { name: string }[] };
    expect(me.organizations.map((o) => o.name).sort()).toEqual(["Phone", "Web"]);
  });

  test("the app header without a session is 401, never a pass", async () => {
    t = await createTestServer();
    const anon = browser(t);
    const res = await fromApp(anon, "/api/app/organizations", { json: { name: "X" } });
    expect(res.status).toBe(401);
  });

  test("JSON only still holds, and uploads take the same rule", async () => {
    t = await createTestServer();
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const { orgId } = await seedOrg(owner);
    const form = await t.app.request("/api/app/organizations", {
      method: "POST",
      headers: { ...MOBILE, cookie: owner.cookie(), "content-type": "application/x-www-form-urlencoded" },
      body: "name=X",
    });
    expect(form.status).toBe(415);

    const upload = (headers: Record<string, string>) => {
      const body = new FormData();
      body.set("file", new File(["a,b\n1,2\n"], "dados.csv", { type: "text/csv" }));
      return t.app.request(`/api/app/organizations/${orgId}/artifacts/files`, {
        method: "POST",
        headers: { cookie: owner.cookie(), ...headers },
        body,
      });
    };
    expect((await upload({})).status).toBe(403);
    expect((await upload(MOBILE)).status).toBe(201);
  });

  test("no CORS preflight ever allows the app header", async () => {
    t = await createTestServer();
    const res = await t.app.request("/api/app/organizations", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-agentes-client, content-type",
      },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-headers")).toBeNull();
  });

  test("WebSocket upgrade: our origin, or no origin with the app header; session from the cookie", async () => {
    t = await createTestServer();
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const { orgId } = await seedOrg(owner);
    const server = { upgrade: () => true } as unknown as Bun.Server<SocketData>;
    const upgrade = async (headers: Record<string, string>) => {
      // The real upgrade is Bun's (ws.test.ts); this checks who gets that far.
      const req = new Request(`http://127.0.0.1/api/ws?orgId=${orgId}`, { headers });
      const res = await t.realtime.upgrade(req, server);
      return res ? res.status : "upgraded";
    };
    expect(await upgrade({ origin: ORIGIN, cookie: owner.cookie() })).toBe("upgraded");
    expect(await upgrade({ ...MOBILE, cookie: owner.cookie() })).toBe("upgraded");
    expect(await upgrade({ cookie: owner.cookie() })).toBe(403);
    expect(await upgrade({ origin: "https://evil.example", ...MOBILE, cookie: owner.cookie() })).toBe(403);
    expect(await upgrade({ ...MOBILE })).toBe(401);
  });
});

describe("push devices", () => {
  test("register (upsert, moves between people) and remove own tokens only", async () => {
    t = await createTestServer({ env: { ALLOW_SIGNUP: "true" } });
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const register = (b: Browser, body: unknown) => fromApp(b, "/api/app/push/devices", { json: body });

    expect((await register(owner, { token: "not-a-token", platform: "ios", locale: "pt-BR" })).status).toBe(400);
    expect((await register(owner, { token: TOKEN, platform: "windows", locale: "pt-BR" })).status).toBe(400);
    // Android sends its FCM token, the iPhone its APNs token: an iPhone refuses anything that isn't one, an older
    // build's Expo token too.
    expect((await register(owner, { token: FCM_TOKEN, platform: "ios", locale: "pt-BR" })).status).toBe(400);
    const expoToken = "ExponentPushToken[phone-of-owner-01]";
    expect((await register(owner, { token: expoToken, platform: "ios", locale: "pt-BR" })).status).toBe(400);
    expect((await register(owner, { token: expoToken, platform: "android", locale: "pt-BR" })).status).toBe(400);
    // An iPhone says which app it is and whether it is a development build; neither can be junk.
    const iphone = { token: TOKEN, platform: "ios", locale: "pt-BR" };
    expect((await register(owner, { ...iphone, appId: "not a bundle id" })).status).toBe(400);
    expect((await register(owner, { ...iphone, sandbox: "yes" })).status).toBe(400);
    expect((await register(owner, { ...iphone, appId: "chat.agentes.app.preview", sandbox: true })).status).toBe(204);
    expect((await t.db.select().from(schema.pushDevices)).map((r) => [r.appId, r.apnsSandbox])).toEqual([
      ["chat.agentes.app.preview", true],
    ]);
    expect((await register(owner, { token: "short:APA91b", platform: "android", locale: "pt-BR" })).status).toBe(400);
    expect((await register(owner, { token: TOKEN, platform: "ios", locale: "pt-BR" })).status).toBe(204);
    expect((await register(owner, { token: TOKEN, platform: "ios", locale: "en" })).status).toBe(204);
    const rows = await t.db.select().from(schema.pushDevices);
    expect(rows.map((r) => [r.token, r.platform, r.locale])).toEqual([[TOKEN, "ios", "en"]]);
    const ownerId = rows[0]?.userId;

    // Someone else can't remove it; signing in on the same phone moves it to them.
    const other = browser(t);
    await signUp(other, "other@example.com");
    const path = `/api/app/push/devices/${encodeURIComponent(TOKEN)}`;
    expect((await fromApp(other, path, { method: "DELETE" })).status).toBe(204);
    expect((await t.db.select().from(schema.pushDevices)).map((r) => r.userId)).toEqual([ownerId ?? ""]);
    expect((await register(other, { token: TOKEN, platform: "ios", locale: "pt-BR" })).status).toBe(204);
    expect((await t.db.select().from(schema.pushDevices))[0]?.userId).not.toBe(ownerId);
    expect((await fromApp(other, path, { method: "DELETE" })).status).toBe(204);
    expect(await t.db.select().from(schema.pushDevices)).toEqual([]);

    expect((await fromApp(browser(t), "/api/app/push/devices", { json: { token: TOKEN } })).status).toBe(401);
  });

  test("stale: which shown notifications aren't open and unread for you anymore", async () => {
    t = await createTestServer({ env: { ALLOW_SIGNUP: "true" } });
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const { orgId } = await seedOrg(owner);
    await fromApp(owner, "/api/app/push/devices", { json: { token: TOKEN, platform: "ios", locale: "en" } });
    const userId = (await t.db.select().from(schema.pushDevices))[0]?.userId ?? "";
    const other = browser(t);
    await signUp(other, "other@example.com");
    await fromApp(other, "/api/app/push/devices", {
      json: { token: "9f8e7d6c".repeat(8), platform: "ios", locale: "en" },
    });
    const otherId = (await t.db.select().from(schema.pushDevices)).find((d) => d.userId !== userId)?.userId ?? "";

    const now = Date.now();
    const insert = async (key: string, values: Partial<typeof schema.notifications.$inferInsert> = {}) => {
      const [row] = await t.db
        .insert(schema.notifications)
        .values({ orgId, userId, kind: "mention", groupKey: `mention:${key}`, ...values })
        .returning();
      return row?.id ?? "";
    };
    const open = await insert("open");
    const read = await insert("read", { readAt: new Date(now) });
    const done = await insert("done", { doneAt: new Date(now) });
    const snoozed = await insert("snoozed", { snoozedUntil: new Date(now + 3600_000) });
    const woke = await insert("woke", { snoozedUntil: new Date(now - 60_000) });
    const notMine = await insert("theirs", { userId: otherId });
    const missing = crypto.randomUUID();

    const ask = (b: Browser, ids: unknown) => fromApp(b, "/api/app/push/stale", { json: { ids } });
    const res = await ask(owner, [open, read, done, snoozed, woke, notMine, missing]);
    expect(res.status).toBe(200);
    const { stale } = (await res.json()) as { stale: string[] };
    expect(stale.sort()).toEqual([read, done, snoozed, notMine, missing].sort());
    // The other person's own notification is open for them.
    expect(await (await ask(other, [notMine])).json()).toEqual({ stale: [] });

    expect((await ask(owner, ["not-an-id"])).status).toBe(400);
    expect(
      (
        await ask(
          owner,
          Array.from({ length: 101 }, () => crypto.randomUUID()),
        )
      ).status,
    ).toBe(400);
    expect((await fromApp(browser(t), "/api/app/push/stale", { json: { ids: [open] } })).status).toBe(401);
  });

  test("a mention reaches the phone through the outbox", async () => {
    t = await createTestServer({ env: { ALLOW_SIGNUP: "true" } });
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const { orgId, channelId } = await seedOrg(owner);
    // Invited people join #general.
    const bia = await addPerson(owner, orgId, "bia@example.com");
    // The right hand greets who joins: that push is not this one, so it goes out before their device is known.
    await t.drain();
    const registered = await fromApp(bia, "/api/app/push/devices", {
      json: { token: FCM_TOKEN, platform: "android", locale: "pt-BR" },
    });
    expect(registered.status).toBe(204);
    const members = (await (await owner(`/api/app/organizations/${orgId}/members`)).json()) as {
      members: { email: string; handle: string }[];
    };
    const handle = members.members.find((m) => m.email === "bia@example.com")?.handle;
    await owner(`/api/app/organizations/${orgId}/channels/${channelId}/messages`, {
      json: { body: `@${handle} pode olhar?` },
    });
    await t.drain();
    expect(t.push.sent).toHaveLength(1);
    expect(t.push.sent[0]).toMatchObject({
      to: FCM_TOKEN,
      platform: "android",
      title: "owner mencionou você",
      data: { orgId, kind: "mention", channelId },
    });
  });
});

describe("account deletion", () => {
  test("the only owner of an org with other members is refused; a member deletes their account", async () => {
    t = await createTestServer({ env: { ALLOW_SIGNUP: "true" } });
    const owner = browser(t);
    await signUp(owner, "owner@example.com");
    const { orgId } = await seedOrg(owner);
    const bia = await addPerson(owner, orgId, "bia@example.com");
    await fromApp(bia, "/api/app/push/devices", { json: { token: TOKEN, platform: "ios", locale: "en" } });

    const refused = await fromApp(owner, "/api/app/account", { method: "DELETE", json: {} });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      error: { code: "sole_owner", params: { organizations: ["Acme"], orgIds: [orgId] } },
    });

    const code = await deletionCode(t, bia, null);
    const deleted = await fromApp(bia, "/api/app/account", { method: "DELETE", json: { code } });
    expect(deleted.status).toBe(204);
    expect(deleted.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token=;"))).toBe(true);
    await deletionsDue(t);
    expect(await t.db.select().from(schema.users).where(eq(schema.users.email, "bia@example.com"))).toEqual([]);
    expect(await t.db.select().from(schema.pushDevices)).toEqual([]);
    expect((await fromApp(bia, "/api/app/me")).status).toBe(401);
    const members = (await (await owner(`/api/app/organizations/${orgId}/members`)).json()) as {
      members: unknown[];
    };
    expect(members.members).toHaveLength(1);

    // Alone in their org: the owner can go now, and the org closes with them, to go for good later.
    const last = await deletionCode(t, owner, null);
    expect((await fromApp(owner, "/api/app/account", { method: "DELETE", json: { code: last } })).status).toBe(204);
    expect(await t.db.select().from(schema.organizations)).toMatchObject([
      { id: orgId, deletionDueAt: expect.any(Date) },
    ]);
  });

  test("needs a session", async () => {
    t = await createTestServer();
    expect((await fromApp(browser(t), "/api/app/account", { method: "DELETE" })).status).toBe(401);
  });
});

describe("Sign in with Apple", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  test("listed in auth-config only when configured", async () => {
    t = await createTestServer();
    const off = (await (await browser(t)("/api/app/auth-config")).json()) as { socialProviders: { apple: boolean } };
    expect(off.socialProviders.apple).toBe(false);
    await t.close();
    t = await createTestServer({
      env: {
        APPLE_CLIENT_ID: "chat.agentes.signin",
        APPLE_TEAM_ID: "TEAM123456",
        APPLE_KEY_ID: "KEY1234567",
        APPLE_PRIVATE_KEY: pem,
      },
    });
    const on = (await (await browser(t)("/api/app/auth-config")).json()) as { socialProviders: { apple: boolean } };
    expect(on.socialProviders.apple).toBe(true);
  });

  test("the client secret is an ES256 JWT Apple accepts", () => {
    const now = Date.UTC(2026, 9, 17);
    const jwt = appleClientSecret({
      clientId: "chat.agentes.signin",
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: pem,
      now,
    });
    const [header, payload, signature] = jwt.split(".");
    const decode = (part: string | undefined) => JSON.parse(Buffer.from(part ?? "", "base64url").toString());
    expect(decode(header)).toEqual({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    const claims = decode(payload) as { iss: string; sub: string; aud: string; iat: number; exp: number };
    expect(claims).toMatchObject({ iss: "TEAM123456", sub: "chat.agentes.signin", aud: "https://appleid.apple.com" });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(15_777_000);
    const ok = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature ?? "", "base64url"),
    );
    expect(ok).toBe(true);
  });
});
