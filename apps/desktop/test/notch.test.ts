import { describe, expect, test } from "bun:test";
import type { ControlBrowser, ControlJob, ControlStatus } from "@agenteschat/adapters/runner-control";
import {
  BROWSER_BUSY_MS,
  DONE_MIN_MS,
  finishedOf,
  type NotchHome,
  type NotchWork,
  notchStateOf,
  oldestStart,
} from "../src/control/notch";
import { elapsedClock } from "../src/ui/time";

const status = (over: Partial<ControlStatus> = {}): ControlStatus => ({
  paired: true,
  connection: "online",
  version: "0.5.0",
  protocol: 12,
  paused: { paused: false },
  executors: {},
  agents: [{ id: "a1", handle: "dev", name: "Dev" }],
  org: { id: "o1", name: "Acme" },
  ...over,
});
const job = (over: Partial<ControlJob> = {}): ControlJob => ({
  id: "j1",
  kind: "exec",
  agent: { id: "a1", name: "Dev" },
  summary: "bun test",
  where: "acme-web",
  startedAt: "2026-10-20T15:00:00Z",
  ...over,
});
const home = (over: Partial<ControlStatus> = {}, jobs: ControlJob[] = []): NotchHome => ({
  homeId: "h1",
  status: status(over),
  jobs,
});
const using: ControlBrowser = { agentId: "a1", open: true, host: "app.acme.example" };
const asking: ControlBrowser = {
  agentId: "a1",
  open: true,
  host: "banco.acme.example",
  handoff: { status: "pending", request: "Digitar o código", link: "/org/o1/c/c1" },
};

describe("notchStateOf", () => {
  test("nothing going on: idle", () => {
    expect(notchStateOf([home()]).kind).toBe("idle");
    expect(notchStateOf([]).kind).toBe("idle");
  });
  test("a job: working, with what and where", () => {
    const s = notchStateOf([home({}, [job()])]);
    expect(s.kind).toBe("working");
    expect(s.work).toEqual([
      {
        key: "h1:j1",
        homeId: "h1",
        agent: { id: "a1", name: "Dev" },
        summary: "bun test",
        where: "acme-web",
        startedAt: "2026-10-20T15:00:00Z",
      },
    ]);
  });
  test("an agent in its browser shows once, as its browser", () => {
    const s = notchStateOf([home({ browsers: [using] }, [job({ kind: "brain", summary: "pensando" })])]);
    expect(s.work).toHaveLength(1);
    expect(s.work[0]).toMatchObject({ browser: true, where: "app.acme.example", agent: { name: "Dev" } });
  });
  test("a browser left open after its run isn't work: the notch goes idle", () => {
    const actedAt = "2026-10-20T15:00:00Z";
    const at = Date.parse(actedAt);
    const browsers = [{ ...using, actedAt }];
    expect(notchStateOf([home({ browsers })], at + 30_000).kind).toBe("working");
    expect(notchStateOf([home({ browsers })], at + BROWSER_BUSY_MS).kind).toBe("idle");
    // A person's turn still shows, however long ago the agent acted.
    expect(notchStateOf([home({ browsers: [{ ...asking, actedAt }] })], at + BROWSER_BUSY_MS).kind).toBe("needs");
  });
  test("a person needed wins, even paused", () => {
    const s = notchStateOf([home({ browsers: [asking], paused: { paused: true, until: null } })]);
    expect(s.kind).toBe("needs");
    expect(s.help[0]).toMatchObject({ agentId: "a1", request: "Digitar o código", host: "banco.acme.example" });
  });
  test("paused with nothing going on: idle, the notch hides", () => {
    expect(notchStateOf([home({ paused: { paused: true, until: null } })]).kind).toBe("idle");
  });
  test("paused beats working", () => {
    expect(notchStateOf([home({ paused: { paused: true, until: null } }, [job()])]).kind).toBe("paused");
  });
});

describe("finishedOf", () => {
  const start = Date.parse("2026-10-20T15:00:00Z");
  const w = (key: string, startedAt: string, agent = true): NotchWork => ({
    key,
    homeId: "h1",
    ...(agent ? { agent: { id: "a1", name: "Dev" } } : {}),
    summary: "bun test",
    startedAt,
  });
  test("the longest of what ended, once nothing is left", () => {
    const before = [w("a", "2026-10-20T15:00:00Z"), w("b", "2026-10-20T15:01:00Z")];
    expect(finishedOf(before, [], start + 120_000)).toEqual({ work: before[0] as NotchWork, ms: 120_000 });
  });
  test("nothing while work goes on, or for quick work", () => {
    const before = [w("a", "2026-10-20T15:00:00Z")];
    expect(finishedOf(before, [w("b", "2026-10-20T15:01:00Z")], start + 120_000)).toBeNull();
    expect(finishedOf(before, [], start + DONE_MIN_MS - 1)).toBeNull();
    expect(finishedOf([], [], start)).toBeNull();
  });
  test("work without an agent doesn't announce itself", () => {
    expect(finishedOf([w("a", "2026-10-20T15:00:00Z", false)], [], start + 120_000)).toBeNull();
  });
});

describe("clock", () => {
  test("elapsedClock", () => {
    expect(elapsedClock(41_000)).toBe("0:41");
    expect(elapsedClock(134_000)).toBe("2:14");
    expect(elapsedClock(3_909_000)).toBe("1:05:09");
    expect(elapsedClock(-5)).toBe("0:00");
  });
  test("oldestStart", () => {
    const work: NotchWork[] = [
      { key: "a", homeId: "h", summary: "", startedAt: "2026-10-20T15:01:00Z" },
      { key: "b", homeId: "h", summary: "", startedAt: "2026-10-20T15:00:00Z" },
      { key: "c", homeId: "h", summary: "" },
    ];
    expect(oldestStart(work)).toBe(Date.parse("2026-10-20T15:00:00Z"));
    expect(oldestStart([])).toBeNull();
  });
});
