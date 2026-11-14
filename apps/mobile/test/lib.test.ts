import { describe, expect, test } from "bun:test";
import { ApiError } from "@agenteschat/client";
import { readDeleteResponse } from "../src/features/account/result";
import { preflightMissing } from "../src/features/me/logic";
import {
  accountFailed,
  chooseOrg,
  enteringShown,
  firstRunMounted,
  openOrgs,
  pushOpens,
  serverDownOf,
} from "../src/lib/org-choice";
import { photoSource } from "../src/lib/photo";
import {
  createHolder,
  deviceBody,
  devicePath,
  fileUri,
  latin1,
  pushTarget,
  quietWhileOpen,
  readProfile,
  readPushData,
  systemToken,
} from "../src/lib/push-payload";
import { connectPlan, currentServer, savedServer } from "../src/lib/server-choice";
import { createSocketFactory } from "../src/lib/socket";
import { ICON_NAMES } from "../src/ui/icons.data";

describe("push payload", () => {
  test("keeps only known string fields", () => {
    expect(
      readPushData({ orgId: "o1", kind: "approval", approvalId: "a1", extra: "x", channelId: 5, threadId: "" }),
    ).toEqual({ orgId: "o1", kind: "approval", approvalId: "a1" });
    expect(readPushData(null)).toEqual({});
    expect(readPushData("nope")).toEqual({});
  });
  test("device registration body and path", () => {
    const apns = "0a1b".repeat(16);
    expect(deviceBody({ token: apns, platform: "ios", locale: "pt-BR" })).toEqual({
      token: apns,
      platform: "ios",
      locale: "pt-BR",
    });
    // An iPhone says which app it is, and that its pushes come from Apple's sandbox only when they do.
    expect(
      deviceBody({ token: apns, platform: "ios", locale: "en", appId: "chat.agentes.app.preview", sandbox: true }),
    ).toEqual({ token: apns, platform: "ios", locale: "en", appId: "chat.agentes.app.preview", sandbox: true });
    expect(deviceBody({ token: apns, platform: "ios", locale: "en", appId: null, sandbox: false })).toEqual({
      token: apns,
      platform: "ios",
      locale: "en",
    });
    // Android needs neither.
    expect(
      deviceBody({ token: "t", platform: "android", locale: "en", appId: "chat.agentes.app", sandbox: true }),
    ).toEqual({ token: "t", platform: "android", locale: "en" });
    // The phone's other accounts on that server keep the token too (ADR 0183), on either platform.
    expect(deviceBody({ token: "t", platform: "android", locale: "en", sharedWith: ["u2"] })).toEqual({
      token: "t",
      platform: "android",
      locale: "en",
      sharedWith: ["u2"],
    });
    expect(deviceBody({ token: apns, platform: "ios", locale: "en", sharedWith: [] })).toEqual({
      token: apns,
      platform: "ios",
      locale: "en",
    });
    expect(
      deviceBody({ token: apns, platform: "ios", locale: "en", appId: "chat.agentes.app", sharedWith: ["u2", "u3"] }),
    ).toEqual({ token: apns, platform: "ios", locale: "en", appId: "chat.agentes.app", sharedWith: ["u2", "u3"] });
    expect(devicePath("fcm:APA91b a")).toBe("/api/app/push/devices/fcm%3AAPA91b%20a");
  });
  test("the iPhone build's profile says its app and Apple's push environment", () => {
    /** A provisioning profile as the bundle has it: a binary signature around the plist XML. */
    const profile = (appId: string, aps: string | null) => {
      const xml = [
        "<plist><dict><key>Entitlements</key><dict>",
        `<key>application-identifier</key>\n\t<string>ABCDE12345.${appId}</string>`,
        aps ? `<key>aps-environment</key><string>${aps}</string>` : "",
        "</dict></dict></plist>",
      ].join("");
      return new Uint8Array([0x30, 0x82, 0xff, 0x00, ...new TextEncoder().encode(xml), 0xa0, 0x82, 0x80, 0xfe]);
    };
    const dev = readProfile(latin1(profile("chat.agentes.app.development", "development")));
    expect(dev).toEqual({ apsEnvironment: "development", appId: "chat.agentes.app.development" });
    const adHoc = readProfile(latin1(profile("chat.agentes.app.preview", "production")));
    expect(adHoc).toEqual({ apsEnvironment: "production", appId: "chat.agentes.app.preview" });
    expect(readProfile(latin1(profile("*", null)))).toEqual({ apsEnvironment: null, appId: null });
    expect(readProfile("")).toEqual({ apsEnvironment: null, appId: null });
    // Long enough to be read in more than one piece.
    expect(latin1(new Uint8Array(20_000).fill(65))).toBe("A".repeat(20_000));

    const config = { ios: { bundleIdentifier: "chat.agentes.app" } };
    expect(pushTarget("ios", dev, config)).toEqual({ appId: "chat.agentes.app.development", sandbox: true });
    expect(pushTarget("ios", adHoc, config)).toEqual({ appId: "chat.agentes.app.preview", sandbox: false });
    // No profile (a store install): the config's app, production.
    expect(pushTarget("ios", null, config)).toEqual({ appId: "chat.agentes.app", sandbox: false });
    expect(pushTarget("ios", null, null)).toEqual({ appId: null, sandbox: false });
    expect(pushTarget("android", dev, config)).toEqual({ appId: null, sandbox: false });
    expect(fileUri("/var/containers/Bundle/agentes preview.app")).toBe(
      "file:///var/containers/Bundle/agentes%20preview.app",
    );
    expect(fileUri("file:///var/x.app")).toBe("file:///var/x.app");
  });
  test("the system's push token is the token string, nothing else", () => {
    const fromAndroid = { type: "android", data: "fcm:APA91b-token" };
    expect(systemToken(fromAndroid)).toBe("fcm:APA91b-token");
    expect(systemToken({ type: "ios", data: "0a1b".repeat(16) })).toBe("0a1b".repeat(16));
    expect(systemToken({ data: "" })).toBeNull();
    expect(systemToken({ data: { endpoint: "https://push.example" } })).toBeNull();
    expect(systemToken({ data: "x".repeat(2049) })).toBeNull();
    expect(systemToken(null)).toBeNull();
  });
  test("a push about the conversation on screen stays quiet", () => {
    const open = { orgId: "o1", channelId: "c1" };
    expect(quietWhileOpen({ orgId: "o1", channelId: "c1", kind: "message" }, open)).toBe(true);
    expect(quietWhileOpen({ channelId: "c1" }, open)).toBe(true);
    expect(quietWhileOpen({ orgId: "o1", channelId: "c2" }, open)).toBe(false);
    expect(quietWhileOpen({ orgId: "o2", channelId: "c1" }, open)).toBe(false);
    expect(quietWhileOpen({ orgId: "o1", kind: "approval" }, open)).toBe(false);
    expect(quietWhileOpen({ orgId: "o1", channelId: "c1" }, null)).toBe(false);
  });

  test("the conversation on screen: a blur after the next screen took over doesn't clear it", () => {
    const open = createHolder<{ orgId: string; channelId: string }>();
    const releaseA = open.hold({ orgId: "o1", channelId: "c1" });
    // The thread of the same channel focuses first, then the channel blurs.
    const releaseB = open.hold({ orgId: "o1", channelId: "c1" });
    releaseA();
    expect(open.get()).toEqual({ orgId: "o1", channelId: "c1" });
    releaseB();
    expect(open.get()).toBeNull();
  });
});

describe("account deletion", () => {
  const res = (status: number, body: unknown) => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  });
  test("204 is done", async () => {
    expect(await readDeleteResponse(res(204, undefined))).toEqual({ ok: true });
  });
  test("409 sole_owner lists the organizations", async () => {
    expect(
      await readDeleteResponse(res(409, { error: { code: "sole_owner", params: { organizations: ["Acme", 3] } } })),
    ).toEqual({ ok: false, reason: "sole_owner", organizations: ["Acme"] });
  });
  test("a refused proof (`reauth.*`) carries its code to say why; 429 too many passwords", async () => {
    for (const [status, code] of [
      [403, "reauth.code"],
      [400, "reauth.code_wrong"],
      [409, "reauth.code_expired"],
      [403, "reauth.password"],
    ] as const) {
      const result = await readDeleteResponse(res(status, { error: { code, message: "No" } }));
      expect(
        result.ok === false && result.reason === "proof" ? [result.error.status, result.error.code] : result,
      ).toEqual([status, code]);
    }
    expect(await readDeleteResponse(res(429, { error: { code: "rate_limited" } }))).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    // A blocked account's 403 is no proof to give.
    expect(await readDeleteResponse(res(403, { error: { code: "forbidden" } }))).toEqual({
      ok: false,
      reason: "failed",
      status: 403,
    });
  });
  test("anything else failed", async () => {
    expect(await readDeleteResponse(res(500, "oops"))).toEqual({ ok: false, reason: "failed", status: 500 });
  });
  test("a server from before the preflight: deleting falls back to what it always did, only its 404 says so", () => {
    expect(preflightMissing(new ApiError(404, "not_found", "Not found"))).toBe(true);
    expect(preflightMissing(new ApiError(500, "http_500", "oops"))).toBe(false);
    expect(preflightMissing(new Error("offline"))).toBe(false);
  });
});

test("the WebSocket carries the cookie and the app header", () => {
  const made: { url: string; protocols: unknown; options: unknown }[] = [];
  class FakeSocket {
    readyState = 0;
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    constructor(url: string, protocols?: unknown, options?: unknown) {
      made.push({ url, protocols, options });
    }
    send() {}
    close() {}
  }
  const factory = createSocketFactory(() => "better-auth.session_token=abc", FakeSocket);
  factory("wss://agentes.chat/api/ws?orgId=o1");
  expect(made[0]).toEqual({
    url: "wss://agentes.chat/api/ws?orgId=o1",
    protocols: undefined,
    options: { headers: { "X-Agentes-Client": "mobile", Cookie: "better-auth.session_token=abc" } },
  });
  createSocketFactory(() => "", FakeSocket)("wss://x");
  expect(made[1]?.options).toEqual({ headers: { "X-Agentes-Client": "mobile" } });
});

test("organization choice: remembered if still a member, else the first", () => {
  const orgs = [{ id: "a" }, { id: "b" }];
  expect(chooseOrg(orgs, "b")).toBe("b");
  expect(chooseOrg(orgs, "gone")).toBe("a");
  expect(chooseOrg([], "a")).toBeNull();
});

test("a workspace its owner is still setting up isn't opened: the first run resumes it, alone or not", () => {
  const onboarding = { step: "agents" as const, generalChannelId: "g" };
  const mine = { id: "n", name: "N", role: "owner" as const, onboarding };
  const joined = { id: "a", name: "A", role: "member" as const };
  // Only that one: no workspace to open, so the first run shows.
  expect(openOrgs([mine])).toEqual([]);
  // Another to open: that one, even when the one being set up was the last chosen.
  expect(chooseOrg(openOrgs([mine, joined]), "n")).toBe("a");
  // Someone invited into one still being set up, or one finished: it opens.
  expect(
    openOrgs([
      { ...mine, role: "member" as const },
      { id: "f", name: "F", role: "owner" as const },
    ]),
  ).toHaveLength(2);
  // A push about it (someone asking to join through the link shared there, its computer ready) opens nothing; one
  // about a workspace that opens, or one the app doesn't know yet, opens as before.
  expect(pushOpens([mine, joined], "n")).toBe(false);
  expect(pushOpens([mine, joined], "a")).toBe(true);
  expect(pushOpens([mine], "new")).toBe(true);
});

test("the first run: kept, hidden, under an invitation's screen once mounted; never first mounted under one", () => {
  // An invitation opened from the first run: its answers and its workspace stay.
  expect(firstRunMounted(true, true, true)).toBe(true);
  // An invitation opened first: the first run waits for it to close, then mounts.
  expect(firstRunMounted(false, true, true)).toBe(false);
  expect(firstRunMounted(false, true, false)).toBe(true);
  // A workspace now (joined, or made): gone, and not kept for the next invitation.
  expect(firstRunMounted(true, false, false)).toBe(false);
  expect(firstRunMounted(false, false, true)).toBe(false);
});

test("signing in never leaves a blank screen, and the passage never covers the sign-in", () => {
  const signedIn = { signedIn: true, launching: false, welcoming: false, ready: true, accepting: false };
  expect(enteringShown(signedIn)).toBe(false);
  expect(enteringShown({ ...signedIn, welcoming: true })).toBe(true);
  // The moment passed and the account is still loading, or an invitation still being accepted: nothing else covers it.
  expect(enteringShown({ ...signedIn, ready: false })).toBe(true);
  expect(enteringShown({ ...signedIn, accepting: true })).toBe(true);
  // The splash is up (a cold start, a server down): it speaks instead.
  expect(enteringShown({ ...signedIn, ready: false, launching: true })).toBe(false);
  // The session ended meanwhile.
  expect(enteringShown({ ...signedIn, signedIn: false, welcoming: true, ready: false })).toBe(false);
});

test("an account that failed with only the signed-out answer cached is a failed load", () => {
  expect(accountFailed(true, null)).toBe(true);
  expect(accountFailed(true, undefined)).toBe(true);
  expect(accountFailed(true, { organizations: [] })).toBe(false);
  expect(accountFailed(false, null)).toBe(false);
});

test("a server that can't be opened gets its own screen, never the first run", () => {
  // The account failed with nothing cached: down, with the server's own reason once its check says one.
  expect(serverDownOf(true, false, null)).toBe("unreachable");
  expect(serverDownOf(true, false, { ok: false, problem: "certificate" })).toBe("certificate");
  // The server answers but the account didn't load: still can't open it.
  expect(serverDownOf(true, false, { ok: true })).toBe("unreachable");
  // Slow: only once the server is known to be out of reach.
  expect(serverDownOf(false, true, null)).toBeNull();
  expect(serverDownOf(false, true, { ok: true })).toBeNull();
  expect(serverDownOf(false, true, { ok: false, problem: "unreachable" })).toBe("unreachable");
  // Loaded: an old failed check doesn't matter.
  expect(serverDownOf(false, false, { ok: false, problem: "unreachable" })).toBeNull();
});

test("every icon of the design is there", () => {
  const required =
    "home chat agent bell search plus send back more check x clock shield wait hash chev right image file camera mic target list reply copy pin eyeoff moon sun globe out code server mail chart pen doc sparkle smile laptop archive circle pause flag info".split(
      " ",
    );
  for (const name of required) expect(ICON_NAMES).toContain(name as (typeof ICON_NAMES)[number]);
});

describe("person photo", () => {
  const base = "https://app.agentes.chat";
  const headers = { "X-Agentes-Client": "mobile", Cookie: "s=1" };
  test("a photo uploaded here loads from the API with the session", () => {
    expect(photoSource("/api/app/avatars/u1/a.png", base, headers)).toEqual({
      uri: "https://app.agentes.chat/api/app/avatars/u1/a.png",
      headers,
    });
    expect(photoSource("https://app.agentes.chat/api/app/avatars/u1/a.png", base, headers)?.headers).toEqual(headers);
  });
  test("a provider's photo loads without our cookie", () => {
    expect(photoSource("https://lh3.googleusercontent.com/a/x", base, headers)).toEqual({
      uri: "https://lh3.googleusercontent.com/a/x",
    });
  });
  test("nothing usable keeps the initial", () => {
    expect(photoSource(null, base, headers)).toBeNull();
    expect(photoSource("  ", base, headers)).toBeNull();
    expect(photoSource("//evil.example/x.png", base, headers)).toBeNull();
    expect(photoSource("javascript:alert(1)", base, headers)).toBeNull();
  });
});

describe("choosing a server", () => {
  const cloud = "https://app.agentes.chat";
  const box = "https://box.tail1234.ts.net";

  test("the one chosen, else the build's; nothing kept for the build's own", () => {
    expect(currentServer(null, cloud)).toBe(cloud);
    expect(currentServer(box, cloud)).toBe(box);
    expect(currentServer("not a server", cloud)).toBe(cloud);
    expect(savedServer(box, cloud)).toBe(box);
    expect(savedServer(cloud, cloud)).toBeNull();
  });

  test("another server: the app moves there and nothing signs out (ADR 0154)", () => {
    expect(connectPlan(cloud, { server: box }, false)).toEqual({ move: true, signOut: false, token: null });
    // Signed in there already: still nothing to leave; it opens on that session.
    expect(connectPlan(cloud, { server: box }, true)).toEqual({ move: true, signOut: false, token: null });
    expect(connectPlan(cloud, { server: box, token: "t" }, false)).toEqual({ move: true, signOut: false, token: "t" });
  });

  test("a token on a server someone is signed in to replaces them there, and only there", () => {
    expect(connectPlan(cloud, { server: box, token: "t" }, true)).toEqual({ move: true, signOut: true, token: "t" });
    expect(connectPlan(box, { server: box, token: "t" }, true)).toEqual({ move: false, signOut: true, token: "t" });
    expect(connectPlan(box, { server: box }, true)).toEqual({ move: false, signOut: false, token: null });
  });
});
