import { afterEach, expect, test } from "bun:test";
import { MACHINE_PROTOCOL_VERSION, userTopic } from "@agenteschat/adapters";
import { and, eq, schema } from "@agenteschat/db";
import { extraUsageLeft, extraUsageOn, planBinding } from "@agenteschat/ui/plan-state";
import {
  addChannelMember,
  answerNow,
  type Brain,
  type BrainEvent,
  type BrainTurn,
  COMPUTER_BUSY_RETRY_MS,
  COMPUTER_QUEUE_NOTE_MS,
  cancelRun,
  clearPlanLimits,
  continueRoutineUsagePause,
  createDashboard,
  createJobHandlers,
  createRoutine,
  createWidget,
  drainOutbox,
  enqueueRunJob,
  getRoutineView,
  getWidget,
  holdsMessages,
  insertMessage,
  isLongWork,
  listMessages,
  type MachineStatus,
  notifyRoutineStalled,
  postPersonMessage,
  RESUME_AFTER_MS,
  storeOwnUsage as reportOwnUsage,
  routineRunRefreshesWidget,
  runRoutineNow,
  testWidget,
} from "../src";
import { monthStartUtc } from "../src/usage";
import { addMember, type Fixture, setup } from "./fixtures";
import { pairMachine } from "./machine-fixtures";

/** ADR 0118: long work pauses at 95% of its plan or budget, picks up at the reset, and Continuar agora lets it go on. */

let f: Fixture;
afterEach(() => {
  clearPlanLimits();
  const fx: Fixture | undefined = f;
  f = undefined as unknown as Fixture;
  return fx?.close();
});

const later = (ms: number) => new Date(Date.now() + ms);
const iso = (ms: number) => later(ms).toISOString();
const reading = (
  windows: { kind: string; usedPercent: number; resetsAt?: string; label?: string }[],
  at = new Date().toISOString(),
) => ({
  windows,
  source: "turn",
  at,
});

test("the window that binds long work: live, of this model, never extra usage", () => {
  const now = Date.now();
  const u = reading([
    { kind: "five_hour", usedPercent: 40, resetsAt: iso(3600_000) },
    { kind: "seven_day", usedPercent: 99, resetsAt: iso(-1000) },
    { kind: "seven_day_opus", usedPercent: 97, resetsAt: iso(86_400_000) },
    { kind: "other", label: "Extra usage", usedPercent: 100 },
  ]);
  // The week reset already, Opus's week isn't this model's, extra usage never counts.
  expect(planBinding(u, { model: "sonnet", now })).toEqual({
    kind: "five_hour",
    used: 40,
    resetsAt: u.windows[0]?.resetsAt as string,
  });
  expect(planBinding(u, { model: "opus", now })?.used).toBe(97);
  // A reading with no reset counts while its window lasts.
  const old = reading([{ kind: "five_hour", usedPercent: 96 }], iso(-6 * 3600_000));
  expect(planBinding(old, { now })).toBeNull();
  expect(planBinding(reading([{ kind: "five_hour", usedPercent: 96 }]), { now })?.used).toBe(96);
  expect(planBinding(null)).toBeNull();
  expect(extraUsageOn(u)).toBe(true);
  expect(extraUsageOn(reading([{ kind: "five_hour", usedPercent: 1 }]))).toBe(false);
  // Extra usage whose own cap is spent leaves long work nothing to go on into; the switch still shows.
  expect(extraUsageLeft(u)).toBe(false);
  expect(extraUsageLeft(reading([{ kind: "other", label: "Extra usage", usedPercent: 140 }]))).toBe(false);
  expect(extraUsageLeft(reading([{ kind: "other", label: "Extra usage", usedPercent: 10 }]))).toBe(true);
  // A model's own week (`model_scoped`) binds that model only.
  const scoped = reading([
    { kind: "five_hour", usedPercent: 60, resetsAt: iso(3600_000) },
    { kind: "other", label: "Fable", usedPercent: 98, resetsAt: iso(86_400_000) },
    { kind: "other", label: "OAuth apps", usedPercent: 99 },
  ]);
  expect(planBinding(scoped, { model: "claude-fable-5", now })).toEqual(
    expect.objectContaining({ kind: "other", used: 98 }),
  );
  expect(planBinding(scoped, { model: "sonnet", now })?.used).toBe(60);
});

test("long work: a routine or a mission by kind, else by size in this claim", () => {
  const base = { routine: false, mission: false, pausedBefore: false, computer: false, calls: 0, elapsedMs: 0 };
  expect(isLongWork(base)).toBe(false);
  expect(isLongWork({ ...base, routine: true })).toBe(true);
  expect(isLongWork({ ...base, mission: true })).toBe(true);
  expect(isLongWork({ ...base, pausedBefore: true })).toBe(true);
  expect(isLongWork({ ...base, calls: 7 })).toBe(false);
  expect(isLongWork({ ...base, calls: 8 })).toBe(true);
  expect(isLongWork({ ...base, computer: true, calls: 1 })).toBe(false);
  expect(isLongWork({ ...base, computer: true, calls: 2 })).toBe(true);
  expect(isLongWork({ ...base, elapsedMs: 11 * 60_000 })).toBe(false);
  expect(isLongWork({ ...base, calls: 1, elapsedMs: 11 * 60_000 })).toBe(true);
});

// ── The model brain on its budget ────────────────────────────────────────────

const BUDGET = 100_000_000_000;

async function spend(fx: Fixture, percent: number) {
  const spentNanoUsd = (BUDGET * percent) / 100;
  await fx.db
    .insert(schema.agentBudgetPeriods)
    .values({
      orgId: fx.org.id,
      agentId: fx.agent.id,
      periodStart: monthStartUtc(new Date()).toISOString().slice(0, 10),
      spentNanoUsd,
    })
    .onConflictDoUpdate({
      target: [schema.agentBudgetPeriods.agentId, schema.agentBudgetPeriods.periodStart],
      set: { spentNanoUsd },
    });
}

/** A model that looks things up `steps` times, then answers. */
const stepper = (steps: number) => (_: unknown, call: number) =>
  call < steps
    ? { chunks: [], toolUses: [{ name: "search_context", input: { query: `pedido ${call}` } }] }
    : { chunks: ["Pronto."] };

const runs = (fx: Fixture) => fx.db.select().from(schema.agentRuns).orderBy(schema.agentRuns.createdAt);
const cards = async (fx: Fixture) =>
  (await listMessages(fx.db, fx.owner.id, fx.org.id, fx.general.id)).filter(
    (m) => (m.meta.actionCard as { kind?: string } | undefined)?.kind === "usage_paused",
  );
/** Usage cards anywhere, threads too. */
const allCards = async (fx: Fixture) =>
  (await fx.db.select().from(schema.messages).where(eq(schema.messages.orgId, fx.org.id))).filter(
    (m) => (m.meta.actionCard as { kind?: string } | undefined)?.kind === "usage_paused",
  );
const post = (fx: Fixture, body: string, userId = fx.owner.id) =>
  postPersonMessage({ db: fx.db, pubsub: fx.pubsub }, userId, fx.org.id, fx.general.id, { body });

test("at 96% of its budget a long run parks between steps with a card; a short reply finishes", async () => {
  f = await setup({ contextTools: true, budgetNanoUsd: BUDGET, reply: stepper(12) });
  await spend(f, 96);
  await post(f, "@dev analisa os pedidos");
  await drainOutbox(f.db, f.handlers);
  const [run] = await runs(f);
  expect(run?.status).toBe("waiting_input");
  const t = run?.transcript as {
    waitingForBrain?: { code: string; source?: string; until?: string };
    usagePause?: { paused?: boolean };
    messages: { role: string; content: unknown }[];
  };
  expect(t.waitingForBrain?.code).toBe("usage_pause");
  expect(t.waitingForBrain?.source).toBe("budget");
  expect(t.usagePause?.paused).toBe(true);
  // It stopped at the 8th call, its last step a tool's result: nothing in flight.
  expect(f.provider.calls).toHaveLength(8);
  expect(t.messages.at(-1)?.role).toBe("user");
  const [card] = await cards(f);
  expect(card?.meta.bodyCode).toBe("usage_paused_budget");
  expect(card?.meta.actionCard).toEqual(
    expect.objectContaining({ state: "paused", source: "budget", percent: 96, forUserId: f.owner.id }),
  );
  // The job comes back when the budget renews.
  expect(Date.parse(t.waitingForBrain?.until ?? "")).toBeGreaterThan(Date.now() + 1000);
});

test("a short reply at 96% of its budget finishes, with no card", async () => {
  f = await setup({ contextTools: true, budgetNanoUsd: BUDGET, reply: stepper(2) });
  await spend(f, 96);
  await post(f, "@dev oi");
  await drainOutbox(f.db, f.handlers);
  expect((await runs(f))[0]?.status).toBe("done");
  expect(await cards(f)).toHaveLength(0);
});

test("Continuar agora: who may press it lets the run go on once; a person's message meanwhile gets its own run", async () => {
  f = await setup({ contextTools: true, budgetNanoUsd: BUDGET, reply: stepper(12) });
  await spend(f, 96);
  await post(f, "@dev analisa os pedidos");
  await drainOutbox(f.db, f.handlers);
  const [paused] = await runs(f);
  expect(paused && (await holdsMessages(f.db, paused))).toBe(true);
  const [card] = await cards(f);
  if (!card || !paused) throw new Error("no card");
  const deps = { db: f.db, pubsub: f.pubsub, gateway: f.gateway };

  const bia = await addMember(f.db, f.org.id, "member", "bia");
  await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: bia.id });
  const refused = await answerNow(deps, bia.id, f.org.id, card.id).catch((e) => e);
  expect((refused as { code?: string }).code).toBe("run.answer_forbidden");

  expect(await answerNow(deps, f.owner.id, f.org.id, card.id)).toEqual({
    runs: [{ agentId: f.agent.id, runId: paused.id }],
  });
  expect(await answerNow(deps, f.owner.id, f.org.id, card.id)).toEqual({ runs: [] });
  await drainOutbox(f.db, f.handlers);
  const [done] = await runs(f);
  expect(done?.status).toBe("done");
  expect(f.provider.calls.length).toBeGreaterThan(8);
  const [after] = await cards(f);
  expect(after?.meta.actionCard).toEqual(
    expect.objectContaining({ state: "continued", continuedByUserId: f.owner.id }),
  );
  const audit = await f.db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.orgId, f.org.id), eq(schema.auditLog.action, "usage.continued")));
  expect(audit).toHaveLength(1);
});

test("Continuar agora from outside the card's conversation: the run's people may, nobody else", async () => {
  // The card of a run that answers another agent sits in the agents' DM, which no person is a member of.
  f = await setup({ contextTools: true, budgetNanoUsd: BUDGET, reply: stepper(12) });
  await spend(f, 96);
  await post(f, "@dev analisa os pedidos");
  await drainOutbox(f.db, f.handlers);
  const [paused] = await runs(f);
  const [card] = await cards(f);
  if (!card || !paused) throw new Error("no card");
  const deps = { db: f.db, pubsub: f.pubsub, gateway: f.gateway };
  // Neither is a member of the conversation; one owns the agent.
  const bia = await addMember(f.db, f.org.id, "member", "bia");
  const caio = await addMember(f.db, f.org.id, "member", "caio");
  await f.db.update(schema.agents).set({ ownerUserId: bia.id }).where(eq(schema.agents.id, f.agent.id));

  const refused = await answerNow(deps, caio.id, f.org.id, card.id).catch((e) => e);
  expect((refused as { code?: string }).code).toBe("run.answer_forbidden");
  expect(await answerNow(deps, bia.id, f.org.id, card.id)).toEqual({
    runs: [{ agentId: f.agent.id, runId: paused.id }],
  });
  const [after] = await cards(f);
  expect(after?.meta.actionCard).toEqual(expect.objectContaining({ state: "continued", continuedByUserId: bia.id }));
});

test("a person's message during a pause is answered by a run of its own", async () => {
  f = await setup({
    contextTools: true,
    budgetNanoUsd: BUDGET,
    reply: (req, call) => (JSON.stringify(req).includes("tudo bem") ? { chunks: ["Tudo."] } : stepper(12)(req, call)),
  });
  await spend(f, 96);
  await post(f, "@dev analisa os pedidos");
  await drainOutbox(f.db, f.handlers);
  await post(f, "@dev tudo bem?");
  await drainOutbox(f.db, f.handlers);
  const [paused, quick] = await runs(f);
  expect(paused?.status).toBe("waiting_input");
  expect(quick?.status).toBe("done");
});

// ── A computer brain on its plan ─────────────────────────────────────────────

const RUNNER = {
  hostname: "mac",
  os: "darwin" as const,
  arch: "arm64",
  version: "0.8.0",
  protocol: MACHINE_PROTOCOL_VERSION,
  workspace: "/Users/w/agentes",
};

const statusOf = (machineId: string): MachineStatus => ({
  id: machineId,
  orgId: "org",
  name: "MacBook",
  online: true,
  execAllowed: true,
  os: "darwin",
  protocol: 8,
  executors: { claude: { version: "2.1.300", loggedIn: true }, detectedAt: new Date().toISOString() },
});

async function computerAgent(fx: Fixture, over: Partial<typeof schema.agents.$inferInsert> = {}) {
  const deps = { db: fx.db, pubsub: fx.pubsub, publicUrl: "https://agentes.chat" };
  const paired = await pairMachine(deps, fx.owner.id, fx.org.id, { name: "MacBook", ...RUNNER, exec: true });
  await fx.db
    .update(schema.agents)
    .set({ machineId: paired.machineId, brain: "claude_code", brainFallback: false, ...over })
    .where(eq(schema.agents.id, fx.agent.id));
  return paired.machineId;
}

async function storeOwnUsage(fx: Fixture, machineId: string, usage: Record<string, unknown>) {
  const [m] = await fx.db.select().from(schema.machines).where(eq(schema.machines.id, machineId));
  await fx.db
    .update(schema.machines)
    .set({ executors: { ...m?.executors, ownUsage: { claude_code: usage as never } } })
    .where(eq(schema.machines.id, machineId));
}

function scripted(script: (n: number) => BrainEvent[]) {
  // A computer brain's turn also carries "# This turn".
  const seen: (BrainTurn & { thisTurn?: string })[] = [];
  const brain: Brain = {
    kind: "claude_code",
    async *run(turn) {
      const n = seen.length;
      seen.push({ ...turn, system: "", messages: [] });
      yield* script(n);
    },
  };
  return { brain, seen };
}

const handlersWith = (fx: Fixture, brain: Brain) =>
  createJobHandlers({
    ...fx.jobDeps,
    brains: { claude_code: () => brain },
    machines: { status: async (id) => statusOf(id) },
  });

/** A scheduled slot of a routine (Rodar agora, then marked as its schedule's: by hand it wouldn't be long work). */
async function scheduledSlot(fx: Fixture) {
  const deps = { db: fx.db, pubsub: fx.pubsub, context: fx.context };
  const routine = await createRoutine(deps, fx.owner.id, fx.org.id, {
    name: "Deploys",
    agentId: fx.agent.id,
    prompt: "Check the deploys.",
    target: { type: "channel", channelId: fx.general.id },
    trigger: { type: "schedule", phrase: "todo dia às 8h" },
  });
  await runRoutineNow(deps, fx.owner.id, fx.org.id, routine.id);
  await fx.db
    .update(schema.routineRuns)
    .set({ trigger: "schedule" })
    .where(eq(schema.routineRuns.routineId, routine.id));
}

test("a routine's slot at 96% of the plan parks before its first turn and picks up after the reset", async () => {
  f = await setup();
  const machineId = await computerAgent(f);
  const resetsAt = iso(3600_000);
  await storeOwnUsage(f, machineId, reading([{ kind: "five_hour", usedPercent: 96, resetsAt }]));
  const { brain, seen } = scripted(() => [{ type: "done", text: "Deploys ok." }]);
  const handlers = handlersWith(f, brain);
  await scheduledSlot(f);
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(0);
  const [run] = await runs(f);
  expect(run?.status).toBe("waiting_input");
  const wait = (run?.transcript as { waitingForBrain?: { code: string; source?: string; until?: string } } | undefined)
    ?.waitingForBrain;
  expect(wait?.code).toBe("usage_pause");
  expect(wait?.source).toBe("plan");
  expect(Date.parse(wait?.until ?? "")).toBe(Date.parse(resetsAt) + RESUME_AFTER_MS);
  // A routine's pause is quiet: its slot says it, not a card in the conversation.
  expect(await cards(f)).toHaveLength(0);

  // The window reset (a fresh reading says so): it runs.
  await storeOwnUsage(f, machineId, reading([{ kind: "five_hour", usedPercent: 2, resetsAt: iso(5 * 3600_000) }]));
  await drainOutbox(f.db, handlers, { now: later(3600_000 + RESUME_AFTER_MS + 1000) });
  expect(seen).toHaveLength(1);
});

test("a paused slot goes on once a newer reading puts its plan back under the pause line, not at a reset a day away", async () => {
  f = await setup();
  const machineId = await computerAgent(f);
  const resetsAt = iso(26 * 3600_000);
  await storeOwnUsage(f, machineId, reading([{ kind: "seven_day", usedPercent: 96, resetsAt }]));
  const { brain, seen } = scripted(() => [{ type: "done", text: "Deploys ok." }]);
  const handlers = handlersWith(f, brain);
  await scheduledSlot(f);
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(0);
  const deps = { db: f.db, pubsub: f.pubsub };
  const week = (used: number) => ({
    windows: [{ kind: "seven_day" as const, usedPercent: used, resetsAt }],
    source: "turn" as const,
    at: iso(60_000),
  });

  // Still over the line: it keeps waiting for the reset.
  await reportOwnUsage(deps, f.org.id, machineId, { claude_code: week(97) });
  await drainOutbox(f.db, handlers, { now: later(5 * 60_000) });
  expect(seen).toHaveLength(0);
  // The sign-in reads under the line again (another run went through on it): the slot goes on now.
  await reportOwnUsage(deps, f.org.id, machineId, { claude_code: week(60) });
  await drainOutbox(f.db, handlers, { now: later(5 * 60_000) });
  expect(seen).toHaveLength(1);
  expect((await runs(f))[0]?.status).toBe("done");
});

test("the plan's paid extra usage lets long work go on, unless its switch is off", async () => {
  f = await setup();
  const machineId = await computerAgent(f);
  await storeOwnUsage(
    f,
    machineId,
    reading([
      { kind: "five_hour", usedPercent: 97, resetsAt: iso(3600_000) },
      { kind: "other", label: "Extra usage", usedPercent: 10 },
    ]),
  );
  const { brain, seen } = scripted(() => [{ type: "done", text: "ok" }]);
  const handlers = handlersWith(f, brain);
  await scheduledSlot(f);
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(1);

  await f.db.update(schema.agents).set({ brainExtraUsage: false }).where(eq(schema.agents.id, f.agent.id));
  await scheduledSlot(f);
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(1);
  expect((await runs(f)).at(-1)?.status).toBe("waiting_input");
});

test("from 90% of its plan the agent reads where it stands; at 50% it doesn't", async () => {
  f = await setup();
  const machineId = await computerAgent(f);
  await storeOwnUsage(f, machineId, reading([{ kind: "five_hour", usedPercent: 91, resetsAt: iso(3600_000) }]));
  const { brain, seen } = scripted(() => [{ type: "done", text: "ok" }]);
  const handlers = handlersWith(f, brain);
  await post(f, "@dev oi");
  await drainOutbox(f.db, handlers);
  expect(seen[0]?.thisTurn).toContain("Your Claude plan is at 91% of its 5 hours");

  await storeOwnUsage(f, machineId, reading([{ kind: "five_hour", usedPercent: 50, resetsAt: iso(3600_000) }]));
  const first = (await listMessages(f.db, f.owner.id, f.org.id, f.general.id))[0];
  await postPersonMessage({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, f.general.id, {
    body: "@dev e agora?",
    ...(first ? { threadId: first.id } : {}),
  });
  await drainOutbox(f.db, handlers);
  expect(seen[1]?.thisTurn ?? "").not.toContain("Your Claude plan");
});

test("a paused mission: a person's question in its thread gets an answer, its notices wait for the work", async () => {
  f = await setup({
    contextTools: true,
    budgetNanoUsd: BUDGET,
    reply: (req, call) =>
      JSON.stringify(req).includes("qual o status") ? { chunks: ["Pausado."] } : stepper(12)(req, call),
  });
  await spend(f, 96);
  const root = await post(f, "Migrar o login");
  await f.db.insert(schema.missions).values({
    orgId: f.org.id,
    agentId: f.agent.id,
    channelId: f.general.id,
    threadRootId: root.id,
    ownerId: f.owner.id,
    title: "Migrar o login",
    goal: "Trocar a biblioteca de sessão",
    status: "active",
    brain: "model",
    mainSessionId: crypto.randomUUID(),
  });
  const notice = (text: string) =>
    f.db.transaction(async (tx) => {
      const m = await insertMessage(tx, {
        orgId: f.org.id,
        channelId: f.general.id,
        threadId: root.id,
        author: { type: "agent", agentId: f.agent.id, runId: null, hop: 0, stretchId: null },
        body: text,
        meta: { missionInbox: { text } },
      });
      return enqueueRunJob(tx, { ...m, threadId: root.id }, f.agent.id);
    });
  await notice("Siga o plano.");
  await drainOutbox(f.db, f.handlers);
  const [main] = await runs(f);
  expect(main?.status).toBe("waiting_input");
  expect(await allCards(f)).toHaveLength(1);

  await postPersonMessage({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, f.general.id, {
    body: "@dev qual o status?",
    threadId: root.id,
  });
  await drainOutbox(f.db, f.handlers);
  const all = await runs(f);
  expect(all).toHaveLength(2);
  expect(all[1]?.status).toBe("done");
  expect(await allCards(f)).toHaveLength(1);

  // The mission's next notice joins its paused work: no new run, no second card.
  const told = await notice("Mais um passo.");
  expect(told.steered).toBe(main?.id ?? "");
  expect(await runs(f)).toHaveLength(2);
});

test("over the budget's line only by other calls' reservations: it looks again soon, not next month", async () => {
  f = await setup({ contextTools: true, budgetNanoUsd: BUDGET, reply: stepper(12) });
  await spend(f, 84);
  const period = monthStartUtc(new Date()).toISOString().slice(0, 10);
  const hold = (reservedNanoUsd: number) =>
    f.db
      .update(schema.agentBudgetPeriods)
      .set({ reservedNanoUsd })
      .where(and(eq(schema.agentBudgetPeriods.agentId, f.agent.id), eq(schema.agentBudgetPeriods.periodStart, period)));
  await hold(BUDGET * 0.13);
  await post(f, "@dev analisa os pedidos");
  await drainOutbox(f.db, f.handlers);
  const [run] = await runs(f);
  expect(run?.status).toBe("waiting_input");
  const until = Date.parse(
    (run?.transcript as { waitingForBrain?: { until?: string } } | undefined)?.waitingForBrain?.until ?? "",
  );
  expect(until).toBeLessThan(Date.now() + 3600_000);
  expect(await cards(f)).toHaveLength(0);

  // The reservation was released: it goes on.
  await hold(0);
  await drainOutbox(f.db, f.handlers, { now: later(3600_000) });
  expect((await runs(f))[0]?.status).toBe("done");
});

test("a routine's paused slot: its people hear it, and Rodar agora runs it now", async () => {
  f = await setup();
  const machineId = await computerAgent(f);
  await storeOwnUsage(f, machineId, reading([{ kind: "seven_day", usedPercent: 96, resetsAt: iso(3 * 86_400_000) }]));
  const { brain, seen } = scripted(() => [{ type: "done", text: "Deploys ok." }]);
  const handlers = handlersWith(f, brain);
  await scheduledSlot(f);
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(0);
  const heard = await f.db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.kind, "routine_waiting_plan"));
  expect(heard.map((n) => n.userId)).toContain(f.owner.id);

  // Rodar agora: a person asks for it now, so it isn't long by kind; the paused slot gives way to it.
  const [routine] = await f.db.select().from(schema.routines);
  await runRoutineNow({ db: f.db, pubsub: f.pubsub, context: f.context }, f.owner.id, f.org.id, routine?.id ?? "");
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(1);
  const [paused] = await runs(f);
  expect(paused?.status).not.toBe("waiting_input");
});

test("a widget's test parked on its plan raises no notice: it goes with its routine, which nothing would resolve", async () => {
  f = await setup();
  const machineId = await computerAgent(f);
  await storeOwnUsage(f, machineId, reading([{ kind: "five_hour", usedPercent: 100, resetsAt: iso(3600_000) }]));
  const { brain, seen } = scripted(() => [{ type: "done", text: "ok" }]);
  const deps = { db: f.db, pubsub: f.pubsub, context: f.context };
  const board = await createDashboard(deps, f.owner.id, f.org.id, {
    title: "Vendas",
    audience: "private",
    editPolicy: "owner",
  });
  await testWidget(deps, f.owner.id, f.org.id, board.id, {
    agentId: f.agent.id,
    prompt: "vendas de hoje",
    format: "auto",
    schedule: "manual",
  });
  await drainOutbox(f.db, handlersWith(f, brain));
  expect(seen).toHaveLength(0);
  const [run] = await runs(f);
  expect(run?.status).toBe("waiting_input");
  expect((run?.transcript as { waitingForBrain?: { code?: string } } | undefined)?.waitingForBrain?.code).toBe(
    "plan_limit",
  );
  const heard = await f.db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.kind, "routine_waiting_plan"));
  expect(heard).toEqual([]);
});

test("a widget's test raises no notice that its computer is away either, where a routine's run does", async () => {
  f = await setup();
  const deps = { db: f.db, pubsub: f.pubsub, context: f.context };
  const board = await createDashboard(deps, f.owner.id, f.org.id, {
    title: "Vendas",
    audience: "private",
    editPolicy: "owner",
  });
  const draft = await testWidget(deps, f.owner.id, f.org.id, board.id, {
    agentId: f.agent.id,
    prompt: "vendas de hoje",
    format: "auto",
    schedule: "manual",
  });
  const routine = await createRoutine(deps, f.owner.id, f.org.id, {
    name: "Deploys",
    agentId: f.agent.id,
    prompt: "Check the deploys.",
    target: { type: "channel", channelId: f.general.id },
    trigger: { type: "schedule", phrase: "todo dia às 8h" },
  });
  const stalled = (routineId: string) =>
    notifyRoutineStalled(
      { db: f.db, pubsub: f.pubsub },
      { orgId: f.org.id, routineId, machineId: crypto.randomUUID(), machineName: "MacBook", outageKey: "none" },
    );
  if (!draft.routineId) throw new Error("the test has no routine");
  await stalled(draft.routineId);
  await stalled(routine.id);
  const heard = await f.db
    .select({ groupKey: schema.notifications.groupKey })
    .from(schema.notifications)
    .where(eq(schema.notifications.kind, "routine_stalled"));
  expect(heard.length).toBeGreaterThan(0);
  expect(heard.every((n) => n.groupKey.startsWith(`routine_stalled:${routine.id}:`))).toBe(true);
});

test("a widget's refresh in line for its computer: joining it tells its widget, asking again nothing, its turn starting does", async () => {
  f = await setup();
  await computerAgent(f);
  let room = false;
  const { brain } = scripted(() =>
    room
      ? [{ type: "done", text: "ok" }]
      : [{ type: "error", code: "busy", message: "The computer is busy.", retryable: true }],
  );
  const handlers = handlersWith(f, brain);
  const deps = { db: f.db, pubsub: f.pubsub, context: f.context };
  const board = await createDashboard(deps, f.owner.id, f.org.id, {
    title: "Vendas",
    audience: "private",
    editPolicy: "owner",
  });
  const statuses: string[] = [];
  f.pubsub.subscribe(userTopic(f.org.id, f.owner.id), (e) => {
    const event = e as { type: string; status?: string };
    if (event.type === "dashboard.widget" && event.status) statuses.push(event.status);
  });
  const w = await createWidget(deps, f.owner.id, f.org.id, board.id, {
    agentId: f.agent.id,
    prompt: "vendas de hoje",
    format: "kpi",
    schedule: "manual",
  });
  const queued = statuses.length;
  await drainOutbox(f.db, handlers);
  const [run] = await runs(f);
  if (!run) throw new Error("no run");
  expect(run.transcript).toMatchObject({ waitingForBrain: { code: "busy" } });
  // Its run starting, then its joining the line: the apps read its wait again, said once it is ten minutes old.
  expect(statuses.slice(queued)).toEqual(["building", "building"]);
  const parked = statuses.length;
  await drainOutbox(f.db, handlers, { now: later(COMPUTER_BUSY_RETRY_MS + 1_000) });
  await drainOutbox(f.db, handlers, { now: later(2 * (COMPUTER_BUSY_RETRY_MS + 1_000)) });
  expect((await runs(f))[0]?.status).toBe("waiting_input");
  expect(statuses).toHaveLength(parked);

  // In line past ten minutes, the widget says so; the turn that finds room tells it, before the run ends.
  const [row] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, run.id));
  await f.db
    .update(schema.agentRuns)
    .set({ transcript: { ...row?.transcript, roomWaitSince: Date.now() - COMPUTER_QUEUE_NOTE_MS - 1_000 } })
    .where(eq(schema.agentRuns.id, run.id));
  expect((await getWidget(deps, f.owner.id, f.org.id, w.id)).wait).toMatchObject({ code: "busy" });
  room = true;
  await drainOutbox(f.db, handlers, { now: later(3 * (COMPUTER_BUSY_RETRY_MS + 1_000)) });
  expect(statuses[parked]).toBe("building");
  expect(statuses.length).toBeGreaterThan(parked + 1);
});

test("a widget's refresh isn't long work by kind: at 96% of the plan its slot runs, where a routine's slot pauses", async () => {
  f = await setup();
  const machineId = await computerAgent(f);
  await storeOwnUsage(f, machineId, reading([{ kind: "seven_day", usedPercent: 96, resetsAt: iso(26 * 3600_000) }]));
  const { brain, seen } = scripted(() => [{ type: "done", text: "ok" }]);
  const handlers = handlersWith(f, brain);
  const deps = { db: f.db, pubsub: f.pubsub, context: f.context };
  const board = await createDashboard(deps, f.owner.id, f.org.id, {
    title: "Vendas",
    audience: "private",
    editPolicy: "owner",
  });
  await createWidget(deps, f.owner.id, f.org.id, board.id, {
    agentId: f.agent.id,
    prompt: "vendas de hoje",
    format: "kpi",
    schedule: "hour",
  });
  // Its first build, as its schedule's slot: by hand it wouldn't be long work anyway.
  await f.db.update(schema.routineRuns).set({ trigger: "schedule" });
  await drainOutbox(f.db, handlers);
  // Its turn, then the one more a widget's run gets for ending without `update_widget`: neither paused.
  expect(seen).toHaveLength(2);
  const [refresh] = await runs(f);
  expect(await routineRunRefreshesWidget(f.db, refresh?.id ?? "")).toBe(true);

  await scheduledSlot(f);
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(2);
  const slot = (await runs(f)).at(-1);
  expect((slot?.transcript as { waitingForBrain?: { code?: string } } | undefined)?.waitingForBrain?.code).toBe(
    "usage_pause",
  );
  expect(await routineRunRefreshesWidget(f.db, slot?.id ?? "")).toBe(false);
});

test("a run canceled while paused: its card says it won't run, and Continuar agora on it starts nothing", async () => {
  f = await setup({ contextTools: true, budgetNanoUsd: BUDGET, reply: stepper(12) });
  await spend(f, 96);
  await post(f, "@dev analisa os pedidos");
  await drainOutbox(f.db, f.handlers);
  const [paused] = await runs(f);
  const [card] = await cards(f);
  if (!card || !paused) throw new Error("no card");
  await cancelRun({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, paused.id);
  const state = async () => ((await cards(f))[0]?.meta.actionCard as { state?: string } | undefined)?.state;
  expect(await state()).toBe("canceled");
  const deps = { db: f.db, pubsub: f.pubsub, gateway: f.gateway };
  expect(await answerNow(deps, f.owner.id, f.org.id, card.id)).toEqual({ runs: [] });
  expect(await state()).toBe("canceled");
});

// ── Rotinas: a routine's paused slot ─────────────────────────────────────────

test("Rotinas shows a routine's paused slot until its reset; Continuar agora for its people goes on, posting nothing", async () => {
  f = await setup();
  const machineId = await computerAgent(f);
  const resetsAt = new Date(Date.now() + 3600_000).toISOString();
  await storeOwnUsage(f, machineId, reading([{ kind: "five_hour", usedPercent: 96, resetsAt }]));
  const { brain, seen } = scripted(() => [{ type: "done", text: "Deploys ok." }]);
  const handlers = handlersWith(f, brain);
  await scheduledSlot(f);
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(0);
  const [routine] = await f.db.select().from(schema.routines);
  const id = routine?.id ?? "";
  const view = await getRoutineView(f.db, f.owner.id, f.org.id, id);
  expect(view.state).toBe("usage_paused");
  expect(view.usagePause).toEqual({
    source: "plan",
    resetsAt,
    limit: false,
    plan: "Claude",
    extraOff: false,
    extraUsedUp: false,
  });

  // Someone who isn't its creator, the agent's owner or an admin sees it, and can't continue it.
  const bia = await addMember(f.db, f.org.id, "member", "bia");
  await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: bia.id });
  const theirs = await getRoutineView(f.db, bia.id, f.org.id, id);
  expect(theirs.state).toBe("usage_paused");
  expect(theirs.canManage).toBe(false);
  const refused = await continueRoutineUsagePause({ db: f.db }, bia.id, f.org.id, id).catch((e) => e);
  expect((refused as { code?: string }).code).toBe("routine.editor_only");

  const before = (await f.db.select().from(schema.messages).where(eq(schema.messages.orgId, f.org.id))).length;
  expect(await continueRoutineUsagePause({ db: f.db }, f.owner.id, f.org.id, id)).toEqual({ continued: true });
  expect(await continueRoutineUsagePause({ db: f.db }, f.owner.id, f.org.id, id)).toEqual({ continued: false });
  // Nothing is posted where it reports for the pause or the press.
  expect((await f.db.select().from(schema.messages).where(eq(schema.messages.orgId, f.org.id))).length).toBe(before);
  expect(await allCards(f)).toHaveLength(0);
  expect((await getRoutineView(f.db, f.owner.id, f.org.id, id)).state).not.toBe("usage_paused");

  // It goes on now, still at 96%: past the pause line until that window resets.
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(1);
  const audit = await f.db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.orgId, f.org.id), eq(schema.auditLog.action, "usage.continued")));
  expect(audit).toHaveLength(1);
});

/**
 * A slot of a routine paused at `percent` of its plan, on an agent whose long work keeps off paid extra usage (or,
 * with `extraUsage`, may use it but the plan's extra usage window is at `extraUsed`; null: the plan reports none).
 */
async function pausedExtraOff(
  percent: number,
  { extraUsage = false, extraUsed = 10 as number | null }: { extraUsage?: boolean; extraUsed?: number | null } = {},
) {
  const machineId = await computerAgent(f, { brainExtraUsage: extraUsage });
  const usage = (used: number) =>
    reading([
      { kind: "five_hour", usedPercent: used, resetsAt: iso(3600_000) },
      ...(extraUsed === null ? [] : [{ kind: "other", label: "Extra usage", usedPercent: extraUsed }]),
    ]);
  await storeOwnUsage(f, machineId, usage(percent));
  const { brain, seen } = scripted(() => [{ type: "done", text: "ok" }]);
  const handlers = handlersWith(f, brain);
  await scheduledSlot(f);
  await drainOutbox(f.db, handlers);
  const [routine] = await f.db.select().from(schema.routines);
  return {
    id: routine?.id ?? "",
    seen,
    handlers,
    setUsage: (used: number) => storeOwnUsage(f, machineId, usage(used)),
  };
}

test("with extra usage off, Continuar agora goes on up to the plan's own allowance and is refused past it, on Rotinas and the card alike", async () => {
  f = await setup();
  const { id, seen, handlers, setUsage } = await pausedExtraOff(97);
  expect(seen).toHaveLength(0);
  expect((await getRoutineView(f.db, f.owner.id, f.org.id, id)).usagePause?.extraOff).toBe(false);

  // The plan's window is used up meanwhile: going on would be paid extra usage, which this agent's switch keeps off.
  await setUsage(100);
  expect((await getRoutineView(f.db, f.owner.id, f.org.id, id)).usagePause?.extraOff).toBe(true);
  const refused = await continueRoutineUsagePause({ db: f.db }, f.owner.id, f.org.id, id).catch((e) => e);
  expect((refused as { code?: string }).code).toBe("routine.continue_extra_off");
  expect((refused as Error).message).toContain("used up");
  // The chat card's Continuar agora follows the same rule.
  const [run] = await runs(f);
  if (!run) throw new Error("no run");
  const wait = (run.transcript as { waitingForBrain?: { waitId: string } }).waitingForBrain;
  const card = await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: f.general.id,
    author: { type: "agent", agentId: f.agent.id, runId: run.id, hop: 0 },
    body: "Pausei o trabalho longo perto do limite do plano.",
    meta: {
      actionCard: {
        kind: "usage_paused",
        state: "paused",
        runId: run.id,
        waitId: wait?.waitId,
        agentId: f.agent.id,
        forUserId: f.owner.id,
        source: "plan",
        percent: 97,
        plan: "Claude",
        continuedByUserId: null,
        continuedAt: null,
      },
    },
  });
  const deps = { db: f.db, pubsub: f.pubsub, gateway: f.gateway };
  const onCard = await answerNow(deps, f.owner.id, f.org.id, card.id).catch((e) => e);
  expect((onCard as { code?: string }).code).toBe("run.continue_extra_off");

  // Back under the plan's allowance: it goes on.
  await setUsage(97);
  expect(await continueRoutineUsagePause({ db: f.db }, f.owner.id, f.org.id, id)).toEqual({ continued: true });
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(1);
});

test("with the extra-usage switch on but no extra usage left, Continuar agora past the plan is refused for that reason, not the switch", async () => {
  f = await setup();
  const { id, setUsage } = await pausedExtraOff(97, { extraUsage: true, extraUsed: null });
  expect((await getRoutineView(f.db, f.owner.id, f.org.id, id)).state).toBe("usage_paused");
  await setUsage(100);
  const view = await getRoutineView(f.db, f.owner.id, f.org.id, id);
  expect([view.usagePause?.extraOff, view.usagePause?.extraUsedUp]).toEqual([false, true]);
  const refused = await continueRoutineUsagePause({ db: f.db }, f.owner.id, f.org.id, id).catch((e) => e);
  expect((refused as { code?: string }).code).toBe("routine.continue_extra_used_up");
  expect((refused as Error).message).not.toContain("turn that on");
  const [run] = await runs(f);
  if (!run) throw new Error("no run");
  expect(await usageCardCode(run.id)).toBe("run.continue_extra_used_up");
});

/** The code Continuar agora on a usage-pause card for `runId` is refused with, through the chat's answer-now. */
async function usageCardCode(runId: string) {
  const [run] = (await runs(f)).filter((r) => r.id === runId);
  const wait = (run?.transcript as { waitingForBrain?: { waitId: string } } | undefined)?.waitingForBrain;
  const card = await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: f.general.id,
    author: { type: "agent", agentId: f.agent.id, runId, hop: 0 },
    body: "Pausei o trabalho longo perto do limite do plano.",
    meta: {
      actionCard: {
        kind: "usage_paused",
        state: "paused",
        runId,
        waitId: wait?.waitId,
        agentId: f.agent.id,
        forUserId: f.owner.id,
        source: "plan",
        percent: 97,
        plan: "Claude",
        continuedByUserId: null,
        continuedAt: null,
      },
    },
  });
  const refused = await answerNow({ db: f.db, pubsub: f.pubsub, gateway: f.gateway }, f.owner.id, f.org.id, card.id)
    .then(() => null)
    .catch((e: unknown) => e);
  return (refused as { code?: string } | null)?.code ?? null;
}

test("a run continued with extra usage off stops again at the plan's own allowance", async () => {
  f = await setup();
  const { id, seen, handlers, setUsage } = await pausedExtraOff(96);
  expect(await continueRoutineUsagePause({ db: f.db }, f.owner.id, f.org.id, id)).toEqual({ continued: true });
  await setUsage(100);
  await drainOutbox(f.db, handlers);
  expect(seen).toHaveLength(0);
  expect((await runs(f)).at(-1)?.status).toBe("waiting_input");
});
