import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import type { AppNotification } from "@agenteschat/client";
import { opensConnectAi, openTarget } from "@agenteschat/client/lib/notifications";
import {
  dispatchPushOpen,
  fallbackTarget,
  notificationsSearch,
  type PushOpenData,
  pushOpenDataOf,
  pushOpenFrom,
  pushOpenOf,
  pushOpenPath,
  setPushOpenHandler,
} from "../src/lib/push-open";
import { inAppPath } from "../src/lib/web-push";
import { notification } from "./fakes/notifications";

const ORG = "0b9c3f0e-6a51-4c1e-9d55-2f1f4d1e8a01";
const ID = "7d2a4c11-93e8-4a0b-b5f2-0c6a9e1d3b77";
const ORIGIN = "https://app.example";
const inApp = (url: unknown) => inAppPath(url, ORIGIN);

/** A route file's path: `wiki_` leaves its layout, `index` is its parent's page. */
function routePath(file: string): string {
  const segments = file
    .replace(/\.tsx$/, "")
    .split(".")
    .filter((s) => s !== "index");
  return `/${segments.map((s) => s.replace(/_$/, "")).join("/")}`;
}

/** The pages the app has. */
const ROUTES = new Set(
  readdirSync(new URL("../src/routes", import.meta.url).pathname)
    .filter((f) => f.endsWith(".tsx") && !f.startsWith("__"))
    .map(routePath),
);

describe("a push's data", () => {
  test("keeps the workspace, the notification, its kind and the places it names", () => {
    expect(
      pushOpenDataOf({
        orgId: ORG,
        notificationId: ID,
        kind: "mention",
        channelId: "c1",
        threadId: "t1",
        extra: "dropped",
      }),
    ).toEqual({ orgId: ORG, notificationId: ID, kind: "mention", channelId: "c1", threadId: "t1" });
  });

  test("without a workspace or a notification there is nothing to open", () => {
    expect(pushOpenDataOf(null)).toBeNull();
    expect(pushOpenDataOf("x")).toBeNull();
    expect(pushOpenDataOf({ orgId: ORG })).toBeNull();
    expect(pushOpenDataOf({ notificationId: ID })).toBeNull();
  });

  test("an id that isn't one never reaches a path", () => {
    expect(pushOpenDataOf({ orgId: "../api", notificationId: ID })).toBeNull();
    expect(pushOpenDataOf({ orgId: ORG, notificationId: "a/b" })).toBeNull();
    expect(pushOpenDataOf({ orgId: ORG, notificationId: "a?x=1" })).toBeNull();
    expect(pushOpenDataOf({ orgId: ORG, notificationId: "x".repeat(65) })).toBeNull();
    expect(pushOpenDataOf({ orgId: ORG, notificationId: ID, threadId: "../x", kind: "Mention!" })).toEqual({
      orgId: ORG,
      notificationId: ID,
      kind: null,
    });
  });
});

describe("the page that opens a notification", () => {
  test("is the inbox with ?open=, and reads back", () => {
    const path = pushOpenPath(ORG, ID);
    expect(path).toBe(`/org/${ORG}/notifications?open=${ID}`);
    expect(pushOpenOf(path)).toEqual({ orgId: ORG, notificationId: ID });
  });

  test("any other page names none", () => {
    expect(pushOpenOf(`/org/${ORG}/notifications`)).toBeNull();
    expect(pushOpenOf(`/org/${ORG}/c/c1?open=${ID}`)).toBeNull();
    expect(pushOpenOf(`/org/${ORG}/notifications?open=a%2Fb`)).toBeNull();
    expect(pushOpenOf("/")).toBeNull();
  });

  test("the route keeps only an id in ?open", () => {
    expect(notificationsSearch({ open: ID })).toEqual({ open: ID });
    expect(notificationsSearch({})).toEqual({});
    expect(notificationsSearch({ open: 42 })).toEqual({});
    expect(notificationsSearch({ open: "../x" })).toEqual({});
  });
});

describe("a click passed to an open tab", () => {
  test("carries the notification and its page", () => {
    const data = { orgId: ORG, notificationId: ID, kind: "dm" };
    expect(pushOpenFrom({ url: pushOpenPath(ORG, ID), data }, inApp)).toEqual({
      path: pushOpenPath(ORG, ID),
      data: { orgId: ORG, notificationId: ID, kind: "dm" },
    });
  });

  test("an address off the site still opens the notification it names", () => {
    expect(pushOpenFrom({ url: "https://evil.example/x", data: { orgId: ORG, notificationId: ID } }, inApp)).toEqual({
      path: pushOpenPath(ORG, ID),
      data: { orgId: ORG, notificationId: ID, kind: null },
    });
  });

  test("an older service worker sends only the address", () => {
    expect(pushOpenFrom({ url: pushOpenPath(ORG, ID) }, inApp)).toEqual({
      path: pushOpenPath(ORG, ID),
      data: { orgId: ORG, notificationId: ID, kind: null },
    });
    expect(pushOpenFrom({ url: `/org/${ORG}/notifications` }, inApp)).toEqual({
      path: `/org/${ORG}/notifications`,
      data: null,
    });
  });

  test("nothing in this site: nothing happens", () => {
    expect(pushOpenFrom({ url: "/api/app/me" }, inApp)).toBeNull();
    expect(pushOpenFrom({}, inApp)).toBeNull();
  });
});

describe("who takes the click", () => {
  const click = { path: pushOpenPath(ORG, ID), data: { orgId: ORG, notificationId: ID, kind: null } };

  test("the open workspace, else the tab moves to its address", () => {
    const went: string[] = [];
    const taken: string[] = [];
    dispatchPushOpen(click, (p) => went.push(p));
    expect(went).toEqual([click.path]);

    const release = setPushOpenHandler((c) => {
      taken.push(c.path);
      return true;
    });
    dispatchPushOpen(click, (p) => went.push(p));
    expect(taken).toEqual([click.path]);
    expect(went).toHaveLength(1);

    release();
    dispatchPushOpen(click, (p) => went.push(p));
    expect(went).toHaveLength(2);
  });

  test("a handler that declines or fails leaves it to the address", () => {
    const went: string[] = [];
    const release = setPushOpenHandler(() => false);
    dispatchPushOpen(click, (p) => went.push(p));
    release();
    const release2 = setPushOpenHandler(() => {
      throw new Error("boom");
    });
    dispatchPushOpen(click, (p) => went.push(p));
    release2();
    expect(went).toEqual([click.path, click.path]);
  });

  test("an old handler letting go doesn't drop the new one", () => {
    const first = setPushOpenHandler(() => true);
    const second = setPushOpenHandler(() => true);
    first();
    const went: string[] = [];
    dispatchPushOpen(click, (p) => went.push(p));
    expect(went).toEqual([]);
    second();
  });
});

/**
 * Every kind the server may push (`NOTICE_KINDS` in packages/engine/src/notice-prefs.ts: by default or once the
 * person turns its category on), with the source its producer writes (notification-producers.ts,
 * invite-requests.ts).
 */
const PUSHED: { kind: AppNotification["kind"]; n: Partial<AppNotification>; to: string }[] = [
  {
    kind: "approval",
    n: { waiting: true, source: { approvalId: "a1", channelId: "c1", threadId: "t1", messageId: "m1" } },
    to: "/org/$orgId/approvals",
  },
  {
    kind: "agent_question",
    n: { waiting: true, source: { channelId: "c1", threadId: "t1", messageId: "m1", questionId: "q1" } },
    to: "/org/$orgId/threads/$threadId",
  },
  { kind: "mention", n: { source: { channelId: "c1", messageId: "m1" } }, to: "/org/$orgId/c/$channelId" },
  {
    kind: "dm",
    n: { actors: [{ type: "user", id: "u2" }], source: { channelId: "d1", dmId: "d1", messageId: "m1" } },
    to: "/org/$orgId/dm/person/$userId",
  },
  {
    kind: "mission_stopped",
    n: { source: { missionId: "x1", channelId: "c1", threadId: "t1" } },
    to: "/org/$orgId/threads/$threadId",
  },
  { kind: "routine_failed", n: { source: { routineId: "r1" } }, to: "/org/$orgId/routines" },
  { kind: "routine_paused", n: { source: { routineId: "r1" } }, to: "/org/$orgId/routines" },
  { kind: "routine_stalled", n: { source: { routineId: "r1", machineId: "pc1" } }, to: "/org/$orgId/routines" },
  { kind: "machine_connected", n: { source: { machineId: "pc1" } }, to: "/org/$orgId/settings/computers/$machineId" },
  {
    kind: "browser_handoff",
    n: { waiting: true, source: { channelId: "c1", threadId: "t1", messageId: "h1", handoffId: "h1" } },
    to: "/org/$orgId/threads/$threadId",
  },
  {
    kind: "secret_request",
    n: { waiting: true, source: { channelId: "c1", threadId: "t1", messageId: "m1" } },
    to: "/org/$orgId/threads/$threadId",
  },
  {
    kind: "secret_request",
    n: { waiting: true, source: { channelId: "c1", messageId: "m1" } },
    to: "/org/$orgId/c/$channelId",
  },
  { kind: "computer_ready", n: { source: { machineId: "pc1" } }, to: "/org/$orgId/settings/computers/$machineId" },
  { kind: "join_request", n: { waiting: true, source: { label: "Acme" } }, to: "/org/$orgId/settings/$section" },
  {
    kind: "agent_reply",
    n: { actors: [{ type: "agent", id: "ag1" }], source: { channelId: "d1", dmId: "d1", messageId: "m1" } },
    to: "/org/$orgId/dm/agent/$agentId",
  },
  {
    kind: "agent_reply",
    n: { actors: [{ type: "agent", id: "ag1" }], source: { channelId: "c1", messageId: "m1", label: "geral" } },
    to: "/org/$orgId/c/$channelId",
  },
  {
    kind: "thread_reply",
    n: { source: { channelId: "c1", threadId: "t1", messageId: "m1" } },
    to: "/org/$orgId/threads/$threadId",
  },
  { kind: "issue_assigned", n: { source: { issueId: "i1", issueNumber: 6 } }, to: "/org/$orgId/issues/$number" },
  { kind: "reaction", n: { source: { channelId: "c1", messageId: "m1" } }, to: "/org/$orgId/c/$channelId" },
];

describe("every pushed kind opens a real page", () => {
  for (const { kind, n, to } of PUSHED) {
    test(`${kind} → ${to}`, () => {
      const target = openTarget(notification({ id: ID, kind, ...n }));
      expect(target?.to).toBe(to as never);
      expect(ROUTES.has(to)).toBe(true);
    });
  }

  test("an issue mention opens the issue", () => {
    const target = openTarget(notification({ id: ID, kind: "mention", source: { issueId: "i1", issueNumber: 6 } }));
    expect(target).toEqual({ to: "/org/$orgId/issues/$number", params: { number: "6" } });
  });

  test("a mention in a thread opens the thread", () => {
    const target = openTarget(notification({ id: ID, kind: "mention", source: { channelId: "c1", threadId: "t1" } }));
    expect(target).toEqual({ to: "/org/$orgId/threads/$threadId", params: { threadId: "t1" } });
  });

  test("a DM from an agent opens its conversation", () => {
    const target = openTarget(
      notification({ id: ID, kind: "dm", actors: [{ type: "agent", id: "ag1" }], source: { dmId: "d1" } }),
    );
    expect(target).toEqual({ to: "/org/$orgId/dm/agent/$agentId", params: { agentId: "ag1" } });
  });

  test("a stopped mission without its thread opens the missions tab", () => {
    const target = openTarget(notification({ id: ID, kind: "mission_stopped", source: { missionId: "x1" } }));
    expect(target).toEqual({ to: "/org/$orgId/threads", search: { tab: "missions" } });
  });

  test("the inbox's own route is one too", () => {
    expect(ROUTES.has("/org/$orgId/notifications")).toBe(true);
  });
});

describe("a pushed notification that can't be read", () => {
  const data = (over: Partial<PushOpenData>): PushOpenData => ({ orgId: ORG, notificationId: ID, kind: null, ...over });

  test("goes to the place its push names", () => {
    expect(fallbackTarget(data({ kind: "approval", approvalId: "a1", channelId: "c1" }))?.to).toBe(
      "/org/$orgId/approvals",
    );
    expect(fallbackTarget(data({ kind: "routine_paused" }))?.to).toBe("/org/$orgId/routines");
    expect(fallbackTarget(data({ kind: "browser_handoff", channelId: "dm1" }))).toBeNull();
    expect(fallbackTarget(data({ kind: "machine_connected" }))).toEqual({
      to: "/org/$orgId/settings/$section",
      params: { section: "computers" },
    });
    expect(fallbackTarget(data({ kind: "join_request" }))).toEqual({
      to: "/org/$orgId/settings/$section",
      params: { section: "invites" },
    });
    expect(fallbackTarget(data({ kind: "mention", channelId: "c1", threadId: "t1" }))).toEqual({
      to: "/org/$orgId/threads/$threadId",
      params: { threadId: "t1" },
    });
    expect(fallbackTarget(data({ kind: "dm", channelId: "d1" }))).toEqual({
      to: "/org/$orgId/c/$channelId",
      params: { channelId: "d1" },
    });
    // At the message the push named, and the request itself.
    expect(fallbackTarget(data({ kind: "mention", channelId: "c1", messageId: "m1" }))).toEqual({
      to: "/org/$orgId/c/$channelId",
      params: { channelId: "c1" },
      search: { m: "m1" },
    });
    expect(fallbackTarget(data({ kind: "approval", approvalId: "a1" }))).toEqual({
      to: "/org/$orgId/approvals",
      search: { open: "a1" },
    });
    expect(fallbackTarget(data({ kind: "mission_stopped", missionId: "x1" }))).toEqual({
      to: "/org/$orgId/threads",
      search: { tab: "missions" },
    });
  });

  test("names nothing: the inbox", () => {
    expect(fallbackTarget(data({}))).toBeNull();
  });

  test("someone who joined by an invitation: a conversation with them, or Members when only the push is left", () => {
    // The notification names the person (ADR 0090): their DM.
    const accepted = openTarget(
      notification({
        id: ID,
        kind: "invitation_accepted",
        actors: [{ type: "user", id: "u-carla" }],
        source: { label: "Acme" },
        latest: { title: "Carla Dias" },
      }),
    );
    expect(accepted).toEqual({ to: "/org/$orgId/dm/person/$userId", params: { userId: "u-carla" } });
    expect(ROUTES.has("/org/$orgId/dm/person/$userId")).toBe(true);
    // A push names no person: Members, where they now are.
    expect(fallbackTarget(data({ kind: "invitation_accepted" }))).toEqual({
      to: "/org/$orgId/settings/$section",
      params: { section: "members" },
    });
  });

  test("every place it picks is a real page", () => {
    for (const { kind } of PUSHED) {
      const target = fallbackTarget(data({ kind, channelId: "c1", threadId: "t1", missionId: "x1" }));
      if (target) expect(ROUTES.has(target.to)).toBe(true);
    }
  });
});

describe("a ready computer whose agents have no AI", () => {
  const ready = { kind: "computer_ready" as const };
  const noAi = { any: false, agents: [{ agentId: "a", state: "no_ai" as const }] };
  test("opens Conectar uma IA, only then", () => {
    expect(opensConnectAi(ready, noAi)).toBe(true);
    expect(opensConnectAi(ready, { any: true, agents: [{ agentId: "a", state: "ready" }] })).toBe(false);
    expect(opensConnectAi(ready, { any: false, agents: [] })).toBe(false);
    expect(opensConnectAi(ready, undefined)).toBe(false);
    expect(opensConnectAi({ kind: "machine_connected" }, noAi)).toBe(false);
  });
});

// ── The service worker (public/sw.js) ───────────────────────────────────────

interface FakeWindow {
  url: string;
  focused: boolean;
  visibilityState: "visible" | "hidden";
  posted: unknown[];
  focus(): Promise<void>;
  postMessage(message: unknown): void;
}

const fakeWindow = (url: string): FakeWindow => ({
  url,
  focused: false,
  visibilityState: "hidden",
  posted: [],
  focus: async () => {},
  postMessage(message) {
    this.posted.push(message);
  },
});

async function loadWorker(windows: FakeWindow[]) {
  const source = await Bun.file(new URL("../public/sw.js", import.meta.url).pathname).text();
  const listeners = new Map<string, (event: unknown) => void>();
  const shown: { title: string; options: { data: unknown; tag?: string } }[] = [];
  const opened: string[] = [];
  const worker = {
    location: { origin: ORIGIN },
    navigator: { language: "pt-BR" },
    addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
    skipWaiting: () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => windows,
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
    registration: {
      showNotification: async (title: string, options: { data: unknown; tag?: string }) => {
        shown.push({ title, options });
      },
      getNotifications: async () => [],
    },
  };
  new Function("self", source)(worker);
  const fire = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const push = (payload: unknown) => fire("push", { data: { json: () => payload } });
  const click = (data: unknown) => fire("notificationclick", { notification: { close: () => {}, data } });
  return { shown, opened, push, click };
}

const PAYLOAD = {
  title: "Dev",
  body: "olha isso",
  tag: ID,
  url: `/org/${ORG}/notifications`,
  data: { orgId: ORG, kind: "mention", notificationId: ID, channelId: "c1", threadId: "t1" },
};

describe("the service worker", () => {
  test("with no tab open, a click opens the notification's own page", async () => {
    const sw = await loadWorker([]);
    await sw.push(PAYLOAD);
    expect(sw.shown).toHaveLength(1);
    await sw.click(sw.shown[0]?.options.data);
    expect(sw.opened).toEqual([pushOpenPath(ORG, ID)]);
  });

  test("with a tab open, it passes the tab the notification", async () => {
    const tab = fakeWindow(`${ORIGIN}/org/${ORG}/c/c9`);
    const sw = await loadWorker([tab]);
    await sw.push(PAYLOAD);
    await sw.click(sw.shown[0]?.options.data);
    expect(sw.opened).toEqual([]);
    expect(tab.posted).toEqual([
      {
        type: "agentes.push.open",
        url: pushOpenPath(ORG, ID),
        data: { orgId: ORG, notificationId: ID, kind: "mention", channelId: "c1", threadId: "t1" },
      },
    ]);
    // What the tab makes of it.
    expect(pushOpenFrom(tab.posted[0] as { url: unknown; data: unknown }, inApp)?.data?.notificationId).toBe(ID);
  });

  test("a push without a notification keeps its own address, on this site only", async () => {
    const sw = await loadWorker([]);
    await sw.push({ title: "x", url: `/org/${ORG}/routines` });
    await sw.push({ title: "y", url: "https://evil.example/phish" });
    await sw.push({ title: "z", url: "/api/app/me" });
    for (const { options } of sw.shown) await sw.click(options.data);
    expect(sw.opened).toEqual([`/org/${ORG}/routines`, "/", "/"]);
  });

  test("ids that would leave the inbox's path are not trusted", async () => {
    const sw = await loadWorker([]);
    await sw.push({ ...PAYLOAD, data: { orgId: "../../api/app", notificationId: ID } });
    await sw.click(sw.shown[0]?.options.data);
    expect(sw.opened).toEqual([`/org/${ORG}/notifications`]);
  });
});
