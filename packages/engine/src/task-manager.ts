import { and, type Database, eq, inArray, rowsOf, schema, sql } from "@agenteschat/db";
import { planOf as codingPlan, PLAN_IDS, planModel } from "@agenteschat/providers/plans";
import { CONSULT_SUBJECT_CHARS, consultSubject } from "@agenteschat/ui/agent-talk";
import {
  type AgentWorkState,
  agentsOnlyIn,
  anchorsSql,
  outageIn,
  waitSinceIn,
  waitsOnViewerIn,
  workStateOf,
} from "./agent-work";
import { runAuthorityById } from "./authority";
import type { ModelScope } from "./brains/select";
import { TtlCache } from "./cache";
import { computerQueue as lineOfComputer, seesRunSql } from "./computer-queue";
import { isAgentOnlyDm } from "./dms";
import { NotFoundError } from "./errors";
import { type CanceledReturn, canceledReturns, type PendingReturn, pendingReturns } from "./follow-through";
import { replyExcerpt } from "./messages";
import { can, requireActiveMembership } from "./organizations";
import { pendingIds } from "./recovery";
import { shownStatusSql } from "./runs";
import { channelReaderSql } from "./task-access";
import { mayContinuePause } from "./usage-pause";

/**
 * The task manager (ADR 0128): every task the caller may see, what each one uses right now, each agent's activity
 * over the last hour and what ended since `since`. Who sees what is `seesRunSql`: the conversations the caller is in
 * (`listWorkingRuns`), plus what no person is a member of (routines' background runs, agents' private conversations)
 * for admins (`manage_agents`) and for the agent's owner. The rest only counts (`hidden`). No cost: people stop work
 * here, they don't audit spend.
 */

const {
  agentConsultations,
  agentRuns,
  agentRunSteps,
  agents,
  channels,
  machines,
  messages,
  routineRuns,
  routines,
  threads,
  users,
} = schema;

/** Tasks listed at most, and ended ones. */
export const TASK_MANAGER_MAX = 100;
export const TASK_MANAGER_ENDED_MAX = 50;
/** Minutes in an agent's activity line (one point per minute, oldest first). */
export const ACTIVITY_MINUTES = 60;

/** What a task uses right now: its latest tool call (the same fields as the chat's live chip, `agent.tool`). */
export interface TaskNow {
  /** The tool's name (`browser_do`, `run_code`, `github_create_pull_request`…). */
  tool: string;
  /** A short label: the command, the issue, the file (built-in tools only). */
  detail: string | null;
  /** The app, for a connector's tool. */
  connector: string | null;
  /** The service it works in, for its logo (`ToolDefinition.service`), and a custom server's own icon. */
  service: string | null;
  serviceIcon: string | null;
  at: string;
}

export type TaskStatus = "queued" | "running" | "waiting_approval" | "waiting_input";

/** What a `waiting_input` run waits on, as its transcript has it (`waitingForBrain`), for the apps to say why. */
export interface TaskWait {
  /** The wait's code: `usage_pause`, `plan_limit`, `budget`, `busy`, `work_queue`, or what keeps its computer away. */
  code: string;
  /** Runs with the same key wait on the same plan or budget (`usageWaitKey`). */
  key: string | null;
  /** The plan in words ("Claude"); null for a budget. */
  plan: string | null;
  /** A plan wait on one model's refusal (its own limit, the region it needs, switched off): the model's name, and which. */
  model: string | null;
  scope: ModelScope | null;
  /** Long work paused near a limit (`usage_pause`): how far along, and the plan's window. */
  percent: number | null;
  window: string | null;
  /** When the limit resets; null when unknown. */
  resetsAt: string | null;
  /** When it began waiting on its plan or budget (`usageWait.since`, across its re-parks); null when unknown. */
  since: string | null;
  /** The caller may press Continuar agora (`mayContinuePause`; the server checks again). */
  canContinue: boolean;
}

/** Work one agent asked of another, in their private conversation (`ask_agent`, `tell_agent`, ADR 0034, ADR 0095). */
export interface TaskDelegation {
  /** The agent that asked. */
  agentId: string;
  /** What started the chain: a person, a routine, or an agent on its own. */
  origin: { kind: "person"; userId: string; name: string } | { kind: "routine"; name: string } | { kind: "agent" };
  /**
   * Where it was handed off (`anchorsSql`), when the caller reads that conversation: its thread and the reply that
   * handed it, once posted. Null: they don't, or nobody does (a routine's room).
   */
  from: {
    channelId: string;
    channelKind: "channel" | "dm" | "task";
    channelName: string | null;
    threadId: string | null;
    messageId: string | null;
    /** The thread's title (≤ 80, plain text), never a message's words (`labelOf`); null without one. */
    label: string | null;
  } | null;
}

export interface ManagedTask {
  runId: string;
  agentId: string;
  channelId: string;
  channelKind: "channel" | "dm";
  /** Null for a DM (and a routine's room). */
  channelName: string | null;
  /** A conversation only agents are in: nobody can open it, its steps say what happens there. */
  betweenAgents: boolean;
  /** Null: the main timeline. */
  threadId: string | null;
  status: TaskStatus;
  startedAt: string | null;
  createdAt: string;
  /** What it works on: the long work's title, else the thread's, never its first message's words (≤ 80, plain text). */
  label: string | null;
  /** A routine's background run. */
  background: boolean;
  /** The routine behind it, for a background run. */
  routine: { id: string; name: string } | null;
  /** Long work (ADR 0121): its plan's progress. */
  plan: { done: number; total: number } | null;
  /** Who asked: a person's name, or null (another agent, a routine, an event). */
  requester: { userId: string; name: string } | null;
  /** Another agent asked it, in their private conversation. */
  delegation: TaskDelegation | null;
  /**
   * What the latest agent to ask it asked, one line (`consultSubject`): what its row is called by. Null unless the caller
   * reads where it was handed off (`delegation.from`): the question's words come from a conversation they may not read.
   */
  subject: string | null;
  /** What it asked of other agents and is still on or not started, all the way down: they stop with it in one action. */
  helpers: number;
  /** The brain it thinks with (`model`, `claude_code`, `codex`, `cursor`); null before its first turn. */
  brain: string | null;
  /** The agent's computer, for a computer brain or computer tools. */
  machine: { id: string; name: string } | null;
  now: TaskNow | null;
  /** Tool calls so far. */
  steps: number;
  /** Messages sent to it while it works that it hasn't read yet. */
  pendingMessageIds: string[];
  /** The caller may stop it (`mayStopRun`: who asked, the agent's owner, an admin; the server checks again). */
  canStop: boolean;
  /**
   * What a `waiting_input` run waits on when it isn't a person: its computer with no room for the turn
   * (`computer_busy`), its computer away (`computer_offline`), its plan's limit (`plan`) or the agent's budget
   * (`budget`). Null: it waits on a person's answer, or it isn't waiting.
   */
  held: "computer_busy" | "computer_offline" | "plan" | "budget" | null;
  /**
   * Its place in its computer's line for room (`computer_busy`, ADR 0032 "Calm waits"), as the line's own view gives
   * it (`computerQueue`). `people`: a person waits on it (it goes before agents' work).
   */
  line: {
    machineId: string;
    position: number;
    of: number;
    people: boolean;
    /** When it should start, from the line's estimates; null with no basis. */
    estimatedStartAt: string | null;
  } | null;
  /** Why a `waiting_input` run waits on no person's answer yet; null for any other run. */
  wait: TaskWait | null;
  /**
   * How it stands for the caller, as an agent's line says it (`workStateOf`, ADR 0084 addendum): waiting on them, at
   * work, a wait on someone or something else, or in line, and since when by the lists' clock (work another agent
   * handed it from the hand-off, a wait from its own start, a card's when it waits on a person). Null: it waits on its
   * plan or budget (`held` says which).
   */
  work: {
    state: AgentWorkState;
    since: string;
    /** The card it waits on, when it waits on a person (the oldest): its message, where its row opens. */
    card: string | null;
  } | null;
}

/** A computer with work on it or a line for its room: the task manager's computers row and "Ver fila". */
export interface ComputerSummary {
  id: string;
  name: string;
  /** Turns running on it now (people's and agents'), counted across the workspace. */
  working: number;
  /** Turns waiting for room (the line), counted across the workspace. */
  inLine: number;
}

export interface EndedTask {
  runId: string;
  agentId: string;
  channelId: string;
  channelKind: "channel" | "dm";
  channelName: string | null;
  betweenAgents: boolean;
  threadId: string | null;
  status: "done" | "failed" | "canceled";
  label: string | null;
  background: boolean;
  routine: { id: string; name: string } | null;
  startedAt: string | null;
  finishedAt: string;
  /** Stopped by a person: who. */
  stoppedBy: { userId: string; name: string } | null;
}

/** The workspace's work the caller may not see: how much, never what. */
export interface HiddenTasks {
  /** Tasks still on. */
  total: number;
  /** Of them, running now. */
  working: number;
  /** Per agent: its tasks still on. */
  byAgent: Record<string, number>;
}

export interface TaskManagerView {
  tasks: ManagedTask[];
  ended: EndedTask[];
  hidden: HiddenTasks;
  /** The workspace's computers with turns running or waiting: counts only (everyone sees the line, not its content). */
  computers: ComputerSummary[];
  /** Per agent with work in the last hour: tool calls per minute, `ACTIVITY_MINUTES` points, oldest first. */
  activity: Record<string, number[]>;
  /** "Retornos": the returns agents set that are still to come, where the caller reads (`pendingReturns`). */
  followUps: PendingReturn[];
  /** The returns canceled since `since` ("Terminadas hoje"), the latest first. */
  canceledFollowUps: CanceledReturn[];
  /**
   * The caller's tasks done since `since`, all of them (`ended` stops at `TASK_MANAGER_ENDED_MAX`). Only when asked
   * (`doneToday: true`): a count over every finished run, which callers polling for the tasks alone never show.
   */
  doneToday?: number;
}

type Row = {
  id: string;
  agent_id: string;
  channel_id: string;
  status: string;
  thread_root_id: string;
  trigger_message_id: string;
  started_at: string | Date | null;
  created_at: string | Date;
  finished_at: string | Date | null;
  error: string | null;
  kind: "channel" | "dm";
  name: string;
  dm_key: string | null;
  title: string | null;
  pending: string[] | string | null;
  background: boolean | string;
  brain: string | null;
  owner_user_id: string | null;
  machine_id: string | null;
  machine_name: string | null;
  requester_id: string | null;
  requester_name: string | null;
  asker_agent_id: string | null;
  question: string | null;
  routine_id: string | null;
  routine_name: string | null;
  work_title: string | null;
  work_plan: { state: string }[] | string | null;
  last_data: Record<string, unknown> | string | null;
  last_at: string | Date | null;
  steps: number | string | null;
  stopper_name: string | null;
  wait: StoredWait | string | null;
  wait_pause: { used?: number; window?: string } | string | null;
  routine_creator: string | null;
  waiting_machine_id: string | null;
  /** Still on only: it waits on the caller, on its AI provider's outage, and since when it waits. */
  you: boolean | string;
  outage: boolean | string;
  wait_since: string | Date | null;
  card_id: string | null;
  /** Still on only: when another agent handed it this work (`HANDED_AT`). */
  handed_at: string | Date | null;
};

/** The fields of `waitingForBrain` (the executor's `Transcript`) the task manager says. */
interface StoredWait {
  code?: string;
  source?: string;
  plan?: string;
  model?: string | null;
  scope?: ModelScope;
  resetsAt?: string;
  waitKey?: string;
  /** Ms. */
  since?: number;
}

const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString());
const truthy = (v: boolean | string) => v === true || v === "t";
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const parsed = <T>(v: T | string | null): T | null => (typeof v === "string" ? (JSON.parse(v) as T) : v);

/** The columns of a run named `r`, on channel `c` and agent `a`, as `seesRunSql` reads them. */
const RUN_COLUMNS = {
  channelId: sql`c.id`,
  kind: sql`c.kind`,
  dmKey: sql`c.dm_key`,
  background: sql`r.background`,
  ownerUserId: sql`a.owner_user_id`,
};

/** The oldest card a run waiting on a person waits on (an approval, a question, a secret): its message. */
const CARD_OF_RUN = sql`(case when r.status in ('waiting_approval', 'waiting_input') then (
    select x.message_id from (
      select pa.message_id, pa.created_at from approvals pa
        where pa.org_id = r.org_id and pa.run_id = r.id and pa.status = 'pending'
      union all select q.message_id, q.created_at from agent_questions q
        where q.org_id = r.org_id and q.run_id = r.id and q.status = 'open'
      union all select s.message_id, s.created_at from secret_requests s
        where s.org_id = r.org_id and s.run_id = r.id and s.status = 'pending'
    ) x where x.message_id is not null order by x.created_at limit 1) end)`;

/**
 * When another agent handed a run its work: the latest ask it answers, for a run of two agents' DM (not a routine's
 * room, not a background run), as `anchorsSql`'s `handed_at`. An agent's line counts that work from there.
 */
const HANDED_AT = sql`(case when not r.background and ${agentsOnlyIn("c")} and c.dm_key not like 'routine|%' then (
    select max(ac.created_at) from ${agentConsultations} ac where ac.org_id = r.org_id and ac.target_run_id = r.id) end)`;

/** The runs the caller sees, by status (`active`: still on; else ended since `since`). */
async function visibleRuns(
  db: Database,
  userId: string,
  orgId: string,
  manages: boolean,
  which: { active: true } | { active: false; since: Date },
): Promise<Row[]> {
  const status = which.active
    ? sql`r.status in ('queued', 'running', 'waiting_approval', 'waiting_input')`
    : // Stopped to read a message a person sent it (`stoppedToSend`): the task goes on in the run that message
      // started, so this half of it is no task that ended.
      sql`r.status in ('done', 'failed', 'canceled') and r.finished_at >= ${which.since.toISOString()}::timestamptz
        and not (r.status = 'canceled' and exists (
          select 1 from ${messages} sm
          where sm.org_id = r.org_id and sm.channel_id = r.channel_id and sm.created_at >= r.created_at
            and sm.meta->'stoppedRunIds' @> to_jsonb(r.id::text)))`;
  const limit = which.active ? TASK_MANAGER_MAX : TASK_MANAGER_ENDED_MAX;
  return rowsOf<Row>(
    await db.execute(sql`select r.id, r.agent_id, r.channel_id, ${shownStatusSql} as status, r.thread_root_id, r.trigger_message_id,
        r.started_at, r.created_at, r.finished_at, r.error, c.kind, c.name, c.dm_key, t.title,
        array_to_json(r.pending_message_ids) as pending, r.background, r.brain,
        a.owner_user_id, a.machine_id, mc.name as machine_name,
        trig.author_user_id as requester_id, ru.name as requester_name, trig.author_agent_id as asker_agent_id,
        ${which.active ? sql`consult.question` : sql`null`} as question,
        rt.id as routine_id, rt.name as routine_name, w.title as work_title, w.plan as work_plan,
        last.data as last_data, last.created_at as last_at,
        (select count(*) from ${agentRunSteps} s where s.run_id = r.id and s.kind = 'tool_call') as steps,
        su.name as stopper_name,
        coalesce(r.transcript->'waitingForBrain', case when r.status = 'running' and r.waiting_machine_id is not null
          then '{"code":"busy"}'::jsonb end) as wait, pause.data as wait_pause, r.waiting_machine_id,
        rt.created_by_user_id as routine_creator,
        ${which.active ? waitsOnViewerIn("r", userId) : sql`false`} as you,
        ${which.active ? outageIn("r") : sql`false`} as outage,
        ${which.active ? waitSinceIn("r") : sql`null`} as wait_since,
        ${which.active ? CARD_OF_RUN : sql`null`} as card_id,
        ${which.active ? HANDED_AT : sql`null`} as handed_at
      from ${agentRuns} r
      join ${channels} c on c.id = r.channel_id and c.org_id = ${orgId}::uuid
        and c.archived_at is null and c.kind in ('channel', 'dm')
      join ${agents} a on a.id = r.agent_id and a.org_id = ${orgId}::uuid
      left join ${machines} mc on mc.org_id = ${orgId}::uuid and mc.id = a.machine_id
      left join ${schema.agentWorks} w on w.id = r.work_id
      left join ${threads} t on t.org_id = ${orgId}::uuid and t.root_message_id = r.thread_root_id
      left join lateral (
        select m.author_user_id, m.author_agent_id from ${messages} m
        where m.org_id = ${orgId}::uuid and m.id = r.trigger_message_id
        limit 1
      ) trig on true
      ${
        which.active
          ? sql`left join lateral (
        select left(ac.question, ${CONSULT_SUBJECT_CHARS * 8}::int) as question from ${agentConsultations} ac
        where ac.org_id = ${orgId}::uuid and ac.target_run_id = r.id
        order by ac.created_at desc limit 1
      ) consult on true`
          : sql``
      }
      left join ${users} ru on ru.id = trig.author_user_id
      left join ${users} su on r.error like 'canceled_by:%' and su.id = substring(r.error from 13)
      left join ${routineRuns} rr on rr.org_id = ${orgId}::uuid and rr.agent_run_id = r.id
      left join ${routines} rt on rt.id = rr.routine_id
      left join lateral (
        select s.data, s.created_at from ${agentRunSteps} s
        where s.run_id = r.id and s.kind = 'tool_call'
        order by s.seq desc limit 1
      ) last on ${which.active ? sql`true` : sql`false`}
      left join lateral (
        select s.data->'pause' as data from ${agentRunSteps} s
        where s.run_id = r.id and s.kind = 'error' and s.data->>'reason' = 'usage_wait'
        order by s.seq desc limit 1
      ) pause on ${which.active ? sql`r.transcript->'waitingForBrain'->>'code' = 'usage_pause'` : sql`false`}
      where r.org_id = ${orgId}::uuid and ${status} and ${seesRunSql(RUN_COLUMNS, userId, orgId, manages)}
      order by ${which.active ? sql`r.created_at desc` : sql`r.finished_at desc`}, r.id desc
      limit ${limit}`),
  );
}

/** How many of the runs the caller sees ended done since `since`. */
async function doneSince(db: Database, userId: string, orgId: string, manages: boolean, since: Date) {
  const [row] = rowsOf<{ n: number | string }>(
    await db.execute(sql`select count(*) as n
      from ${agentRuns} r
      join ${channels} c on c.id = r.channel_id and c.org_id = ${orgId}::uuid
        and c.archived_at is null and c.kind in ('channel', 'dm')
      join ${agents} a on a.id = r.agent_id and a.org_id = ${orgId}::uuid
      where r.org_id = ${orgId}::uuid and r.status = 'done' and r.finished_at >= ${since.toISOString()}::timestamptz
        and ${seesRunSql(RUN_COLUMNS, userId, orgId, manages)}`),
  );
  return Number(row?.n ?? 0);
}

/** The tasks still on that `visibleRuns` leaves out, as counts: the computers' rows count them all. */
async function hiddenTasks(db: Database, userId: string, orgId: string, manages: boolean): Promise<HiddenTasks> {
  const rows = rowsOf<{ agent_id: string; n: number | string; working: number | string }>(
    await db.execute(sql`select r.agent_id, count(*) as n, count(*) filter (where ${shownStatusSql} = 'running') as working
      from ${agentRuns} r
      join ${channels} c on c.id = r.channel_id and c.org_id = ${orgId}::uuid
      join ${agents} a on a.id = r.agent_id and a.org_id = ${orgId}::uuid
      where r.org_id = ${orgId}::uuid and r.status in ('queued', 'running', 'waiting_approval', 'waiting_input')
        and (c.archived_at is not null or c.kind not in ('channel', 'dm')
          or not ${seesRunSql(RUN_COLUMNS, userId, orgId, manages)})
      group by r.agent_id`),
  );
  return {
    total: rows.reduce((sum, r) => sum + Number(r.n), 0),
    working: rows.reduce((sum, r) => sum + Number(r.working), 0),
    byAgent: Object.fromEntries(rows.map((r) => [r.agent_id, Number(r.n)])),
  };
}

// ponytail: per-process, a minute stale at most: the list asks again every few seconds for every viewer.
const originCache = new TtlCache<TaskDelegation["origin"]>(60_000);

/** What started a run's chain. */
const originOf = (db: Database, orgId: string, runId: string) =>
  originCache.getOrLoad(runId, async (): Promise<TaskDelegation["origin"]> => {
    const a = await runAuthorityById(db, orgId, runId);
    if (a.kind === "person") {
      const [person] = await db.select({ name: users.name }).from(users).where(eq(users.id, a.personId));
      return { kind: "person", userId: a.personId, name: person?.name ?? "" };
    }
    return a.brief ? { kind: "routine", name: a.brief.name } : { kind: "agent" };
  });

/** Who asked each run of agents' private conversations, what started its chain and where, by run id. */
async function delegationsOf(db: Database, userId: string, orgId: string, rows: Row[]) {
  const asked = rows.filter((r) => betweenAgents(r) && r.asker_agent_id);
  const [origins, places] = await Promise.all([
    Promise.all(asked.map((r) => originOf(db, orgId, r.id))),
    handedFrom(
      db,
      userId,
      orgId,
      asked.map((r) => r.id),
    ),
  ]);
  return new Map(
    asked.map((r, i): [string, TaskDelegation] => [
      r.id,
      {
        agentId: r.asker_agent_id as string,
        origin: origins[i] as TaskDelegation["origin"],
        from: places.get(r.id) ?? null,
      },
    ]),
  );
}

/** Where each of these runs was handed off, for runs whose place `userId` reads (`channelReaderSql`), by run id. */
async function handedFrom(db: Database, userId: string, orgId: string, runIds: string[]) {
  if (runIds.length === 0) return new Map<string, NonNullable<TaskDelegation["from"]>>();
  const rows = rowsOf<{
    run_id: string;
    channel_id: string;
    kind: "channel" | "dm" | "task";
    name: string;
    thread_root_id: string;
    trigger_message_id: string;
    reply_message_id: string | null;
    title: string | null;
  }>(
    await db.execute(sql`with ${anchorsSql(orgId, runIds)}
      select an.run_id, c.id as channel_id, c.kind, c.name, a.thread_root_id, a.trigger_message_id, a.reply_message_id,
        t.title
      from anchors an
      join ${agentRuns} a on a.id = an.anchor_id
      join ${channels} c on c.id = a.channel_id
      left join ${threads} t on t.org_id = ${orgId}::uuid and t.root_message_id = a.thread_root_id
      where a.id <> an.run_id and not a.background and c.archived_at is null and not ${agentsOnlyIn("c")}
        and ${channelReaderSql(sql`c.id`, sql`${userId}::text`)}`),
  );
  return new Map(
    rows.map((r) => [
      r.run_id,
      {
        channelId: r.channel_id,
        channelKind: r.kind,
        channelName: r.kind === "channel" ? r.name : null,
        threadId: r.thread_root_id === r.trigger_message_id ? null : r.thread_root_id,
        messageId: r.reply_message_id,
        label: replyExcerpt(r.title?.trim() ?? "", 80) || null,
      },
    ]),
  );
}

/**
 * The workspace's open asks as edges, by the run that asked: the run each waits on, or the ask itself while no run took
 * it yet (`waking`: its wake waits for room, or a stretch holds it). A stop takes those too.
 */
async function openAsks(db: Database, orgId: string) {
  const rows = await db
    .select({ id: agentConsultations.id, asker: agentConsultations.askerRunId, target: agentConsultations.targetRunId })
    .from(agentConsultations)
    .where(and(eq(agentConsultations.orgId, orgId), eq(agentConsultations.status, "open")));
  const edges = new Map<string, string[]>();
  for (const r of rows) edges.set(r.asker, [...(edges.get(r.asker) ?? []), r.target ?? r.id]);
  return { edges, waking: rows.flatMap((r) => (r.target ? [] : [r.id])) };
}

/** Of these runs, the ones still on. */
async function runsStillOn(db: Database, orgId: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.orgId, orgId),
        inArray(agentRuns.id, ids),
        inArray(agentRuns.status, ["queued", "running", "waiting_approval", "waiting_input"]),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** The runs asked from `runId`, all the way down, each once (a run that ended still leads to what it handed on). */
function runsBelow(edges: Map<string, string[]>, runId: string) {
  const seen = new Set<string>();
  const next = [...(edges.get(runId) ?? [])];
  for (let id = next.pop(); id !== undefined; id = next.pop()) {
    if (seen.has(id) || id === runId) continue;
    seen.add(id);
    next.push(...(edges.get(id) ?? []));
  }
  return seen;
}

/** What a run waiting on no person waits on (`waitingForBrain`: the executor's wait for its computer or plan). */
function heldOf(r: Row): ManagedTask["held"] {
  const wait = parsed(r.wait);
  if (r.status !== "waiting_input" || !wait?.code) return null;
  if (wait.code === "busy") return "computer_busy";
  if (wait.code === "plan_limit") return "plan";
  if (wait.code === "budget") return "budget";
  if (wait.code === "usage_pause") return wait.source === "budget" ? "budget" : "plan";
  return "computer_offline";
}

/** How a run still on stands for the caller, by an agent's line's rule and clock (`workStateOf`, `waitSinceIn`). */
function workOf(r: Row): ManagedTask["work"] {
  const state = workStateOf({
    status: r.status,
    onMachine: r.waiting_machine_id !== null,
    outage: truthy(r.outage),
    waitCode: parsed(r.wait)?.code ?? null,
    you: truthy(r.you),
  });
  if (!state) return null;
  const since = state === "working" ? (r.handed_at ?? r.started_at ?? r.created_at) : (r.wait_since ?? r.created_at);
  return { state, since: iso(since) as string, card: r.card_id };
}

/** The model of a wait on a model's own limit, by the name its plan gives it. */
export function waitModel(wait: Pick<StoredWait, "scope" | "plan" | "model">) {
  if (!wait.scope) return null;
  const plan = PLAN_IDS.map(codingPlan).find((p) => p?.name === wait.plan);
  return plan ? planModel(plan, wait.model).label : (wait.model ?? null);
}

/** Why a run waits. How far a pause got is on its step, written even for a parked run with no card (a routine's). */
function waitOf(r: Row): TaskWait | null {
  const wait = parsed(r.wait);
  if (r.status !== "waiting_input" || !wait?.code) return null;
  const pause = parsed(r.wait_pause);
  return {
    code: wait.code,
    key: str(wait.waitKey),
    plan: str(wait.plan),
    model: waitModel(wait),
    scope: wait.scope ?? null,
    percent: pause?.used ?? null,
    window: str(pause?.window),
    resetsAt: str(wait.resetsAt),
    since: typeof wait.since === "number" ? new Date(wait.since).toISOString() : null,
    canContinue: false,
  };
}

const planOf = (raw: { state: string }[] | string | null) => {
  const plan = typeof raw === "string" ? (JSON.parse(raw) as { state: string }[]) : (raw ?? []);
  return plan.length ? { done: plan.filter((p) => p.state === "done").length, total: plan.length } : null;
};

const betweenAgents = (r: Pick<Row, "kind" | "dm_key">) => isAgentOnlyDm({ kind: r.kind, dmKey: r.dm_key });

/**
 * What a task is called: its work's title or its thread's, never the words of the message that started it (a raw
 * ask, a link, a GIF). With neither, the apps say where it is ("#produto", "Conversa direta").
 */
const labelOf = (r: Row) => replyExcerpt(r.work_title?.trim() || r.title?.trim() || "", 80) || null;

function nowOf(r: Row): TaskNow | null {
  const data = typeof r.last_data === "string" ? (JSON.parse(r.last_data) as Record<string, unknown>) : r.last_data;
  const tool = str(data?.name);
  if (!data || !tool || !r.last_at) return null;
  return {
    tool,
    detail: str(data.detail),
    connector: str(data.connector),
    service: str(data.service),
    serviceIcon: str(data.serviceIcon),
    at: iso(r.last_at) as string,
  };
}

/** The caller's task manager. */
export async function taskManager(
  db: Database,
  userId: string,
  orgId: string,
  options: { since?: Date; now?: Date; doneToday?: boolean } = {},
): Promise<TaskManagerView> {
  const membership = await requireActiveMembership(db, userId, orgId);
  const manages = can(membership, "manage_agents");
  const now = options.now ?? new Date();
  const since = options.since ?? new Date(now.getTime() - 24 * 3600_000);
  const [active, ended, hidden, asks, followUps, canceledFollowUps, doneToday] = await Promise.all([
    visibleRuns(db, userId, orgId, manages, { active: true }),
    visibleRuns(db, userId, orgId, manages, { active: false, since }),
    hiddenTasks(db, userId, orgId, manages),
    openAsks(db, orgId),
    pendingReturns(db, userId, orgId, { managesAgents: manages }),
    canceledReturns(db, userId, orgId, since),
    options.doneToday ? doneSince(db, userId, orgId, manages, since) : undefined,
  ]);
  const delegations = await delegationsOf(db, userId, orgId, active);
  const { edges, waking } = asks;
  const on = new Set([...(await runsStillOn(db, orgId, [...edges.values()].flat())), ...waking]);
  const where = (r: Row) => ({
    channelId: r.channel_id,
    channelKind: r.kind,
    channelName: r.kind === "dm" ? null : r.name,
    betweenAgents: betweenAgents(r),
    threadId: r.thread_root_id === r.trigger_message_id ? null : r.thread_root_id,
  });
  const routineOf = (r: Row) => (r.routine_id ? { id: r.routine_id, name: r.routine_name ?? "" } : null);
  const tasks: ManagedTask[] = active.map((r) => ({
    runId: r.id,
    agentId: r.agent_id,
    ...where(r),
    status: r.status as TaskStatus,
    startedAt: iso(r.started_at),
    createdAt: iso(r.created_at) as string,
    label: labelOf(r),
    background: truthy(r.background),
    routine: routineOf(r),
    plan: planOf(r.work_plan),
    requester: r.requester_id ? { userId: r.requester_id, name: r.requester_name ?? "" } : null,
    delegation: delegations.get(r.id) ?? null,
    subject: delegations.get(r.id)?.from ? consultSubject(r.question) || null : null,
    helpers: [...runsBelow(edges, r.id)].filter((id) => on.has(id)).length,
    brain: r.brain,
    machine: r.machine_id ? { id: r.machine_id, name: r.machine_name ?? "" } : null,
    now: nowOf(r),
    steps: Number(r.steps ?? 0),
    pendingMessageIds: pendingIds(r.pending),
    canStop: manages || r.requester_id === userId || r.owner_user_id === userId,
    held: heldOf(r),
    line: null,
    wait: waitOf(r),
    work: workOf(r),
  }));
  await Promise.all(
    active.map(async (r, i) => {
      const wait = tasks[i]?.wait;
      if (wait?.code !== "usage_pause") return;
      wait.canContinue = await mayContinuePause(db, userId, membership, {
        run: { orgId, triggerMessageId: r.trigger_message_id },
        requester: r.requester_id,
        ownerUserId: r.owner_user_id,
        routineId: r.routine_id,
        routineCreatorId: r.routine_creator,
      });
    }),
  );
  const waitingOn = [
    ...new Set(
      active.flatMap((r) => (heldOf(r) === "computer_busy" && r.waiting_machine_id ? [r.waiting_machine_id] : [])),
    ),
  ];
  const [lines, computers] = await Promise.all([
    computerLines(db, userId, orgId, waitingOn),
    computerSummaries(db, orgId),
  ]);
  for (const task of tasks) {
    const place = task.held === "computer_busy" ? lines.get(task.runId) : undefined;
    if (place) task.line = place;
  }
  const endedTasks: EndedTask[] = ended.map((r) => {
    const by = r.error?.startsWith("canceled_by:") ? r.error.slice("canceled_by:".length) : null;
    return {
      runId: r.id,
      agentId: r.agent_id,
      ...where(r),
      status: r.status as EndedTask["status"],
      label: labelOf(r),
      background: truthy(r.background),
      routine: routineOf(r),
      startedAt: iso(r.started_at),
      finishedAt: iso(r.finished_at) as string,
      stoppedBy: by ? { userId: by, name: r.stopper_name ?? "" } : null,
    };
  });
  return {
    tasks,
    ended: endedTasks,
    hidden,
    computers,
    activity: await agentActivity(db, orgId, now),
    followUps,
    canceledFollowUps,
    ...(doneToday === undefined ? {} : { doneToday }),
  };
}

const IN_LINE = sql`r.waiting_machine_id is not null and (r.status = 'running'
  or (r.status = 'waiting_input' and r.transcript->'waitingForBrain'->>'code' = 'busy'))`;
/** The computer a running turn is on: the one it asked for room (`roomAsk`), as the line's view counts it. */
const RUNS_ON = sql`r.transcript->'roomAsk'->>'machineId'`;

/**
 * Each task's place in its computer's line, from the line's own view (`computerQueue` in computer-queue.ts, ADR 0032
 * "Calm waits"): the same order and estimates the line shows, keyed by run id. Only the computers a task waits on.
 */
async function computerLines(db: Database, userId: string, orgId: string, machineIds: string[]) {
  const places = new Map<string, NonNullable<ManagedTask["line"]>>();
  const queues = await Promise.all(machineIds.map((id) => lineOfComputer(db, userId, orgId, id).catch(() => null)));
  for (const queue of queues) {
    if (!queue) continue;
    for (const w of queue.waiting) {
      places.set(w.runId, {
        machineId: queue.machineId,
        position: w.position,
        of: queue.waiting.length,
        people: w.people,
        estimatedStartAt: w.estimatedStartAt,
      });
    }
  }
  return places;
}

/** The workspace's computers with a turn running or waiting for room. */
async function computerSummaries(db: Database, orgId: string): Promise<ComputerSummary[]> {
  const rows = rowsOf<{ id: string; name: string; working: number | string; in_line: number | string }>(
    await db.execute(sql`select m.id, m.name,
        (select count(*) from ${agentRuns} r join ${agents} a on a.id = r.agent_id
          where r.org_id = ${orgId}::uuid and r.status = 'running'
            and r.waiting_machine_id is null and ${RUNS_ON} = m.id::text) as working,
        (select count(*) from ${agentRuns} r
          where r.org_id = ${orgId}::uuid and ${IN_LINE} and r.waiting_machine_id = m.id) as in_line
      from ${machines} m
      where m.org_id = ${orgId}::uuid`),
  );
  return rows
    .map((r) => ({ id: r.id, name: r.name, working: Number(r.working), inLine: Number(r.in_line) }))
    .filter((c) => c.working > 0 || c.inLine > 0);
}

/**
 * Tool calls per minute, per agent, over the last `ACTIVITY_MINUTES`: the line on each agent's card. Counts only (no
 * content), from runs that were on in the last hour.
 */
export async function agentActivity(db: Database, orgId: string, now = new Date()): Promise<Record<string, number[]>> {
  const from = new Date(now.getTime() - ACTIVITY_MINUTES * 60_000);
  const rows = rowsOf<{ agent_id: string; ago: number | string; n: number | string }>(
    await db.execute(sql`select r.agent_id,
        floor(extract(epoch from (${now.toISOString()}::timestamptz - s.created_at)) / 60)::int as ago, count(*) as n
      from ${agentRuns} r
      join ${agentRunSteps} s on s.run_id = r.id and s.kind = 'tool_call'
        and s.created_at > ${from.toISOString()}::timestamptz
      where r.org_id = ${orgId}::uuid
        and r.created_at > ${new Date(now.getTime() - 24 * 3600_000).toISOString()}::timestamptz
        and (r.finished_at is null or r.finished_at > ${from.toISOString()}::timestamptz)
      group by 1, 2`),
  );
  const out: Record<string, number[]> = {};
  for (const r of rows) {
    const ago = Number(r.ago);
    if (ago < 0 || ago >= ACTIVITY_MINUTES) continue;
    const line = out[r.agent_id] ?? Array.from({ length: ACTIVITY_MINUTES }, () => 0);
    out[r.agent_id] = line;
    line[ACTIVITY_MINUTES - 1 - ago] = Number(r.n);
  }
  return out;
}

/** A task's steps at most (its calls and their ends). */
export const TASK_STEPS_MAX = 400;

export interface TaskStep {
  seq: number;
  kind: "tool_call" | "tool_result" | "model_call";
  data: Record<string, unknown>;
  createdAt: string;
}

/** The computer's own permission check before a command (`PERMISSION_TOOL` in `@agenteschat/adapters`). */
const PERMISSION_TOOL = "permission_prompt";

/**
 * A task's steps for the task manager's "Ver passos" (ADR 0128), to whoever sees the task there: what each call was
 * (the chat chip's fields) and how it ended, never a connector's input or a tool's output (only a permission check's
 * answer, which says whether it ran). The full trail (`getRun`) stays with usage access.
 */
export async function taskSteps(
  db: Database,
  userId: string,
  orgId: string,
  runId: string,
): Promise<{ run: { createdAt: string; finishedAt: string | null }; steps: TaskStep[] }> {
  const membership = await requireActiveMembership(db, userId, orgId);
  const manages = can(membership, "manage_agents");
  const [run] = rowsOf<{ created_at: string | Date; finished_at: string | Date | null }>(
    await db.execute(sql`select r.created_at, r.finished_at
      from ${agentRuns} r
      join ${channels} c on c.id = r.channel_id and c.org_id = ${orgId}::uuid and c.kind in ('channel', 'dm')
      join ${agents} a on a.id = r.agent_id and a.org_id = ${orgId}::uuid
      where r.org_id = ${orgId}::uuid and r.id = ${runId}::uuid and ${seesRunSql(RUN_COLUMNS, userId, orgId, manages)}`),
  );
  if (!run) throw new NotFoundError("Task not found");
  type StepRow = {
    seq: number;
    kind: TaskStep["kind"];
    data: Record<string, unknown> | string;
    created_at: string | Date;
  };
  const rows = rowsOf<StepRow>(
    await db.execute(sql`select s.seq, s.kind, s.data, s.created_at from ${agentRunSteps} s
      where s.run_id = ${runId}::uuid and s.kind in ('tool_call', 'tool_result', 'model_call')
      order by s.seq limit ${TASK_STEPS_MAX}`),
  );
  const steps = rows.map((r): TaskStep => {
    const data = typeof r.data === "string" ? (JSON.parse(r.data) as Record<string, unknown>) : r.data;
    const pick = (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]]));
    const input = data.input as Record<string, unknown> | undefined;
    const shown =
      r.kind === "tool_call"
        ? {
            ...pick(["toolUseId", "name", "detail", "command", "connector", "service", "serviceIcon"]),
            ...(data.name === PERMISSION_TOOL && typeof input?.request_id === "string"
              ? { input: { request_id: input.request_id } }
              : {}),
          }
        : r.kind === "tool_result"
          ? { ...pick(["toolUseId", "name", "isError"]), ...(data.name === PERMISSION_TOOL ? pick(["content"]) : {}) }
          : pick(["narration", "turn"]);
    return { seq: Number(r.seq), kind: r.kind, data: shown, createdAt: iso(r.created_at) as string };
  });
  return { run: { createdAt: iso(run.created_at) as string, finishedAt: iso(run.finished_at) }, steps };
}
