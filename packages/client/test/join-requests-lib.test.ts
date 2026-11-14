import { describe, expect, test } from "bun:test";
import type { TFunction } from "i18next";
import type { AppNotification, JoinStatus } from "../src/api/types";
import { approvalNews, askedLabel, askView, sendsEmail, typedCode } from "../src/lib/join-requests";
import { openTarget, sortWaiting } from "../src/lib/notifications";

const you = (patch: Partial<JoinStatus> = {}): JoinStatus => ({
  member: false,
  email: "ana@example.com",
  request: null,
  ...patch,
});

describe("askView: an invitation link's page", () => {
  test("signed out: the form, then sent (the answer comes by email)", () => {
    expect(askView({}, false)).toEqual({ state: "form" });
    expect(askView({}, true)).toEqual({ state: "sent" });
  });

  test("a link that no longer works says only that, except to a member, who is in", () => {
    const denied = you({ request: { status: "denied", reason: "Full team" } });
    expect(askView({ closed: true, you: denied }, true)).toEqual({ state: "closed" });
    expect(askView({ closed: true }, false)).toEqual({ state: "closed" });
    expect(askView({ closed: true, you: you({ member: true, orgId: "o1" }) }, false)).toEqual({
      state: "in",
      orgId: "o1",
      already: true,
    });
  });

  test("signed in: the server's answer wins over what the page knows", () => {
    expect(askView({ you: you() }, false)).toEqual({ state: "form" });
    expect(askView({ you: you({ request: { status: "pending", reason: null } }) }, false)).toEqual({ state: "sent" });
    expect(askView({ you: you({ request: { status: "approved", reason: null } }) }, true)).toEqual({
      state: "approvedEmail",
    });
    expect(askView({ you: you({ request: { status: "denied", reason: "Full team" } }) }, true)).toEqual({
      state: "denied",
      reason: "Full team",
    });
  });

  test("in: just approved, or a member before asking", () => {
    const approved = you({ member: true, orgId: "o1", request: { status: "approved", reason: null } });
    expect(askView({ you: approved }, true)).toEqual({ state: "in", orgId: "o1", already: false });
    expect(askView({ you: you({ member: true, orgId: "o1" }) }, false)).toEqual({
      state: "in",
      orgId: "o1",
      already: true,
    });
  });
});

describe("approving a request to join", () => {
  test("in at once, or invited by email: said in a toast", () => {
    expect(approvalNews({ outcome: "joined" })).toEqual({ said: "joined" });
    expect(approvalNews({ outcome: "invited", url: "https://x/invite/t", emailed: true })).toEqual({ said: "invited" });
  });

  test("a server that sends no email hands the admin the link to send", () => {
    expect(approvalNews({ outcome: "invited", url: "https://x/invite/t", emailed: false })).toEqual({
      send: "https://x/invite/t",
    });
  });
});

describe("whether this server sends email", () => {
  test("no: an expired invitation says whom to ask instead of its button, and the setup invites by link only", () => {
    expect(sendsEmail({ passwordReset: false })).toBe(false);
  });

  test("yes, an older server that doesn't say, or auth-config still loading: today's screens", () => {
    expect(sendsEmail({ passwordReset: true })).toBe(true);
    expect(sendsEmail({})).toBe(true);
    expect(sendsEmail(undefined)).toBe(true);
  });
});

test("when a request came in reads as a sentence: just now, some time ago, yesterday, or on a date", () => {
  const t = ((key: string, o?: Record<string, unknown>) =>
    o ? `${key} ${JSON.stringify(o)}` : key) as unknown as TFunction;
  const now = new Date(2026, 9, 26, 12, 0);
  const asked = (minutesAgo: number) =>
    askedLabel(t, "en", new Date(now.getTime() - minutesAgo * 60_000).toISOString(), now);
  expect(asked(0.5)).toBe("members.requests.askedNow");
  expect(asked(180)).toBe(`members.requests.asked ${JSON.stringify({ ago: 'format.hoursAgo {"count":3}' })}`);
  // "yesterday" in the reader's own words (Intl), lowercase where the language writes it so.
  expect(asked(24 * 60)).toBe(`members.requests.asked ${JSON.stringify({ ago: "yesterday" })}`);
  expect(asked(4 * 24 * 60)).toBe(`members.requests.askedOn ${JSON.stringify({ date: "Oct 22" })}`);
});

test("a code that proves an address: its digits only, at most six, however it was typed or pasted", () => {
  expect(typedCode("123 456")).toBe("123456");
  expect(typedCode("123-456")).toBe("123456");
  expect(typedCode(" 1234567")).toBe("123456");
  expect(typedCode("abc")).toBe("");
});

const waiting = (id: string, kind: AppNotification["kind"], updatedAt = "2026-10-26T10:00:00.000Z") =>
  ({ id, kind, waiting: true, source: { label: "Acme" }, actors: [], updatedAt }) as unknown as AppNotification;

test("a request to join opens People › Convites, and waits after what blocks someone's work", () => {
  expect(openTarget(waiting("j", "join_request"))).toEqual({
    to: "/org/$orgId/settings/$section",
    params: { section: "invites" },
  });
  const later = "2026-10-26T11:00:00.000Z";
  const list = sortWaiting([
    waiting("j", "join_request", later),
    waiting("ap", "approval"),
    waiting("q", "agent_question"),
  ]);
  expect(list.map((n) => n.id)).toEqual(["q", "ap", "j"]);
});
