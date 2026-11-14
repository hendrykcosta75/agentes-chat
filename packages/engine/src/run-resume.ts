import type { PubSub } from "@agenteschat/adapters";
import { and, type Database, type Executor, eq, schema, sql } from "@agenteschat/db";
import { routineBriefOfRun } from "./background";
import type { ToolResult } from "./brains/types";
import { deliverNotice, publishDelivery } from "./delivery";
import { pgSafeJson } from "./format";
import type { Message } from "./messages";
import type { Notice } from "./notices";
import { enqueue } from "./outbox";
import { missStaleRoutineRun } from "./routine-firing";
import { holdsMessages } from "./run-hold";
import { type AgentRun, replyThreadOf } from "./runs";
import { runStretchOf } from "./stretch";

const { agentRuns, messages } = schema;

/** A wait the run stopped waiting on (`waits.ts` `detachWait`): its result comes later as a notice. */
export interface DetachedWait {
  waitId: string;
  /** `browser_handoff`, `consultation`… */
  kind: string;
  /** Who the late notice is from, as the agent reads it ("Your request for help in the browser"). */
  from: string;
  at: string;
}

/** The part of a run's transcript these helpers read and write (the engine's `Transcript`). */
export interface StoredTranscript {
  pending?: {
    calls: {
      toolUseId: string;
      name: string;
      waitId?: string;
      approvalId?: string;
      questionId?: string;
      secretRequestId?: string;
      bridged?: boolean;
      result?: { content: string; isError: boolean };
    }[];
  };
  waitingForBrain?: { kind: string; machineId: string; code: string; waitId?: string };
  consulted?: { agentId: string; consultationId: string; status: string; question?: string; answer?: string | null }[];
  /** Waits it stopped waiting on (`detachWait`): their results come as notices. */
  detachedWaits?: DetachedWait[];
  [key: string]: unknown;
}

/**
 * A run paused on a wait (a mission's blocking `ask_decision` or
 * `request_review`, help in the browser, another agent's answer: the tool
 * returned `data.pause` with the wait's id) gets its result: the waiting
 * call's result is set and the run is queued again; the engine resumes it
 * like after an approval (model brain: the tool result; computer brain: the
 * text in its session).
 *
 * A wait the run stopped waiting on (a person wrote meanwhile: `detachWait`)
 * gets its result as a notice instead (`late`, default a `wait_result` with
 * the result's text), once: to the run while it is still active, else to its
 * conversation (`deliverNoticeToRun`). Null: the run doesn't wait on that id
 * (anymore), nor stopped waiting on it.
 */
export async function resumeRunWithResult(
  db: Database,
  input: {
    runId: string;
    waitId: string;
    result: ToolResult;
    /** An agent it consulted (`ask_agent`): its reply's `meta.consulted` card. */
    consulted?: { agentId: string; consultationId: string; status: string; question?: string; answer?: string | null };
    /** The notice when the wait was detached (default: a `wait_result` with the result's text). */
    late?: Omit<Notice, "refs">;
    /** Publishes a late notice (none: written only; the agent reads it all the same). */
    pubsub?: PubSub;
    /** Only a run still waiting on it: no late notice (the agent itself ended the wait, nothing to tell it). */
    waitingOnly?: boolean;
  },
): Promise<{ runId: string; notice?: Message } | null> {
  const resumed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(agentRuns).where(eq(agentRuns.id, input.runId)).for("update");
    if (!row) return null;
    const t = row.transcript as StoredTranscript | null;
    const waiting = row.status === "waiting_input" || row.status === "waiting_approval";
    const call = waiting ? t?.pending?.calls.find((c) => c.waitId === input.waitId && !c.result) : undefined;
    if (!t || !call) {
      if (input.waitingOnly) return null;
      // Not waiting on it (anymore): a wait it stopped waiting on gets its result as a notice, once.
      const detached = t?.detachedWaits?.find((d) => d.waitId === input.waitId);
      if (!detached || (await lateNoticeSent(tx, row, input.waitId))) return null;
      const delivered = await deliverNoticeToRun(tx, row, {
        kind: input.late?.kind ?? "wait_result",
        text: input.late?.text ?? input.result.content,
        from: input.late?.from ?? detached.from,
        refs: { waitId: input.waitId, runId: row.id },
      });
      return { runId: row.id, delivered };
    }
    call.result = { content: input.result.content, isError: input.result.isError === true };
    if (input.consulted) t.consulted = [...(t.consulted ?? []), input.consulted];
    await tx
      .update(agentRuns)
      .set({ transcript: pgSafeJson(t) as Record<string, unknown>, updatedAt: new Date() })
      .where(eq(agentRuns.id, row.id));
    await enqueue(tx, {
      orgId: row.orgId,
      kind: "agent_run.execute",
      payload: { runId: row.id },
      // Per call: the run may wait on the same id again later (a browser tool while the person still holds it).
      dedupeKey: `agent_run.execute:${row.id}:wait:${input.waitId}:${call.toolUseId}`,
      maxAttempts: 4,
    });
    return { runId: row.id, delivered: null };
  });
  if (!resumed) return null;
  if (!resumed.delivered) return { runId: resumed.runId };
  await publishDelivery(input.pubsub, resumed.delivered).catch(() => {});
  return { runId: resumed.runId, notice: resumed.delivered.message };
}

/**
 * The late notice of a detached wait is already written (a sweep resuming
 * again, two results racing). Looked up on the messages: the run's own
 * transcript may be rewritten by its executor meanwhile.
 */
export async function lateNoticeSent(
  tx: Executor,
  run: Pick<AgentRun, "orgId" | "channelId" | "agentId">,
  waitId: string,
) {
  const [sent] = await tx
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.orgId, run.orgId),
        eq(messages.channelId, run.channelId),
        eq(messages.authorAgentId, run.agentId),
        sql`${messages.meta}->'notice'->'refs'->>'waitId' = ${waitId}`,
      ),
    )
    .limit(1);
  return Boolean(sent);
}

const ACTIVE: AgentRun["status"][] = ["queued", "running", "waiting_approval", "waiting_input"];

/**
 * Where a run's background work reported once it ended (ADR 0121): home, the conversation it was asked in. The run
 * itself still points at the work's own thread (the anchor's), where its updates went and nobody looks after the
 * report. Undefined: the run has no work, its work kept the thread it was asked in, or it is still on.
 */
async function workHome(tx: Executor, run: Pick<AgentRun, "id" | "orgId">) {
  const { agentWorks } = schema;
  const [work] = await tx
    .select({ channelId: agentWorks.channelId, threadId: agentWorks.homeThreadId, status: agentWorks.status })
    .from(agentRuns)
    .innerJoin(agentWorks, and(eq(agentWorks.id, agentRuns.workId), eq(agentWorks.orgId, agentRuns.orgId)))
    .where(and(eq(agentRuns.orgId, run.orgId), eq(agentRuns.id, run.id), eq(agentWorks.ownThread, true)));
  if (!work || work.status === "live" || work.status === "queued") return undefined;
  return { channelId: work.channelId, threadId: work.threadId };
}

/**
 * A notice for one run (another agent's answer, a late result): while the
 * run is still active it reads it at its next step (queued on that run, in
 * its conversation); once it ended (or while it is held by a decision), the notice goes to its conversation and
 * joins the agent's run there or starts one (a self-report about the run, `SELF_REPORT_NOTICES`, only waits for its next turn), in the run's stretch: past its limits the run is held for the pause
 * card (ADR 0089), and the notice is still read by the agent's next run there. A routine's run that ended hears
 * it where the routine reports, like its approval cards: nobody reads its room; a run whose background work ended
 * hears it where that work reported (`workHome`), so what it answers shows in the conversation, not in the work's
 * thread. `wake: false`: only written there,
 * for a notice that wakes the agent right after it (`reportHandOffs`) or that no run should read. `joinRun: false`:
 * never read by the run itself, even while it is active (a routine's hand-offs, which come back where it reports). In the caller's
 * transaction; publish with `publishDelivery` after the commit.
 */
export async function deliverNoticeToRun(
  tx: Executor,
  run: Pick<
    AgentRun,
    | "id"
    | "orgId"
    | "agentId"
    | "channelId"
    | "threadRootId"
    | "triggerMessageId"
    | "hop"
    | "trigger"
    | "stretchId"
    | "background"
  >,
  notice: Notice,
  options: { wake?: boolean; joinRun?: boolean } = {},
): Promise<{ message: Message; runs: AgentRun[] }> {
  const wake = options.wake !== false;
  let active = false;
  if (wake && options.joinRun !== false) {
    const [current] = await tx
      .select({ id: agentRuns.id, orgId: agentRuns.orgId, status: agentRuns.status })
      .from(agentRuns)
      .where(eq(agentRuns.id, run.id))
      .for("update");
    // A run held by a decision (an approval, a secret, a mission's) reads nothing new until it comes: the
    // notice wakes the agent in a run of its own instead.
    active = Boolean(current && ACTIVE.includes(current.status) && !(await holdsMessages(tx, current)));
  }
  const report = active
    ? undefined
    : run.background
      ? (await routineBriefOfRun(tx, run))?.deliverTo
      : await workHome(tx, run);
  const into = {
    orgId: run.orgId,
    agentId: run.agentId,
    channelId: report?.channelId ?? run.channelId,
    threadId: report ? report.threadId : replyThreadOf(run),
    hop: run.hop,
    stretchId: runStretchOf(run),
    notice,
    body: forPeople(notice),
    trigger: run.trigger === "dm" ? ("dm" as const) : ("mention" as const),
  };
  if (!wake) return deliverNotice(tx, { ...into, wake: false });
  const delivered = await deliverNotice(tx, { ...into, wake: !active });
  if (active) {
    await tx
      .update(agentRuns)
      .set({ pendingMessageIds: sql`array_append(${agentRuns.pendingMessageIds}, ${delivered.message.id}::uuid)` })
      .where(eq(agentRuns.id, run.id));
  }
  return delivered;
}

/**
 * What people see of a notice (a compact card; the agent reads `notice.text`):
 * the same words without `@handle`s, so another agent's words never mention
 * (and start) an agent.
 */
export function forPeople(notice: Notice) {
  const text = [notice.from, notice.text].filter(Boolean).join(": ");
  return text.replace(/(^|[^\w@.])@(?=[a-zA-Z0-9])/g, "$1").slice(0, 40_000);
}

/**
 * The agent's computer is back (ADR 0032 §5): runs that waited for its
 * computer brain (no model credential to fall back on) are queued again.
 * Found by `agent_runs.waiting_machine_id` (indexed, set only while a run
 * waits for its computer); one job per wait (`waitingForBrain.waitId`), so
 * reconnects while the job is still queued don't add more. A routine's run
 * whose slot is more than 12 hours old doesn't run late: it is missed
 * (`missStaleRoutineRun`, ADR 0053 §6.4). A run parked on its CLI's failure (`parkOutage`) whose agent's sign-in
 * never answered a turn stays on its own resume: the computer coming back changes nothing there. Returns the runs
 * queued again.
 */
export async function resumeRunsWaitingForMachine(
  db: Database,
  machineId: string,
  options: { pubsub?: PubSub; now?: Date } = {},
): Promise<string[]> {
  const rows = await db
    .select({
      id: agentRuns.id,
      orgId: agentRuns.orgId,
      background: agentRuns.background,
      waitId: sql<string | null>`${agentRuns.transcript}->'waitingForBrain'->>'waitId'`,
      updatedAt: agentRuns.updatedAt,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.waitingMachineId, machineId),
        eq(agentRuns.status, "waiting_input"),
        // The computer coming back says nothing about a plan's limit or a budget.
        sql`coalesce(${agentRuns.transcript}->'waitingForBrain'->>'code', '') not in ('plan_limit', 'budget', 'usage_pause')`,
        // `last_used_at` too: only a turn that answered sets it, and older rows of other CLIs than Claude Code have
        // no `last_success_at`.
        sql`not (${agentRuns.transcript} ? 'outage' and exists (select 1 from agents a join machine_accounts ma
          on ma.org_id = a.org_id and ma.id = a.brain_account_id
          where a.org_id = ${agentRuns.orgId} and a.id = ${agentRuns.agentId}
          and coalesce(ma.last_success_at, ma.last_used_at) is null))`,
      ),
    )
    .limit(200);
  const resumed: string[] = [];
  for (const r of rows) {
    if (r.background && (await missStaleRoutineRun({ db, pubsub: options.pubsub }, r.id, options.now))) continue;
    resumed.push(r.id);
    await enqueue(db, {
      orgId: r.orgId,
      kind: "agent_run.execute",
      payload: { runId: r.id, ...(r.waitId ? { wait: r.waitId } : {}) },
      // The wait's own id (older waits: when the run started waiting, which no reconnect changes).
      dedupeKey: `agent_run.execute:${r.id}:brain_back:${r.waitId ?? r.updatedAt.getTime()}`,
      maxAttempts: 4,
    });
  }
  return resumed;
}
