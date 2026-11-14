import type { ActivitySaid, ControlBrowser, ControlJob } from "@agenteschat/adapters/runner-control";
import { browserRowState, browsersOf } from "./browser";
import type { Home } from "./store";

/** Preference: show the agents in the MacBook's notch (Preferências → Geral; off by default). */
export const NOTCH_PREF = "notch";

/** What the notch reads of a home. */
export type NotchHome = Pick<Home, "homeId" | "status" | "jobs">;

/** Something an agent is doing on this Mac now: a job, or its browser. */
export interface NotchWork {
  key: string;
  homeId: string;
  agent?: { id: string; name: string };
  summary: string;
  /** What it is, in words the app says (`saidText`); absent: `summary` as it came. */
  said?: ActivitySaid;
  where?: string;
  command?: string;
  startedAt?: string;
  browser?: boolean;
}

/** An agent waiting for a person in its browser (a sign-in, a code…). */
export interface NotchHelp {
  key: string;
  homeId: string;
  agentId: string;
  request?: string;
  link?: string;
  host?: string;
}

/**
 * What the notch shows: a person needed wins, even paused (as the tray's
 * dot); then paused, while work still goes on; then work. Nothing going on
 * hides it, paused or not: the island takes room in the menu bar only for
 * activity.
 */
export interface NotchState {
  kind: "idle" | "working" | "needs" | "paused";
  work: NotchWork[];
  help: NotchHelp[];
}

const jobWork = (h: NotchHome, j: ControlJob): NotchWork => ({
  key: `${h.homeId}:${j.id}`,
  homeId: h.homeId,
  ...(j.agent ? { agent: j.agent } : {}),
  summary: j.summary,
  ...(j.said ? { said: j.said } : {}),
  ...(j.where ? { where: j.where } : {}),
  ...(j.command ? { command: j.command } : {}),
  startedAt: j.startedAt,
});

/**
 * A browser counts as work this long after the agent's last command (it thinks between steps). Open
 * alone isn't work: the runner keeps it up 15 min idle, and the notch stayed on after the run.
 */
export const BROWSER_BUSY_MS = 90_000;

const browserBusy = (b: ControlBrowser, now: number) => {
  if (b.handoff || b.mode === "control" || !b.actedAt) return true;
  const at = Date.parse(b.actedAt);
  return !Number.isFinite(at) || now - at < BROWSER_BUSY_MS;
};

export function notchStateOf(homes: readonly NotchHome[], now = Date.now()): NotchState {
  const work: NotchWork[] = [];
  const help: NotchHelp[] = [];
  for (const h of homes) {
    const browsers = browsersOf(h.status).filter((b) => browserBusy(b, now));
    const inBrowser = new Set(browsers.map((b) => b.agentId));
    for (const b of browsers) {
      const state = browserRowState(b);
      const key = `${h.homeId}:browser:${b.agentId}`;
      if (state.kind === "needs") {
        help.push({
          key: `${key}:${state.request ?? ""}`,
          homeId: h.homeId,
          agentId: b.agentId,
          ...(state.request ? { request: state.request } : {}),
          ...(state.link ? { link: state.link } : {}),
          ...(b.host ? { host: b.host } : {}),
        });
      } else {
        const agent = h.status?.agents.find((a) => a.id === b.agentId);
        work.push({
          key,
          homeId: h.homeId,
          agent: { id: b.agentId, name: agent?.name ?? "" },
          summary: "",
          ...(b.host ? { where: b.host } : {}),
          browser: true,
        });
      }
    }
    // An agent in its browser shows once, as its browser (its thinking is what drives it), as in the popover.
    for (const j of h.jobs) {
      if (j.kind === "brain" && j.agent && inBrowser.has(j.agent.id)) continue;
      work.push(jobWork(h, j));
    }
  }
  const paused = homes.some((h) => h.status?.paused.paused);
  const kind = help.length > 0 ? "needs" : work.length === 0 ? "idle" : paused ? "paused" : "working";
  return { kind, work, help };
}

/** Work shorter than this ending doesn't announce itself (reading a file, a quick command). */
export const DONE_MIN_MS = 20_000;

/**
 * "Dev terminou": when the last work on this Mac ends, the longest of what just ended, if it ran long
 * enough to be worth saying. Null while something is still going on.
 */
export function finishedOf(
  before: readonly NotchWork[],
  after: readonly NotchWork[],
  now: number,
): { work: NotchWork; ms: number } | null {
  if (after.length > 0 || before.length === 0) return null;
  let best: { work: NotchWork; ms: number } | null = null;
  for (const w of before) {
    if (!w.agent || !w.startedAt) continue;
    const ms = now - Date.parse(w.startedAt);
    if (Number.isFinite(ms) && ms >= DONE_MIN_MS && (!best || ms > best.ms)) best = { work: w, ms };
  }
  return best;
}

/** The oldest work's start, for the wing's clock. */
export function oldestStart(work: readonly NotchWork[]): number | null {
  let oldest: number | null = null;
  for (const w of work) {
    const at = w.startedAt ? Date.parse(w.startedAt) : Number.NaN;
    if (Number.isFinite(at) && (oldest === null || at < oldest)) oldest = at;
  }
  return oldest;
}
