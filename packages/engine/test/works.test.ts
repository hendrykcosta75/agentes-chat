import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { channelTopic } from "@agenteschat/adapters";
import { and, eq, schema } from "@agenteschat/db";
import { type ModelRequest, systemText } from "@agenteschat/providers";
import {
  type AgentProposalCard,
  type AgentRun,
  addChannelMember,
  addRunStep,
  agentProposalOf,
  answerQuestion,
  type CardDelegate,
  cancelRun,
  checkInWork,
  continueRun,
  createAgent,
  createChannel,
  createIssue,
  createJobHandlers,
  createPassToolSource,
  createSetupToolSource,
  createToolGateway,
  drainOutbox,
  endWork,
  enqueue,
  followUpWork,
  insertMessage,
  invokeToolForRun,
  isCatchUp,
  listIssues,
  loadAgentStatuses,
  moveRun,
  moveToBackground,
  openDm,
  POST_UPDATE_TOOL,
  postPersonMessage,
  postWorkUpdate,
  reconcileWorks,
  recoverStaleRuns,
  releaseHeldInbox,
  releaseInbox,
  removeChannelMember,
  runAuthority,
  STEER_WORK_TOOL,
  STOP_WORK_TOOL,
  type SteerMessage,
  setRightHandApprovals,
  steeredByOthers,
  steerWork,
  sweepEndedInboxes,
  type ToolSource,
  taskManager,
  WORK_CHECK_IN_JOB,
  WORK_FOLLOW_UP_JOB,
  WORK_IN_BACKGROUND_TOOL,
  WORK_LIMITS,
  whileHeld,
  workBrief,
  workView,
} from "../src";
import { PASSED_ON_NOTE, renderSteered } from "../src/live-steer";
import { noticeText } from "../src/notices";
import { takeInbox } from "../src/run-inbox";
import { deliverNoticeToRun } from "../src/run-resume";
import { addMember, answerSteering, type Fixture, setup } from "./fixtures";

setDefaultTimeout(30_000);

let f: Fixture;
afterEach(async () => {
  const current = f;
  f = undefined as unknown as Fixture;
  await current?.close();
});

const deps = () => ({ db: f.db, pubsub: f.pubsub });
const ask = (body: string, threadId?: string, userId = f.owner.id, channelId = f.general.id) =>
  postPersonMessage(deps(), userId, f.org.id, channelId, { body, ...(threadId ? { threadId } : {}) });
const runs = () => f.db.select().from(schema.agentRuns).orderBy(schema.agentRuns.createdAt);
const works = () => f.db.select().from(schema.agentWorks).orderBy(schema.agentWorks.createdAt);
const messages = () => f.db.select().from(schema.messages).orderBy(schema.messages.createdAt);
const lastText = (req: ModelRequest) => JSON.stringify(req.messages.at(-1)?.content ?? "");
/** The agent's messages in a thread after a given message, oldest first. */
const saidAfter = async (threadId: string, afterId: string) => {
  const all = await messages();
  const from = all.findIndex((m) => m.id === afterId);
  return all.slice(from + 1).filter((m) => m.authorType === "agent" && m.threadId === threadId);
};

/** A run that started on `body` and is working now (its job not run: the test drives it). */
async function working(body: string, threadId?: string, channelId?: string): Promise<AgentRun> {
  const before = new Set((await runs()).map((r) => r.id));
  await ask(body, threadId, f.owner.id, channelId);
  const run = (await runs()).find((r) => !before.has(r.id));
  if (!run) throw new Error("no run started");
  const [moved] = await f.db
    .update(schema.agentRuns)
    .set({ status: "running", startedAt: new Date(), heartbeatAt: new Date() })
    .where(eq(schema.agentRuns.id, run.id))
    .returning();
  return moved as AgentRun;
}

async function moved(run: AgentRun, extra: Partial<Parameters<typeof moveToBackground>[2]> = {}) {
  const out = await moveToBackground(deps(), run.id, {
    how: "agent",
    title: "Migrar a cobrança",
    say: "Vou cuidar disso.",
    ...extra,
  });
  if (!out) throw new Error("not moved");
  return out;
}

test("work_in_background: the anchor in the timeline, updates in its thread, the report home; a card follows it", async () => {
  f = await setup({
    workTools: true,
    reply: (_req, call) =>
      call === 1
        ? {
            chunks: [],
            toolUses: [
              {
                name: WORK_IN_BACKGROUND_TOOL,
                input: {
                  title: "Migrar a cobrança",
                  say: "Vou cuidar disso em segundo plano. Te aviso aqui. O próximo update deve sair em ~10 min.",
                  next_update_minutes: 10,
                  card: true,
                  plan: [{ text: "Ler o esquema" }, { text: "Migrar" }, { text: "Conferir" }],
                },
              },
            ],
          }
        : call === 2
          ? {
              chunks: [],
              toolUses: [
                {
                  name: POST_UPDATE_TOOL,
                  input: {
                    text: "Esquema lido; migrando as tabelas.",
                    plan: [
                      { text: "Ler o esquema", state: "done" },
                      { text: "Migrar", state: "doing" },
                      { text: "Conferir" },
                    ],
                  },
                },
              ],
            }
          : { chunks: ["Pronto: 3 tabelas migradas e conferidas, nada pendente."] },
  });
  const askMsg = await ask("@dev migra a cobrança pro novo esquema");
  await drainOutbox(f.db, f.handlers);

  const [run] = await runs();
  const [work] = await works();
  expect(run?.status).toBe("done");
  expect(work).toMatchObject({ status: "done", how: "agent", ownThread: true, homeThreadId: null, updateSeq: 1 });
  const all = await messages();
  const anchor = all.find((m) => m.id === work?.anchorMessageId);
  expect(anchor?.threadId).toBeNull();
  expect(anchor?.body).toStartWith("Vou cuidar disso em segundo plano.");
  expect(anchor?.meta.longWork).toEqual({ id: work?.id });
  // From the move on, the run answers in the anchor's thread.
  expect(run?.threadRootId).toBe(anchor?.id as string);
  expect(run?.workId).toBe(work?.id as string);
  const [thread] = await f.db
    .select()
    .from(schema.threads)
    .where(eq(schema.threads.rootMessageId, anchor?.id ?? ""));
  expect(thread?.title).toBe("Migrar a cobrança");
  const update = all.find((m) => m.meta.workUpdate);
  expect(update).toMatchObject({ threadId: anchor?.id, body: "Esquema lido; migrando as tabelas." });
  // The report goes home, where it was asked, as a real reply.
  const report = all.find((m) => m.meta.workEnd);
  expect(report).toMatchObject({ threadId: null, body: "Pronto: 3 tabelas migradas e conferidas, nada pendente." });
  expect(report?.meta.workEnd).toEqual({ id: work?.id, status: "done" });
  expect(work?.resultMessageId).toBe(report?.id as string);
  expect(askMsg.threadId).toBeNull();
  // The card: the agent's, in this channel, done, with the agent's plan and the update in its activity.
  const issues = await listIssues(f.db, { type: "person", userId: f.owner.id }, f.org.id);
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({
    title: "Migrar a cobrança",
    status: "done",
    channelId: f.general.id,
    assignee: { type: "agent", id: f.agent.id },
    blocked: null,
  });
  expect(issues[0]?.backgroundWork?.plan.map((p) => p.state)).toEqual(["done", "doing", "todo"]);
  const activity = await f.db.select().from(schema.issueActivity);
  expect(activity.some((a) => a.event === "work_update" && a.text === "Esquema lido; migrando as tabelas.")).toBe(true);
  // The move note told it what to do next, on its next call.
  expect(lastText(f.provider.calls[1]?.request as ModelRequest)).toContain("This is now background work");

  // The report notifies the person behind it as news of its own; the update never does.
  await drainOutbox(f.db, f.handlers);
  const notes = await f.db.select().from(schema.notifications);
  expect(notes.some((n) => n.groupKey === `work_end:${work?.id}`)).toBe(true);
  expect(notes.map((n) => n.source.messageId)).not.toContain(update?.id);
});

test("a work frees the conversation: a new message, or a reply in the anchor's thread, starts a reply turn of its own", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  const { work, anchor } = await moved(run);
  expect(work.ownThread).toBe(true);

  await ask("@dev quanto é 2+2?");
  const after = await runs();
  expect(after).toHaveLength(2);
  const [first] = after;
  expect(first?.pendingMessageIds).toEqual([]);

  // No mention needed in the work's thread: the message is for its agent, never held by the work at work.
  const reply = await ask("usa o banco de staging", anchor.id);
  const all = await runs();
  expect(all).toHaveLength(3);
  expect(all[0]?.pendingMessageIds).toEqual([]);
  expect(all[2]).toMatchObject({ agentId: f.agent.id, triggerMessageId: reply.id, threadRootId: anchor.id });
  expect((await messages()).find((m) => m.id === reply.id)?.meta).toMatchObject({ forWork: true });
});

test("end to end: asked about a running work, the reply turn answers from what it knows; a change of scope steers the work", async () => {
  const workIdOf = (req: ModelRequest) => /work_id ([0-9a-f-]{36})/.exec(JSON.stringify(req.system))?.[1] ?? "";
  f = await setup({
    workTools: true,
    reply: (req) => {
      const said = lastText(req);
      if (said.includes("testa só a LP"))
        return { chunks: [], toolUses: [{ name: STEER_WORK_TOOL, input: { work_id: workIdOf(req) } }] };
      if (said.includes("Passed on"))
        return { chunks: ["Combinado: passei para o trabalho, ele testa só a LP a partir do próximo passo."] };
      const brief = JSON.stringify(req.system);
      return {
        chunks: [
          brief.includes("Varri 12 páginas") ? "Não, varri 12 páginas até agora, a LP é só a primeira." : "Não sei.",
        ],
      };
    },
  });
  const run = await working("@dev faz o QA do site");
  const { work, anchor } = await moved(run, { title: "QA do site" });
  await postWorkUpdate(deps(), run.id, { text: "Varri 12 páginas; achei 2 links quebrados." });
  // The work's own job is driven by the test: only the reply turns run here.
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));

  const question = await ask("aqui só a LP tá sendo testada?", anchor.id);
  await drainOutbox(f.db, f.handlers);
  expect((await saidAfter(anchor.id, question.id)).map((m) => m.body)).toEqual([
    "Não, varri 12 páginas até agora, a LP é só a primeira.",
  ]);
  const brief = JSON.stringify(f.provider.calls[0]?.request.system);
  expect(brief).toContain(`work_id ${work.id}: \\"QA do site\\"`);
  expect(brief).toContain("Updates so far");
  // The work kept running, and its inbox didn't get the question.
  const [stillWorking] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, run.id));
  expect(stillWorking).toMatchObject({ status: "running", pendingMessageIds: [] });
  expect((await works())[0]?.status).toBe("live");

  const change = await ask("testa só a LP", anchor.id);
  await drainOutbox(f.db, f.handlers);
  const [steered] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, run.id));
  expect(steered).toMatchObject({ status: "running", pendingMessageIds: [change.id] });
  expect((await saidAfter(anchor.id, change.id)).map((m) => m.body)).toEqual([
    "Combinado: passei para o trabalho, ele testa só a LP a partir do próximo passo.",
  ]);
});

test("a work waiting on a person's help still takes their message; one waiting for its computer leaves it to a reply turn", async () => {
  f = await setup();
  const run = await working("@dev entra no painel");
  const { anchor } = await moved(run);
  await f.db.update(schema.agentRuns).set({ status: "waiting_input" }).where(eq(schema.agentRuns.id, run.id));
  const done = await ask("pronto, loguei", anchor.id);
  const [waiting] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, run.id));
  expect(waiting?.pendingMessageIds).toEqual([done.id]);
  expect(await runs()).toHaveLength(1);

  await f.db
    .update(schema.agentRuns)
    .set({ pendingMessageIds: [], transcript: { waitingForBrain: { code: "busy", waitId: "w1", machineId: "m1" } } })
    .where(eq(schema.agentRuns.id, run.id));
  const later = await ask("e aí?", anchor.id);
  const all = await runs();
  expect(all).toHaveLength(2);
  expect(all[1]?.triggerMessageId).toBe(later.id);
});

test("in the work's thread, a reply that names a person talks to them: no reply turn, the router decides", async () => {
  f = await setup();
  const run = await working("@dev faz o QA do site");
  const { anchor } = await moved(run);
  const bia = await addMember(f.db, f.org.id, "member", "bia");
  await f.db
    .update(schema.organizationMembers)
    .set({ handle: "bia" })
    .where(eq(schema.organizationMembers.userId, bia.id));
  await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: bia.id });
  const toBia = await ask("@bia dá uma olhada nos links quebrados", anchor.id);
  expect(toBia.mentionedUserIds).toEqual([bia.id]);
  expect(toBia.meta.forWork).toBeUndefined();
  expect(await runs()).toHaveLength(1);
  expect((await runs())[0]?.pendingMessageIds).toEqual([]);
});

test("a work left by an archived agent claims no reply in its thread: the router decides", async () => {
  f = await setup();
  const run = await working("@dev faz o QA do site");
  const { anchor } = await moved(run);
  await f.db.update(schema.agents).set({ archivedAt: new Date() }).where(eq(schema.agents.id, f.agent.id));
  const reply = await ask("alguém sabe como ficou o QA?", anchor.id);
  expect(reply.meta.forWork).toBeUndefined();
  expect(await runs()).toHaveLength(1);
});

test("steer_work into a work whose run ended meanwhile: refused, and the message stays with the reply turn", async () => {
  f = await setup({ workTools: true });
  const run = await working("@dev faz o QA do site");
  const { work, anchor } = await moved(run);
  const reply = await working("testa só a LP", anchor.id);
  // The work's run ended; its work isn't closed yet (the sweep does that).
  await f.db.update(schema.agentRuns).set({ status: "done" }).where(eq(schema.agentRuns.id, run.id));
  const steer = await invokeToolForRun(
    { ...deps(), tools: f.tools ?? null },
    { orgId: f.org.id, agentId: f.agent.id, runId: reply.id, machineId: "" },
    { id: "s1", name: STEER_WORK_TOOL, input: { work_id: work.id } },
  );
  expect(steer.result.isError).toBe(true);
  expect(steer.result.content).toContain("already ended");
  const [ended] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, run.id));
  expect(ended?.pendingMessageIds).toEqual([]);
});

test("in a DM too; asked inside a thread, the work keeps the thread and the agent answers there in a new run", async () => {
  f = await setup();
  const dm = await openDm(f.db, f.owner.id, f.org.id, { agentId: f.agent.id });
  const run = await working("gera o relatório de churn", undefined, dm.id);
  await moved(run);
  await ask("e o resumo de ontem?", undefined, f.owner.id, dm.id);
  expect(await runs()).toHaveLength(2);

  const root = await ask("Deploy de hoje");
  const inThread = await working("@dev investiga os erros", root.id);
  const out = await moved(inThread);
  expect(out.work.ownThread).toBe(false);
  expect(out.anchor.threadId).toBe(root.id);
  await ask("@dev e o log do worker?", root.id);
  const all = await runs();
  expect(all).toHaveLength(4);
  expect(all.find((r) => r.id === inThread.id)?.pendingMessageIds).toEqual([]);
});

test("the conversation's run knows the work, passes a message on with steer_work, and stop_work asks the right person", async () => {
  f = await setup({ workTools: true });
  const run = await working("@dev roda a migração");
  const { work } = await moved(run);
  const other = await working("@dev aliás, usa o banco de staging");
  const brief = await workBrief(f.db, other);
  expect(brief).toContain(`work_id ${work.id}`);
  const id = { orgId: f.org.id, agentId: f.agent.id, runId: other.id, machineId: "" };
  const steer = await invokeToolForRun({ ...deps(), tools: f.tools ?? null }, id, {
    id: "s1",
    name: STEER_WORK_TOOL,
    input: { work_id: work.id },
  });
  expect(steer.result.isError).not.toBe(true);
  const [target] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, run.id));
  expect(target?.pendingMessageIds).toContain(other.triggerMessageId);

  // Someone else's message can't stop the owner's work.
  const bia = await addMember(f.db, f.org.id, "member", "bia");
  await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: bia.id });
  await f.db.update(schema.agentRuns).set({ status: "done" }).where(eq(schema.agentRuns.id, other.id));
  const before = new Set((await runs()).map((r) => r.id));
  await ask("@dev para a migração", undefined, bia.id);
  const theirs = (await runs()).find((r) => !before.has(r.id)) as AgentRun;
  await f.db.update(schema.agentRuns).set({ status: "running" }).where(eq(schema.agentRuns.id, theirs.id));
  const refused = await invokeToolForRun(
    { ...deps(), tools: f.tools ?? null },
    { ...id, runId: theirs.id },
    { id: "s2", name: STOP_WORK_TOOL, input: { work_id: work.id } },
  );
  expect(refused.result.isError).toBe(true);
  expect(refused.result.content).toContain("Only who asked");
});

test("the safety net: a slow tool past the time moves the run by itself, and the brain hears it", async () => {
  const slow: ToolSource = {
    name: "slow",
    tools: async () => [
      {
        name: "build",
        description: "Build",
        scope: "context:read",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          await Bun.sleep(400);
          return { content: "built" };
        },
      },
    ],
  };
  f = await setup({
    workTools: true,
    toolSources: [slow],
    workAuto: { afterMs: 100, tickMs: 20 },
    reply: (_req, call) =>
      call === 1 ? { chunks: [], toolUses: [{ name: "build", input: {} }] } : { chunks: ["Build pronto."] },
  });
  await ask("@dev builda o app");
  await drainOutbox(f.db, f.handlers);
  const [work] = await works();
  expect(work).toMatchObject({ how: "auto", status: "done" });
  const anchor = (await messages()).find((m) => m.id === work?.anchorMessageId);
  expect(anchor?.meta).toMatchObject({ longWork: { id: work?.id, auto: true }, bodyCode: "work_auto_moved" });
  // The brain's next call hears it (the cheap model's call naming the work comes between).
  const heard = f.provider.calls.slice(1).map((c) => JSON.stringify(c.request.messages));
  expect(heard.some((m) => m.includes("This is now background work"))).toBe(true);
  const report = (await messages()).find((m) => m.meta.workEnd);
  expect(report?.body).toBe("Build pronto.");
  expect(report?.threadId).toBeNull();
});

test("the safety net counts calls too", async () => {
  const quick: ToolSource = {
    name: "quick",
    tools: async () => [
      {
        name: "look",
        description: "Look",
        scope: "context:read",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          await Bun.sleep(40);
          return { content: "ok" };
        },
      },
    ],
  };
  f = await setup({
    workTools: true,
    toolSources: [quick],
    workAuto: { afterCalls: 2, minMs: 50, tickMs: 10 },
    reply: (_req, call) =>
      call <= 4 ? { chunks: [], toolUses: [{ name: "look", input: {} }] } : { chunks: ["Feito."] },
  });
  await ask("@dev confere tudo");
  await drainOutbox(f.db, f.handlers);
  const [work] = await works();
  expect(work?.how).toBe("auto");
});

test("the safety net leaves a quick answer of many fast calls in the conversation", async () => {
  const quick: ToolSource = {
    name: "quick",
    tools: async () => [
      {
        name: "look",
        description: "Look",
        scope: "context:read",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
          await Bun.sleep(5);
          return { content: "ok" };
        },
      },
    ],
  };
  f = await setup({
    workTools: true,
    toolSources: [quick],
    workAuto: { afterCalls: 2, tickMs: 10 },
    reply: (_req, call) =>
      call <= 6 ? { chunks: [], toolUses: [{ name: "look", input: {} }] } : { chunks: ["Está em config/upload.ts."] },
  });
  await ask("@dev onde está o limite de upload?");
  await drainOutbox(f.db, f.handlers);
  expect(await works()).toHaveLength(0);
  expect((await messages()).at(-1)).toMatchObject({ body: "Está em config/upload.ts.", threadId: null });
});

test("the promise: a nudge when no update came, then exactly one update of the server's; a racing update wins", async () => {
  f = await setup();
  await f.db.update(schema.users).set({ locale: "es" }).where(eq(schema.users.id, f.owner.id));
  const run = await working("@dev roda a migração");
  const { work } = await moved(run);
  const due = new Date((work.nextUpdateAt as Date).getTime() + 1000);
  // A check before its time does nothing.
  expect(await checkInWork(deps(), f.org.id, { workId: work.id, seq: 0, phase: "nudge" })).toBe("none");
  expect(await checkInWork(deps(), f.org.id, { workId: work.id, seq: 0, phase: "nudge" }, due)).toBe("nudged");
  const nudge = (await messages()).find(
    (m) => (m.meta.notice as { kind?: string } | undefined)?.kind === "work_check_in",
  );
  expect(nudge?.body).toContain("You promised an update");
  const [r] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, run.id));
  expect(r?.pendingMessageIds).toContain(nudge?.id as string);
  const fallback = await f.db
    .select()
    .from(schema.outbox)
    .where(and(eq(schema.outbox.kind, WORK_CHECK_IN_JOB)));
  expect(fallback.some((j) => j.payload.phase === "fallback")).toBe(true);

  const later = new Date(due.getTime() + WORK_LIMITS.graceMs);
  expect(await checkInWork(deps(), f.org.id, { workId: work.id, seq: 0, phase: "fallback" }, later)).toBe("posted");
  // The same job again (a redelivery) posts nothing more.
  expect(await checkInWork(deps(), f.org.id, { workId: work.id, seq: 0, phase: "fallback" }, later)).toBe("none");
  const auto = (await messages()).filter((m) => (m.meta.workUpdate as { auto?: boolean } | undefined)?.auto);
  expect(auto).toHaveLength(1);
  expect(auto[0]?.meta.bodyCode).toBe("work_auto_update");
  // In the language of whom the work is for.
  expect(auto[0]?.body).toStartWith("Sigo en ello (");
  const [after] = await f.db.select().from(schema.agentWorks).where(eq(schema.agentWorks.id, work.id));
  expect(after?.updateSeq).toBe(1);
  expect((after?.nextUpdateAt?.getTime() ?? 0) - later.getTime()).toBe(10 * 60_000);

  // The agent's own update racing the server's: one message.
  const seq = after?.updateSeq ?? 1;
  const agentUpdate = await postWorkUpdate(
    deps(),
    run.id,
    { text: "Tabelas migradas.", important: true },
    new Date(later.getTime() + 61_000),
  );
  expect(agentUpdate.ok).toBe(true);
  expect(
    await checkInWork(
      deps(),
      f.org.id,
      { workId: work.id, seq, phase: "fallback" },
      new Date(later.getTime() + 999_000),
    ),
  ).toBe("none");
});

test("updates: 5 minutes apart unless important (then a minute), the promise clamped to 5–20", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  await moved(run);
  const t0 = new Date();
  const first = await postWorkUpdate(deps(), run.id, { text: "Começando.", nextUpdateMin: 60 }, t0);
  expect(first.ok && first.work.nextUpdateAt?.getTime()).toBe(t0.getTime() + 20 * 60_000);
  const soon = await postWorkUpdate(deps(), run.id, { text: "Mais um." }, new Date(t0.getTime() + 2 * 60_000));
  expect(soon.ok).toBe(false);
  expect(!soon.ok && soon.reason).toStartWith("Too soon; your last update was 2 min ago.");
  const important = await postWorkUpdate(
    deps(),
    run.id,
    { text: "Bloqueado: falta a chave.", important: true, nextUpdateMin: 1 },
    new Date(t0.getTime() + 2 * 60_000),
  );
  expect(important.ok && important.work.nextUpdateAt?.getTime()).toBe(t0.getTime() + 7 * 60_000);
  const tooFast = await postWorkUpdate(
    deps(),
    run.id,
    { text: "De novo.", important: true },
    new Date(t0.getTime() + 2.5 * 60_000),
  );
  expect(tooFast.ok).toBe(false);
});

test("waiting: no timer while it waits, the line says on what, and it starts over on resume", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  const { work } = await moved(run);
  await f.db.update(schema.agentRuns).set({ status: "waiting_approval" }).where(eq(schema.agentRuns.id, run.id));
  const { pauseWorkTimer, resumeWorkTimer } = await import("../src/works");
  await pauseWorkTimer(deps(), { ...run, workId: work.id });
  let view = await workView(f.db, f.org.id, work.id);
  expect(view).toMatchObject({ state: "waiting_approval", nextUpdateAt: null });
  expect(
    await checkInWork(deps(), f.org.id, { workId: work.id, seq: 0, phase: "nudge" }, new Date(Date.now() + 3600_000)),
  ).toBe("none");
  await f.db
    .update(schema.agentRuns)
    .set({
      status: "waiting_input",
      transcript: { waitingForBrain: { code: "usage_pause", until: "2026-11-02T14:00:00.000Z" } },
    })
    .where(eq(schema.agentRuns.id, run.id));
  view = await workView(f.db, f.org.id, work.id);
  expect(view).toMatchObject({ state: "paused", pausedUntil: "2026-11-02T14:00:00.000Z" });
  await f.db.update(schema.agentRuns).set({ status: "running" }).where(eq(schema.agentRuns.id, run.id));
  const now = new Date();
  await resumeWorkTimer(deps(), { ...run, workId: work.id }, now);
  view = await workView(f.db, f.org.id, work.id);
  expect(view?.state).toBe("working");
  expect(Date.parse(view?.nextUpdateAt ?? "")).toBe(now.getTime() + 10 * 60_000);
});

test("waiting on an answer, the view says what it asked, in one line and only while the question is open", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  const { work } = await moved(run);
  const question = (over: Partial<typeof schema.agentQuestions.$inferInsert> = {}) => ({
    orgId: f.org.id,
    runId: run.id,
    agentId: run.agentId,
    channelId: f.general.id,
    toolUseId: "tu-1",
    text: "Envio agora\n\npara @ana ou espero?",
    expiresAt: new Date(Date.now() + 3600_000),
    ...over,
  });
  const [first] = await f.db.insert(schema.agentQuestions).values(question()).returning();
  await f.db.insert(schema.agentQuestions).values(question({ toolUseId: "tu-2", text: "E a outra?" }));
  await f.db.update(schema.agentRuns).set({ status: "waiting_input" }).where(eq(schema.agentRuns.id, run.id));
  expect(await workView(f.db, f.org.id, work.id)).toMatchObject({
    state: "waiting_input",
    question: { text: "Envio agora para ana ou espero?", messageId: null },
  });
  // A question another conversation holds stays out of a view this one's readers get.
  await f.db.update(schema.agentQuestions).set({ channelId: f.org.id }).where(eq(schema.agentQuestions.runId, run.id));
  expect((await workView(f.db, f.org.id, work.id))?.question).toBeNull();
  await f.db
    .update(schema.agentQuestions)
    .set({ channelId: f.general.id })
    .where(eq(schema.agentQuestions.runId, run.id));
  await f.db
    .update(schema.agentQuestions)
    .set({ status: "answered" })
    .where(eq(schema.agentQuestions.id, first?.id as string));
  expect((await workView(f.db, f.org.id, work.id))?.question?.text).toBe("E a outra?");
  await f.db.update(schema.agentRuns).set({ status: "running" }).where(eq(schema.agentRuns.id, run.id));
  expect((await workView(f.db, f.org.id, work.id))?.question).toBeNull();
});

test("cards: none for a quick run nor a short auto work; card: true makes one; a named issue is reused untouched", async () => {
  f = await setup();
  const quick = await working("@dev oi");
  await f.db.update(schema.agentRuns).set({ status: "done" }).where(eq(schema.agentRuns.id, quick.id));
  const short = await working("@dev confere o build");
  // No model to name it: no title, never the ask's own words.
  const auto = await moveToBackground(deps(), short.id, { how: "auto", title: "" });
  expect(auto?.work.title).toBe("");
  expect(await listIssues(f.db, { type: "person", userId: f.owner.id }, f.org.id)).toHaveLength(0);

  const existing = await createIssue(deps(), { type: "person", userId: f.owner.id }, f.org.id, {
    title: "Cobrança nova",
    criteria: ["Sem perda de dados"],
    assignee: { type: "agent", id: f.agent.id },
    channelId: f.general.id,
  });
  const reuse = await working("@dev pega a #1");
  const named = await moved(reuse, { card: existing.number });
  const [linked] = await f.db.select().from(schema.agentWorks).where(eq(schema.agentWorks.id, named.work.id));
  expect(linked?.issueId).toBe(existing.id);
  const [issue] = await f.db.select().from(schema.issues).where(eq(schema.issues.id, existing.id));
  expect(issue?.criteria.map((c) => c.text)).toEqual(["Sem perda de dados"]);
  expect(issue?.status).toBe("in_progress");

  const fresh = await working("@dev monta o relatório");
  const made = await moved(fresh, { card: true, title: "Relatório de churn" });
  const [w] = await f.db.select().from(schema.agentWorks).where(eq(schema.agentWorks.id, made.work.id));
  const [card] = await f.db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, w?.issueId ?? ""));
  expect(card).toMatchObject({ title: "Relatório de churn", status: "in_progress", channelId: f.general.id });

  // Failed: the blocked badge, in its stage. Stopped: back to A fazer.
  await f.db
    .update(schema.agentRuns)
    .set({ status: "failed", error: "budget_exceeded" })
    .where(eq(schema.agentRuns.id, fresh.id));
  await endWork(deps(), { ...fresh, workId: made.work.id, error: "budget_exceeded" }, "failed");
  const [failed] = await f.db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, card?.id ?? ""));
  expect(failed?.blocked).toMatchObject({ reason: "failed", text: "run.budget_exceeded" });
  expect(failed?.status).toBe("in_progress");
  await cancelRun(deps(), f.owner.id, f.org.id, reuse.id);
  const [stopped] = await f.db.select().from(schema.issues).where(eq(schema.issues.id, existing.id));
  expect(stopped?.status).toBe("todo");
  const end = (await messages()).find((m) => (m.meta.workEnd as { id?: string } | undefined)?.id === named.work.id);
  expect(end?.meta.workEnd).toMatchObject({ status: "canceled", byUserId: f.owner.id });
  // Stopped: by whom, in the person's words.
  expect(end?.meta.bodyParams).toMatchObject({ byName: f.owner.name });
});

test("a work 15 minutes old gets its card at its check-in", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  const { work } = await moved(run);
  const at = new Date(Date.now() + WORK_LIMITS.cardAfterMs + 60_000);
  await checkInWork(deps(), f.org.id, { workId: work.id, seq: 0, phase: "nudge" }, at);
  const [w] = await f.db.select().from(schema.agentWorks).where(eq(schema.agentWorks.id, work.id));
  expect(w?.issueId).not.toBeNull();
});

test("a work that posts its updates on time still gets its card at 15 minutes", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  const { work } = await moved(run, { title: "Migrar a cobrança" });
  const t0 = work.startedAt.getTime();
  expect((await postWorkUpdate(deps(), run.id, { text: "Lendo o esquema." }, new Date(t0 + 8 * 60_000))).ok).toBe(true);
  // The move queued the card's own check, at 15 minutes.
  const jobs = await f.db.select().from(schema.outbox).where(eq(schema.outbox.kind, WORK_CHECK_IN_JOB));
  const card = jobs.find((j) => j.payload.phase === "card");
  expect(card?.nextAttemptAt.getTime()).toBe(t0 + WORK_LIMITS.cardAfterMs);
  await checkInWork(deps(), f.org.id, { workId: work.id, seq: 0, phase: "card" }, new Date(t0 + 15 * 60_000));
  const [w] = await f.db.select().from(schema.agentWorks).where(eq(schema.agentWorks.id, work.id));
  expect(w?.issueId).not.toBeNull();
});

test("a fallback queued before a wait doesn't fire on the promise that restarted after it", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  const { work } = await moved(run);
  const due = (work.nextUpdateAt as Date).getTime();
  expect(await checkInWork(deps(), f.org.id, { workId: work.id, seq: 0, phase: "nudge" }, new Date(due + 1000))).toBe(
    "nudged",
  );
  const [job] = (await f.db.select().from(schema.outbox).where(eq(schema.outbox.kind, WORK_CHECK_IN_JOB))).filter(
    (j) => j.payload.phase === "fallback",
  );
  expect(job?.payload.due).toBe(due);
  const { pauseWorkTimer, resumeWorkTimer } = await import("../src/works");
  await pauseWorkTimer(deps(), { ...run, workId: work.id });
  await resumeWorkTimer(deps(), { ...run, workId: work.id }, new Date(due + 2 * 60_000));
  expect(
    await checkInWork(
      deps(),
      f.org.id,
      { workId: work.id, seq: 0, phase: "fallback", due },
      new Date(due + WORK_LIMITS.graceMs),
    ),
  ).toBe("none");
  expect((await messages()).some((m) => m.meta.workUpdate)).toBe(false);
});

test("updates are plain lines: a @handle in one calls nobody in", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  await moved(run);
  const out = await postWorkUpdate(deps(), run.id, { text: "@dev pode revisar o PR? Falta o @ops." });
  expect(out.ok && out.message.body).toBe("dev pode revisar o PR? Falta o ops.");
  expect(await runs()).toHaveLength(1);
});

test("card_issue: only a card the asker reads, here or workspace-wide; elsewhere a new card is made", async () => {
  f = await setup();
  const finance = await createChannel(f.db, f.owner.id, f.org.id, { name: "financeiro", visibility: "private" });
  await addChannelMember(f.db, f.owner.id, f.org.id, finance.id, { agentId: f.agent.id });
  const elsewhere = await createIssue(deps(), { type: "person", userId: f.owner.id }, f.org.id, {
    title: "Fechamento",
    channelId: finance.id,
    assignee: { type: "agent", id: f.agent.id },
  });
  const dm = await openDm(f.db, f.owner.id, f.org.id, { agentId: f.agent.id });
  const run = await working("pega a #1", undefined, dm.id);
  const out = await moved(run, { card: elsewhere.number });
  const [w] = await f.db.select().from(schema.agentWorks).where(eq(schema.agentWorks.id, out.work.id));
  expect(w?.issueId).not.toBe(elsewhere.id);
  const [card] = await f.db
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, w?.issueId ?? ""));
  expect(card).toMatchObject({ title: "Migrar a cobrança", channelId: dm.id });
});

test("caps: an agent's 4th work waits in line, with its place, and starts when one ends", async () => {
  f = await setup();
  const out = [];
  for (const n of [1, 2, 3, 4]) out.push(await moved(await working(`@dev tarefa ${n}`), { title: `Tarefa ${n}` }));
  expect(out.map((o) => o.queued)).toEqual([false, false, false, true]);
  const fourth = out[3] as (typeof out)[number];
  expect(await workView(f.db, f.org.id, fourth.work.id)).toMatchObject({
    state: "queued",
    queuePosition: 1,
    nextUpdateAt: null,
  });
  const first = out[0] as (typeof out)[number];
  const [firstRun] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.workId, first.work.id));
  await f.db
    .update(schema.agentRuns)
    .set({ status: "done" })
    .where(eq(schema.agentRuns.id, firstRun?.id ?? ""));
  await endWork(deps(), firstRun as AgentRun, "done");
  expect((await workView(f.db, f.org.id, fourth.work.id))?.status).toBe("live");
  const jobs = await f.db.select().from(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  expect(jobs.some((j) => String(j.payload.wait ?? "").startsWith("work_queue:"))).toBe(true);
});

test("the workspace's cap is the configured one", async () => {
  f = await setup();
  const { setWorkOrgCap } = await import("../src/works");
  setWorkOrgCap(1);
  try {
    const second = await createAgent(
      f.db,
      f.owner.id,
      f.org.id,
      { name: "Ops", handle: "ops", role: "Ops", instructions: "", credentialId: f.credential.id },
      { model: "claude-sonnet-5-5" },
    );
    await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { agentId: second.id });
    expect((await moved(await working("@dev um"))).queued).toBe(false);
    expect((await moved(await working("@ops dois"))).queued).toBe(true);
  } finally {
    setWorkOrgCap(10);
  }
});

test("restarts: a terminal run with a live work is closed once by the sweep, even run twice", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  const { work } = await moved(run);
  await f.db
    .update(schema.agentRuns)
    .set({ status: "failed", error: "Interrupted by a server restart" })
    .where(eq(schema.agentRuns.id, run.id));
  const [a, b] = await Promise.all([reconcileWorks(deps()), reconcileWorks(deps())]);
  expect(a + b).toBe(1);
  expect(await reconcileWorks(deps())).toBe(0);
  const ends = (await messages()).filter((m) => (m.meta.workEnd as { id?: string } | undefined)?.id === work.id);
  expect(ends).toHaveLength(1);
  expect(ends[0]?.meta.workEnd).toMatchObject({ status: "failed", errorCode: "run.interrupted" });
});

test("the sweep closes a work whose run is gone without stopping at it", async () => {
  f = await setup();
  const orphan = await moved(await working("@dev um"), { title: "Um" });
  const ended = await moved(await working("@dev dois"), { title: "Dois" });
  await f.db.update(schema.agentRuns).set({ workId: null }).where(eq(schema.agentRuns.workId, orphan.work.id));
  await f.db
    .update(schema.agentRuns)
    .set({ status: "failed", error: "budget_exceeded" })
    .where(eq(schema.agentRuns.workId, ended.work.id));
  expect(await reconcileWorks(deps())).toBe(2);
  const all = await works();
  expect(all.map((w) => w.status)).toEqual(["failed", "failed"]);
});

test("an automatic move is named by the cheap model in the conversation's words, never the ask's raw text", async () => {
  const named = "Permissões no Play Console";
  const assessing = (req: ModelRequest) => systemText(req.system).startsWith("You read a conversation thread");
  f = await setup({
    reply: (req) => ({ chunks: [assessing(req) ? JSON.stringify({ title: named, resolved: false }) : "ok"] }),
  });
  const root = await ask("@dev a versão 8 precisa do SHA-256 da Assinatura de apps");
  await f.db.update(schema.agentRuns).set({ status: "done" });
  const run = await working("@dev qual permissao vc precisa? https://media.giphy.com/media/x/giphy.gif", root.id);
  const out = await moveToBackground({ ...deps(), context: f.context }, run.id, { how: "auto", title: "" });
  expect(out?.work.title).toBe("Permissões no Play Console");
  // The model read the whole conversation, the root included.
  const prompt = JSON.stringify(f.provider.calls.find((c) => assessing(c.request))?.request.messages);
  expect(prompt).toContain("SHA-256");
  expect(prompt).toContain("qual permissao");
  const status = (await loadAgentStatuses(f.db, f.org.id)).find((s) => s.agentId === f.agent.id)?.status;
  expect(status).toMatchObject({ kind: "work", subject: "Permissões no Play Console" });
  const view = await taskManager(f.db, f.owner.id, f.org.id);
  expect(view.tasks.find((t) => t.runId === run.id)?.label).toBe("Permissões no Play Console");
  expect(JSON.stringify(view)).not.toContain("qual permissao");
});

test("a top-level ask is named with the messages just before it, and the call is recorded with its agent", async () => {
  const assessing = (req: ModelRequest) => systemText(req.system).startsWith("You read a conversation thread");
  f = await setup({
    reply: (req) => ({
      chunks: [assessing(req) ? JSON.stringify({ title: "Release 8 na loja", resolved: false }) : "ok"],
    }),
  });
  await ask("a versão 8 precisa sair na loja hoje");
  await f.db.update(schema.agentRuns).set({ status: "done" });
  const run = await working("@dev pode fazer isso?");
  const out = await moveToBackground({ ...deps(), context: f.context }, run.id, { how: "auto", title: "" });
  expect(out?.work.title).toBe("Release 8 na loja");
  const prompt = JSON.stringify(f.provider.calls.find((c) => assessing(c.request))?.request.messages);
  expect(prompt).toMatch(/<earlier>.*versão 8.*<\/earlier>.*<thread>.*pode fazer isso/);
  const usage = await f.db.select().from(schema.usageRecords).where(eq(schema.usageRecords.kind, "summary"));
  expect(usage.map((u) => [u.agentId, u.runId])).toEqual([[f.agent.id, run.id]]);
});

test("a work the cheap model can't name has no title, and gets its card only once named", async () => {
  let named = "";
  const assessing = (req: ModelRequest) => systemText(req.system).startsWith("You read a conversation thread");
  f = await setup({
    reply: (req) => ({ chunks: [assessing(req) ? JSON.stringify({ title: named, resolved: false }) : "ok"] }),
  });
  const other = await working("@dev Boa noite, pessoal! https://media.giphy.com/media/y/giphy.gif");
  const unnamed = await moveToBackground({ ...deps(), context: f.context }, other.id, { how: "auto", title: "" });
  expect(unnamed?.work.title).toBe("");
  expect(JSON.stringify(await loadAgentStatuses(f.db, f.org.id))).not.toContain("Boa noite");
  const late = new Date(Date.now() + WORK_LIMITS.cardAfterMs + 60_000);
  const card = { workId: unnamed?.work.id ?? "", seq: 0, phase: "card" as const };
  await checkInWork({ ...deps(), context: f.context }, f.org.id, card, late);
  expect(await listIssues(f.db, { type: "person", userId: f.owner.id }, f.org.id)).toHaveLength(0);
  named = "Saudação da noite";
  await checkInWork({ ...deps(), context: f.context }, f.org.id, card, late);
  const issues = await listIssues(f.db, { type: "person", userId: f.owner.id }, f.org.id);
  expect(issues.map((i) => i.title)).toEqual(["Saudação da noite"]);
});

test("the agent's status: one work, two, three, and one that waits", async () => {
  f = await setup();
  const status = async () => (await loadAgentStatuses(f.db, f.org.id)).find((s) => s.agentId === f.agent.id);
  const one = await moved(await working("@dev um"), { title: "Migrar a cobrança" });
  let s = await status();
  expect(s?.presence).toBe("busy");
  expect(s?.status).toMatchObject({ kind: "work", subject: "Migrar a cobrança", count: 1 });
  await moved(await working("@dev dois"), { title: "Relatório de churn" });
  s = await status();
  expect(s?.status).toMatchObject({
    kind: "work",
    count: 2,
    subject: "Relatório de churn",
    second: "Migrar a cobrança",
  });
  await moved(await working("@dev três"), { title: "Backup" });
  expect((await status())?.status?.count).toBe(3);
  // A work in a DM shows no title (the whole workspace reads the line).
  await f.db.delete(schema.agentWorks).where(eq(schema.agentWorks.title, "Backup"));
  await f.db.delete(schema.agentWorks).where(eq(schema.agentWorks.title, "Relatório de churn"));
  const [r] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.workId, one.work.id));
  await f.db
    .update(schema.agentRuns)
    .set({ status: "waiting_approval" })
    .where(eq(schema.agentRuns.id, r?.id ?? ""));
  expect((await status())?.status).toMatchObject({ kind: "work", wait: "approval", subject: "Migrar a cobrança" });
});

test("Continuar on a work stopped at its step limit carries the same work", async () => {
  f = await setup({
    workTools: true,
    reply: (_req, call) =>
      call === 1
        ? {
            chunks: [],
            toolUses: [{ name: WORK_IN_BACKGROUND_TOOL, input: { title: "Migrar", say: "Vou cuidar disso." } }],
          }
        : {
            chunks: ["ainda"],
            toolUses: [{ name: POST_UPDATE_TOOL, input: { text: `passo ${call}`, important: true } }],
          },
  });
  await ask("@dev migra");
  await drainOutbox(f.db, createJobHandlers({ ...f.jobDeps, maxToolTurns: 4 }));
  const [stopped] = await runs();
  const [work] = await works();
  expect(stopped?.workId).toBe(work?.id as string);
  // Out of steps isn't done: its line says it didn't finish and why, and the report (with Continuar) is home.
  expect(work?.status).toBe("failed");
  expect((await workView(f.db, f.org.id, work?.id ?? ""))?.errorCode).toBe("run.too_many_tool_calls");
  const report = (await messages()).find((m) => m.id === work?.resultMessageId);
  expect(report?.threadId).toBeNull();
  expect(report?.meta.workEnd).toMatchObject({ id: work?.id, status: "failed", errorCode: "run.too_many_tool_calls" });
  expect(report?.meta.stepLimit).toBeDefined();
  expect((await messages()).some((m) => m.meta.workEnd && m.id !== report?.id)).toBe(false);
  const { runId } = await continueRun(deps(), f.owner.id, f.org.id, stopped?.id ?? "");
  const [next] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, runId));
  expect(next?.workId).toBe(work?.id as string);
  expect(next?.threadRootId).toBe(work?.anchorMessageId as string);
  expect((await workView(f.db, f.org.id, work?.id ?? ""))?.status).toBe("live");
});

test("Continuar on a work its AI provider cut off goes on from its end, once; other failures don't", async () => {
  f = await setup();
  const fail = async (body: string, error: string) => {
    const run = await working(body);
    const { work } = await moved(run);
    const transcript = { system: [], messages: [], postedUpTo: 0, postedCount: 0, deltaSeq: 0 };
    await f.db
      .update(schema.agentRuns)
      .set({ status: "failed", error, transcript })
      .where(eq(schema.agentRuns.id, run.id));
    await endWork(deps(), { ...run, workId: work.id, error }, "failed");
    return { run, work };
  };
  const { run, work } = await fail("@dev migra a cobrança", "provider_error: overloaded");
  const [closed] = await f.db.select().from(schema.agentWorks).where(eq(schema.agentWorks.id, work.id));
  const end = (await messages()).find((m) => m.id === closed?.resultMessageId);
  expect(end?.agentRunId).toBe(run.id);
  expect(end?.meta.workEnd).toMatchObject({ status: "failed", errorCode: "run.provider_error" });

  const { runId } = await continueRun(deps(), f.owner.id, f.org.id, run.id);
  const [next] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, runId));
  expect(next).toMatchObject({ workId: work.id, triggerMessageId: end?.id, threadRootId: work.anchorMessageId });
  expect((await workView(f.db, f.org.id, work.id))?.status).toBe("live");
  const [marked] = await f.db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, end?.id ?? ""));
  expect(marked?.meta.workEnd).toMatchObject({ status: "failed", continuedRunId: runId });
  await expect(continueRun(deps(), f.owner.id, f.org.id, run.id)).rejects.toThrow("can't be continued");

  const budget = await fail("@dev outra coisa", "budget_exceeded");
  await expect(continueRun(deps(), f.owner.id, f.org.id, budget.run.id)).rejects.toThrow("can't be continued");
});

test("a work's card from a DM stays with who reads the DM until someone shows it to everyone", async () => {
  f = await setup();
  const dm = await openDm(f.db, f.owner.id, f.org.id, { agentId: f.agent.id });
  const made = await moved(await working("monta o relatório", undefined, dm.id), { card: true, title: "Relatório" });
  const [w] = await f.db.select().from(schema.agentWorks).where(eq(schema.agentWorks.id, made.work.id));
  const bia = await addMember(f.db, f.org.id, "member", "bia");
  const seen = async (userId: string) =>
    (await listIssues(f.db, { type: "person", userId }, f.org.id)).some((i) => i.id === w?.issueId);
  expect(await seen(f.owner.id)).toBe(true);
  expect(await seen(bia.id)).toBe(false);
  const { setIssueAudience } = await import("../src");
  const runId = (await runs()).find((r) => r.workId === made.work.id)?.id as string;
  await f.db.insert(schema.agentQuestions).values({
    orgId: f.org.id,
    runId,
    agentId: f.agent.id,
    channelId: dm.id,
    toolUseId: "tu-1",
    text: "Mando o salário de quem no relatório?",
    expiresAt: new Date(Date.now() + 3600_000),
  });
  await f.db.update(schema.agentRuns).set({ status: "waiting_input" }).where(eq(schema.agentRuns.id, runId));
  const card = async (userId: string) =>
    (await listIssues(f.db, { type: "person", userId }, f.org.id)).find((i) => i.id === w?.issueId);
  expect((await card(f.owner.id))?.backgroundWork?.question?.text).toContain("salário");
  const owner = { type: "person" as const, userId: f.owner.id };
  const shared = await setIssueAudience(deps(), owner, f.org.id, w?.issueId ?? "", { mode: "everyone" });
  expect(shared).toMatchObject({ channelId: null, audience: { mode: "everyone" } });
  expect(await seen(bia.id)).toBe(true);
  expect((await f.db.select().from(schema.issueActivity)).some((a) => a.event === "audience_changed")).toBe(true);
  // The card shows to everyone; what its work asks in the DM stays with who reads the DM.
  expect((await card(bia.id))?.backgroundWork).toMatchObject({ state: "waiting_input", question: null });
});

test("one answer of several: the run stays parked and the work's line goes on to what it still asks", async () => {
  f = await setup();
  const run = await working("@dev roda a migração");
  const { work } = await moved(run);
  const question = (toolUseId: string, text: string) => ({
    orgId: f.org.id,
    runId: run.id,
    agentId: run.agentId,
    channelId: f.general.id,
    toolUseId,
    text,
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const [first] = await f.db.insert(schema.agentQuestions).values(question("tu-1", "Qual ambiente?")).returning();
  await f.db.insert(schema.agentQuestions).values(question("tu-2", "E a janela?"));
  await f.db.update(schema.agentRuns).set({ status: "waiting_input" }).where(eq(schema.agentRuns.id, run.id));
  await answerQuestion(deps(), f.owner.id, f.org.id, first?.id as string, { text: "Produção" });
  const seen: { type: string; work?: { question: { text: string } | null } }[] = [];
  const off = f.pubsub.subscribe(channelTopic(f.general.id), (e) => void seen.push(e as (typeof seen)[number]));
  await drainOutbox(f.db, f.handlers);
  off();
  expect((await runs()).find((r) => r.id === run.id)?.status).toBe("waiting_input");
  expect(seen.find((e) => e.type === "agent.work")?.work?.question?.text).toBe("E a janela?");
  expect((await workView(f.db, f.org.id, work.id))?.question?.text).toBe("E a janela?");
});

const followUpJobs = () => f.db.select().from(schema.outbox).where(eq(schema.outbox.kind, WORK_FOLLOW_UP_JOB));
const followUpNotices = async () =>
  (await messages()).filter((m) => (m.meta.notice as { kind?: string } | undefined)?.kind === "work_follow_up");
type FollowUpInput = { workId: string; runId: string; messageIds: string[] };
const runById = async (id: string) => (await runs()).find((r) => r.id === id);
/** What the work's executor does when it reads its inbox between steps: the message leaves it, a step records it. */
async function readByWork(run: AgentRun, messageId: string) {
  await f.db.update(schema.agentRuns).set({ pendingMessageIds: [] }).where(eq(schema.agentRuns.id, run.id));
  await addRunStep(f.db, run, "context", { steeredMessageIds: [messageId] });
}
const finishRun = async (id: string, set: Partial<AgentRun> = {}) =>
  (
    await f.db
      .update(schema.agentRuns)
      .set({ status: "done", ...set })
      .where(eq(schema.agentRuns.id, id))
      .returning()
  )[0] as AgentRun;
/** A member who writes in #general. */
async function member(name: string) {
  const user = await addMember(f.db, f.org.id, "member", name);
  await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: user.id });
  return user;
}
/** The owner's work running a migration, a person's reply turn in its thread passing their message on to it. */
async function passedOn(body = "depois posta o resumo no #time", by = f.owner.id) {
  const run = await working("@dev roda a migração da cobrança");
  const { work, anchor } = await moved(run, { title: "Migração da cobrança" });
  const reply = await workingAs(by, body, anchor.id);
  expect(await steerWork({ db: f.db }, reply, work.id)).toMatchObject({ ok: true });
  await finishRun(reply.id);
  return { run, work, anchor, reply, asked: reply.triggerMessageId };
}
/** `working`, for another person. */
async function workingAs(userId: string, body: string, threadId?: string): Promise<AgentRun> {
  const before = new Set((await runs()).map((r) => r.id));
  await ask(body, threadId, userId);
  const run = (await runs()).find((r) => !before.has(r.id));
  if (!run) throw new Error("no run started");
  return finishRun(run.id, { status: "running", startedAt: new Date(), heartbeatAt: new Date() });
}
const workIdOf = (req: ModelRequest) => /work_id ([0-9a-f-]{36})/.exec(JSON.stringify(req.system))?.[1] ?? "";
const FOLLOW_UP_HEAD = "While it ran, these messages were passed on to it";
const steerTo = (req: ModelRequest) => ({
  chunks: [],
  toolUses: [{ name: STEER_WORK_TOOL, input: { work_id: workIdOf(req) } }],
});
/** A work run's transcript, for a run ended by hand: what Continuar goes on from. */
const TRANSCRIPT: Record<string, unknown> = {
  system: [],
  messages: [
    { role: "user", content: [{ type: "text", text: "roda a migração" }] },
    { role: "assistant", content: [{ type: "text", text: "Migrando." }] },
  ],
  postedUpTo: 0,
  postedCount: 0,
};
/** The owner's next step, then a second line that joins their reply turn's inbox (not a run's trigger), passed on. */
async function twoPassedOn(anchorId: string, workId: string) {
  const reply = await workingAs(f.owner.id, "depois posta o resumo no #time", anchorId);
  const extra = await ask("e manda o link pro cliente também", anchorId);
  expect((await runById(reply.id))?.pendingMessageIds).toEqual([extra.id]);
  expect(await steerWork({ db: f.db }, (await runById(reply.id)) as AgentRun, workId)).toMatchObject({ delivered: 2 });
  await finishRun(reply.id);
  return [reply.triggerMessageId, extra.id].sort();
}
const jobIds = async () => [...(((await followUpJobs())[0]?.payload.messageIds ?? []) as string[])].sort();
const jobInput = async () => (await followUpJobs())[0]?.payload as FollowUpInput;

test("a work that read what its asker passed on to it gets one run where it reports, that may pass", async () => {
  f = await setup({
    workTools: true,
    toolSources: [createPassToolSource()],
    reply: (req) => {
      const said = lastText(req);
      if (said.includes(FOLLOW_UP_HEAD))
        return { chunks: [], toolUses: [{ name: "pass", input: { reason: "a work já fez" } }] };
      if (said.includes(PASSED_ON_NOTE))
        return { chunks: ["Migração feita, notas escritas e resumo postado no #time."] };
      if (said.includes("posta o resumo")) return steerTo(req);
      if (said.includes("Passed on")) return { chunks: ["Passei para o trabalho: ele faz isso ao terminar."] };
      return { chunks: ["Não sei."] };
    },
  });
  const run = await working("@dev roda a migração da cobrança");
  // Some steps into it: what it reads from now on comes while it works, not with its ask.
  await f.db.update(schema.agentRuns).set({ turns: 1 }).where(eq(schema.agentRuns.id, run.id));
  const { work, anchor } = await moved(run, { title: "Migração da cobrança" });
  // The work's own job is driven by the test: the reply turn runs first.
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  const steering = answerSteering(f, run);
  const asked = await ask("depois escreve as notas da versão e posta o resumo no #time", anchor.id);
  await drainOutbox(f.db, f.handlers);
  steering.close();
  expect((await runById(run.id))?.pendingMessageIds).toEqual([asked.id]);
  expect((await messages()).find((m) => m.id === asked.id)?.meta).toMatchObject({
    steeredWorkIds: [work.id],
    steeredRunIds: [run.id],
  });

  // The work reads it as part of its job, reports home, and its end follows it up once.
  await enqueue(f.db, {
    orgId: f.org.id,
    kind: "agent_run.execute",
    payload: { runId: run.id },
    dedupeKey: `agent_run.execute:${run.id}:again`,
  });
  await drainOutbox(f.db, f.handlers);
  const requests = f.provider.calls.map((c) => lastText(c.request));
  expect(requests.find((r) => r.includes(PASSED_ON_NOTE))).toContain("depois escreve as notas da versão");
  expect((await works())[0]).toMatchObject({ status: "done" });
  expect((await followUpJobs()).map((j) => j.payload)).toEqual([
    { workId: work.id, runId: run.id, messageIds: [asked.id] },
  ]);

  // Where the work reported, for its asker: it read their words and the report, and passed.
  const [notice] = await followUpNotices();
  expect(notice).toMatchObject({ channelId: f.general.id, threadId: null, authorAgentId: f.agent.id });
  expect(notice?.body.length).toBeLessThan(100);
  expect(notice?.meta.notice).toMatchObject({
    refs: { workId: work.id, endRunId: run.id, personId: f.owner.id, title: "Migração da cobrança" },
  });
  const followUp = (await runs()).find((r) => r.triggerMessageId === notice?.id);
  if (!followUp) throw new Error("no follow-up run");
  expect(await runAuthority(f.db, followUp)).toEqual({ kind: "person", personId: f.owner.id });
  const read = requests.find((r) => r.includes(FOLLOW_UP_HEAD)) ?? "";
  expect(read).toContain("Migração da cobrança");
  expect(read).toContain("[ana]: depois escreve as notas da versão");
  expect(read).toContain("didn't say why not");
  expect(read).toContain("says it waits on them, pass");
  expect(followUp).toMatchObject({ status: "done", replyMessageId: null });
  expect((await messages()).filter((m) => m.agentRunId === followUp.id)).toEqual([]);
  // Its job again, as after a lease that ran out: nothing more.
  expect(await followUpWork(deps(), f.org.id, await jobInput())).toEqual([]);
  expect(await followUpNotices()).toHaveLength(1);
});

test("someone else's ask passed on to a work never reaches its turn: it runs after the work, as them, with their own reach", async () => {
  const toPrivate = {
    chunks: [],
    toolUses: [{ name: "post_message", input: { channel: "#diretoria", text: "Resumo." } }],
  };
  f = await setup({
    workTools: true,
    chatTools: true,
    reply: (req) => {
      const said = lastText(req);
      if (said.includes("No channel #diretoria")) return { chunks: ["Não consigo postar no #diretoria por você."] };
      if (said.includes(FOLLOW_UP_HEAD)) return toPrivate;
      if (said.includes("as them, with their own access"))
        return { chunks: ["Combinado: isso roda depois do trabalho, como você."] };
      // Her reply turn passes it on; any other turn that read her ask would just do it, notes and labels or not.
      if (said.includes("#diretoria"))
        return JSON.stringify(req.system).includes("# Your background work here") ? steerTo(req) : toPrivate;
      return { chunks: ["ok"] };
    },
  });
  const diretoria = await createChannel(f.db, f.owner.id, f.org.id, { name: "diretoria", visibility: "private" });
  await addChannelMember(f.db, f.owner.id, f.org.id, diretoria.id, { agentId: f.agent.id });
  const bia = await member("bia");
  const run = await working("@dev roda a migração da cobrança");
  const { work, anchor } = await moved(run, { title: "Migração da cobrança" });
  // The work's own job is driven by the test; its live turn takes whatever reaches its inbox.
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  const reached: SteerMessage[] = [];
  const live = answerSteering(f, run, { take: () => takeInbox(f.db, run.id), workId: () => work.id });
  live.steerable(async (messages) => {
    reached.push(...messages);
    return { status: "accepted", accepted: messages.map((m) => m.uuid) };
  });
  const asked = await ask("depois posta o resumo no #diretoria", anchor.id, bia.id);
  await drainOutbox(f.db, f.handlers);
  live.close();
  // Never the work's: not live, not in its inbox, not its run's message. It waits on the work's anchor.
  expect(reached).toEqual([]);
  expect((await runById(run.id))?.pendingMessageIds).toEqual([]);
  const meta = (await messages()).find((m) => m.id === asked.id)?.meta;
  expect(meta).toMatchObject({ steeredWorkIds: [work.id] });
  expect(meta?.steeredRunIds).toBeUndefined();
  expect((await messages()).find((m) => m.id === anchor.id)?.meta.heldAsks).toEqual([asked.id]);
  // Her reply turn told her so in one line.
  const reply = (await runs()).find((r) => r.triggerMessageId === asked.id);
  expect((await messages()).find((m) => m.agentRunId === reply?.id)?.body).toBe(
    "Combinado: isso roda depois do trabalho, como você.",
  );

  // The work ends: her follow-up runs as her, and can't post where only the owner can.
  await endWork(deps(), await finishRun(run.id), "done");
  await drainOutbox(f.db, f.handlers);
  expect((await messages()).filter((m) => m.channelId === diretoria.id && m.authorType === "agent")).toEqual([]);
  const [notice] = await followUpNotices();
  const followUp = (await runs()).find((r) => r.triggerMessageId === notice?.id) as AgentRun;
  expect(await runAuthority(f.db, followUp)).toEqual({ kind: "person", personId: bia.id });
  const [answer] = (await messages()).filter((m) => m.agentRunId === followUp.id);
  expect(answer?.body).toBe("Não consigo postar no #diretoria por você.");
  expect((await messages()).find((m) => m.id === anchor.id)?.meta.heldAsks).toBeUndefined();
});

test("a follow-up does what the work left undone, as the person who asked, where the work reported", async () => {
  f = await setup({
    workTools: true,
    toolSources: [createPassToolSource()],
    reply: (req) =>
      lastText(req).includes(FOLLOW_UP_HEAD)
        ? { chunks: ["Pronto: o resumo da migração está no #time."] }
        : { chunks: ["?"] },
  });
  const bia = await member("bia");
  const { run, work } = await passedOn("depois posta o resumo no #time", bia.id);
  await endWork(deps(), await finishRun(run.id), "done");
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  await drainOutbox(f.db, f.handlers);
  const [notice] = await followUpNotices();
  const followUp = (await runs()).find((r) => r.triggerMessageId === notice?.id);
  const [answer] = (await messages()).filter((m) => m.agentRunId === followUp?.id);
  expect(answer).toMatchObject({ body: "Pronto: o resumo da migração está no #time.", threadId: null });
  expect(followUp?.replyMessageId).toBe(answer?.id as string);
  expect(await runAuthority(f.db, followUp as AgentRun)).toEqual({ kind: "person", personId: bia.id });
  const read = f.provider.calls.map((c) => lastText(c.request)).find((r) => r.includes(FOLLOW_UP_HEAD)) ?? "";
  expect(read).toContain("Do now what they asked that the work didn't do and didn't say why not");
  expect(work.requestedByUserId).toBe(f.owner.id);
});

test("two people pass asks on to one work: one follow-up each, on their own authority, and no card decided for the other", async () => {
  const isDecision = (req: ModelRequest) => JSON.stringify(req.system).includes("workspace's right hand. ");
  f = await setup({
    workTools: true,
    rightHand: true,
    reply: (req) =>
      isDecision(req)
        ? { chunks: [JSON.stringify({ decision: "approve", reason: "Veio do pedido dela." })] }
        : { chunks: ["ok"] },
  });
  const bia = await member("bia");
  // Bia's ask kept for after the owner's work, the owner's own read by it; only the owner lets the right hand approve.
  const { run, work, anchor, asked } = await passedOn("depois cria uma agente pra triagem do suporte", bia.id);
  const mine = await working("e manda o relatório pro financeiro", anchor.id);
  expect(await steerWork({ db: f.db }, mine, work.id)).toMatchObject({ delivered: 1, kept: [] });
  await finishRun(mine.id);
  await readByWork(run, mine.triggerMessageId);
  await setRightHandApprovals({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, { enabled: true });
  await endWork(deps(), await finishRun(run.id), "done");
  expect(await jobIds()).toEqual([asked, mine.triggerMessageId].sort());
  const input = await jobInput();
  expect(await followUpWork(deps(), f.org.id, input)).toHaveLength(2);
  // Its job again, as after a lease that ran out: nothing more for either.
  expect(await followUpWork(deps(), f.org.id, input)).toEqual([]);
  const notices = await followUpNotices();
  const forPerson = async (personId: string, own: string, other: string) => {
    const notice = notices.find((n) => (n.meta.notice as { refs: { personId: string } }).refs.personId === personId);
    if (!notice) throw new Error(`no follow-up for ${personId}`);
    const text = (notice.meta.notice as { text: string }).text;
    expect(text).toContain(own);
    expect(text).not.toContain(other);
    const run = (await runs()).find((r) => r.triggerMessageId === notice.id) as AgentRun;
    expect(await runAuthority(f.db, run)).toEqual({ kind: "person", personId });
    return run;
  };
  const biaRun = await forPerson(bia.id, "triagem do suporte", "relatório pro financeiro");
  const ownerRun = await forPerson(f.owner.id, "relatório pro financeiro", "triagem do suporte");

  // A card from each follow-up goes to its own person: the right hand decides only the owner's.
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  const tools = createToolGateway({
    sources: [createSetupToolSource({ pubsub: f.pubsub, ai: { gateway: f.gateway } })],
  });
  const propose = async (run: AgentRun, handle: string) => {
    const ctx = {
      db: f.db,
      orgId: f.org.id,
      agentId: f.agent.id,
      runId: run.id,
      channelId: f.general.id,
      threadRootId: run.threadRootId,
      triggerMessageId: run.triggerMessageId,
    };
    const out = await tools.invoke(ctx, {
      toolUseId: `tu_${crypto.randomUUID()}`,
      name: "propose_agent",
      input: {
        name: handle,
        handle,
        role: "Atendimento",
        instructions: "Separa os tickets por prazo.",
        channels: ["#general"],
        why: "Metade dos tickets é dúvida de prazo.",
      },
    });
    if (out.type !== "result" || out.output.isError) throw new Error(JSON.stringify(out));
    return (out.output.data as { agentProposal: { messageId: string } }).agentProposal.messageId;
  };
  const biaCard = await propose(biaRun, "triagem");
  const ownerCard = await propose(ownerRun, "financeiro");
  await drainOutbox(f.db, f.handlers);
  const delegateOf = async (id: string) => {
    const [m] = await f.db.select().from(schema.messages).where(eq(schema.messages.id, id));
    return (agentProposalOf(m?.meta) as AgentProposalCard & { delegate?: CardDelegate | null }).delegate ?? null;
  };
  expect(await delegateOf(biaCard)).toBeNull();
  expect(await delegateOf(ownerCard)).toMatchObject({ state: "approved", forUserId: f.owner.id });
});

test("a work's done end takes what was passed on to it and never read: the follow-up has it, the inbox doesn't", async () => {
  f = await setup({ workTools: true });
  const run = await working("@dev roda a migração da cobrança");
  const { work, anchor } = await moved(run, { title: "Migração da cobrança" });
  const asks = await twoPassedOn(anchor.id, work.id);
  expect([...((await runById(run.id))?.pendingMessageIds ?? [])].sort()).toEqual(asks);
  const ended = await finishRun(run.id);
  await endWork(deps(), ended, "done");
  expect(await jobIds()).toEqual(asks);
  expect((await runById(run.id))?.pendingMessageIds).toEqual([]);
  // The second line started no run: had it stayed in the inbox, the release would hand it on.
  expect(await releaseInbox(f.db, f.pubsub, ended, { reason: "done" })).toBeNull();
});

test("a work that ends at its step cap keeps what its asker passed on to it and it never read, for Continuar", async () => {
  f = await setup({
    workTools: true,
    reply: (req) => (lastText(req).includes("posta o resumo") ? steerTo(req) : { chunks: ["Passei para o trabalho."] }),
  });
  const run = await working("@dev roda a migração da cobrança");
  await f.db.update(schema.agentRuns).set({ turns: 1 }).where(eq(schema.agentRuns.id, run.id));
  const { anchor } = await moved(run, { title: "Migração" });
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  const steering = answerSteering(f, run);
  const asked = await ask("depois posta o resumo no #time", anchor.id);
  await drainOutbox(f.db, f.handlers);
  steering.close();
  // Its next step is past its cap: it ends there, its inbox unread. The reply turn's own message can't start a run.
  await f.db.update(schema.agentRuns).set({ turns: 200 }).where(eq(schema.agentRuns.id, run.id));
  await enqueue(f.db, {
    orgId: f.org.id,
    kind: "agent_run.execute",
    payload: { runId: run.id },
    dedupeKey: `agent_run.execute:${run.id}:again`,
  });
  await drainOutbox(f.db, f.handlers);
  expect((await works())[0]?.status).toBe("failed");
  expect(await followUpJobs()).toEqual([]);
  const stopped = await runById(run.id);
  expect(stopped?.pendingMessageIds).toEqual([]);
  expect(stopped?.transcript?.unreadAsks).toEqual([asked.id]);

  const continued = await continueRun(deps(), f.owner.id, f.org.id, run.id);
  expect((await runById(continued.runId))?.pendingMessageIds).toEqual([asked.id]);
});

test("a failed work's asks go on with Continuar, and its done end then follows them all up once", async () => {
  f = await setup({ workTools: true });
  const { run, work, anchor, asked } = await passedOn();
  await readByWork(run, asked);
  const failed = await finishRun(run.id, {
    status: "failed",
    error: "provider_error: down@Claude: overloaded",
    transcript: TRANSCRIPT,
  });
  expect((await endWork(deps(), failed, "failed"))?.status).toBe("failed");
  // No follow-up beside Continuar: the run that goes on has what it read.
  expect(await followUpJobs()).toEqual([]);
  const { runId } = await continueRun(deps(), f.owner.id, f.org.id, run.id);
  const next = (await runById(runId)) as AgentRun;
  expect(next.workId).toBe(work.id);

  const later = await working("e no fim manda o link do relatório", anchor.id);
  expect(await steerWork({ db: f.db }, later, work.id)).toMatchObject({ delivered: 1 });
  await finishRun(later.id);
  await readByWork(next, later.triggerMessageId);
  await endWork(deps(), await finishRun(next.id), "done");
  expect(await followUpJobs()).toHaveLength(1);
  expect(await jobIds()).toEqual([asked, later.triggerMessageId].sort());
});

test("a failed work Continuar can go on from: someone else's ask is followed up now, its asker's only while they can post", async () => {
  f = await setup({ workTools: true });
  const bia = await member("bia");
  // Bia's work: her own next step unread in its inbox, and the owner's ask kept for after it.
  const run = await workingAs(bia.id, "@dev roda a migração da cobrança");
  const { work, anchor } = await moved(run, { title: "Migração da cobrança" });
  expect(work.requestedByUserId).toBe(bia.id);
  const hers = await workingAs(bia.id, "depois posta o resumo no #time", anchor.id);
  expect(await steerWork({ db: f.db }, hers, work.id)).toMatchObject({ delivered: 1, kept: [] });
  await finishRun(hers.id);
  const mine = await working("e manda o relatório pro financeiro", anchor.id);
  expect(await steerWork({ db: f.db }, mine, work.id)).toMatchObject({ delivered: 0, kept: ["ana"] });
  await finishRun(mine.id);
  const failed = await finishRun(run.id, {
    status: "failed",
    error: "provider_error: down@Claude: overloaded",
    transcript: TRANSCRIPT,
  });
  expect((await endWork(deps(), failed, "failed"))?.status).toBe("failed");
  expect(await jobIds()).toEqual([mine.triggerMessageId]);
  expect((await runById(run.id))?.transcript?.unreadAsks).toEqual([hers.triggerMessageId]);
  await removeChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: bia.id });
  const { runId } = await continueRun(deps(), f.owner.id, f.org.id, run.id);
  expect((await runById(runId))?.pendingMessageIds).toEqual([]);
});

test("a long message passed on is quoted cut, and the notice carries a short body", async () => {
  f = await setup({ workTools: true });
  const { run, asked } = await passedOn(`depois posta isto no #time: ${"x".repeat(39_960)}`);
  await readByWork(run, asked);
  await endWork(deps(), await finishRun(run.id), "done");
  const [notice] = await followUpWork(deps(), f.org.id, await jobInput());
  if (!notice) throw new Error("no follow-up");
  expect(notice.body.length).toBeLessThan(100);
  const text = (notice.meta.notice as { text: string }).text;
  expect(text).toStartWith("[ana]: depois posta isto no #time: xxx");
  expect(text.length).toBeLessThan(4100);
});

test("a work nobody passed anything on to gets no follow-up, at its end or at a stop", async () => {
  f = await setup({ workTools: true });
  const quiet = await working("@dev gera o relatório");
  await moved(quiet, { title: "Relatório" });
  expect(await endWork(deps(), await finishRun(quiet.id), "done")).not.toBeNull();
  const stopped = await working("@dev gera o relatório de churn");
  await moved(stopped, { title: "Churn" });
  await cancelRun(deps(), f.owner.id, f.org.id, stopped.id);
  expect((await works()).map((w) => w.status)).toEqual(["done", "canceled"]);
  expect(await followUpJobs()).toEqual([]);
});

test("a message passed on to one work reads as part of the job only in that work", async () => {
  f = await setup({ workTools: true });
  const { work, asked } = await passedOn();
  const other = await working("@dev gera o relatório de churn");
  const { work: second } = await moved(other, { title: "Churn" });
  const [mine] = await renderSteered(f.db, f.org.id, [asked], { workId: work.id });
  expect(mine?.text).toContain("passed on to your background work");
  expect(mine?.text).toContain(PASSED_ON_NOTE);
  for (const workId of [second.id, null]) {
    const [plain] = await renderSteered(f.db, f.org.id, [asked], { workId });
    expect(plain?.text).toStartWith("[New message from ana, while you were working]: depois posta o resumo");
    expect(plain?.text).not.toContain(PASSED_ON_NOTE);
  }
});

test("live, the work's turn gets its asker's passed-on message as part of its job, and nobody else's", async () => {
  f = await setup({ workTools: true });
  const bia = await member("bia");
  const { run, work, anchor, asked } = await passedOn();
  const hers = await workingAs(bia.id, "e inclui os gráficos também", anchor.id);
  expect(await steerWork({ db: f.db }, hers, work.id)).toMatchObject({ delivered: 0, kept: ["bia"] });
  const turn = async (hooks: Parameters<typeof answerSteering>[2]) => {
    const got: SteerMessage[] = [];
    const live = answerSteering(f, run, { take: () => takeInbox(f.db, run.id), ...hooks });
    live.steerable(async (messages) => {
      got.push(...messages);
      return { status: "accepted", accepted: messages.map((m) => m.uuid) };
    });
    for (let i = 0; i < 200 && got.length === 0; i++) await Bun.sleep(10);
    live.close();
    return got;
  };
  const [own, ...rest] = await turn({ workId: () => work.id });
  expect(rest).toEqual([]);
  expect(own?.text).toContain("depois posta o resumo");
  expect(own?.text).toContain(PASSED_ON_NOTE);
  // The hook names the work it reads for: without it, the same message is a plain line.
  await finishRun(run.id, { status: "running", pendingMessageIds: [asked] });
  const [plain] = await turn({});
  expect(plain?.text).toStartWith("[New message from ana, while you were working]: depois posta o resumo");
});

test("a work its brain cut off, which Continuar can't pick up: what was passed on to it is followed up, unread too", async () => {
  f = await setup({ workTools: true });
  const run = await working("@dev roda a migração da cobrança");
  await finishRun(run.id, { status: "running", transcript: TRANSCRIPT });
  const { work, anchor } = await moved(run, { title: "Migração da cobrança" });
  const asks = await twoPassedOn(anchor.id, work.id);
  // Its own line home: its brain stopped before finishing, so the work didn't finish.
  const end = await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: f.general.id,
    threadId: work.homeThreadId,
    author: { type: "agent", agentId: f.agent.id, runId: run.id, hop: run.hop },
    body: "_Claude Code stopped before finishing._",
    meta: {
      brainInterrupted: { brain: "claude_code", code: "crashed", message: "it crashed", text: "", tools: [] },
      workEnd: { id: work.id, status: "failed", errorCode: "run.brain_interrupted" },
    },
  });
  const ended = await finishRun(run.id, { replyMessageId: end.id });
  expect((await endWork(deps(), ended, "done"))?.status).toBe("failed");
  await expect(continueRun(deps(), f.owner.id, f.org.id, run.id)).rejects.toMatchObject({
    code: "run.not_continuable",
  });
  expect(await jobIds()).toEqual(asks);
  expect(await releaseInbox(f.db, f.pubsub, ended, { reason: "done" })).toBeNull();
  const notices = await followUpWork(deps(), f.org.id, await jobInput());
  expect(notices.map((n) => (n.meta.notice as { refs: { personId: string } }).refs.personId)).toEqual([f.owner.id]);
});

test("a restart that cuts a tool mid-work: what was passed on to it, read or not, is followed up before its inbox goes", async () => {
  f = await setup({ workTools: true });
  const run = await working("@dev roda a migração da cobrança");
  await finishRun(run.id, { status: "running", transcript: TRANSCRIPT });
  const { work, anchor } = await moved(run, { title: "Migração da cobrança" });
  const first = await workingAs(f.owner.id, "depois posta o resumo no #time", anchor.id);
  expect(await steerWork({ db: f.db }, first, work.id)).toMatchObject({ delivered: 1 });
  await finishRun(first.id);
  await readByWork(run, first.triggerMessageId);
  // The second one is still in its inbox: a reply turn's own message, which the release can't hand on.
  const second = await workingAs(f.owner.id, "e manda o link pro cliente", anchor.id);
  expect(await steerWork({ db: f.db }, second, work.id)).toMatchObject({ delivered: 1 });
  await finishRun(second.id);
  await addRunStep(f.db, run, "tool_call", { toolUseId: "tu_cut", name: "run_command" });
  await finishRun(run.id, { status: "running", heartbeatAt: new Date(Date.now() - 10 * 60_000) });
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  await recoverStaleRuns(deps());
  expect((await works())[0]?.status).toBe("failed");
  expect(await jobIds()).toEqual([first.triggerMessageId, second.triggerMessageId].sort());
  expect((await runById(run.id))?.pendingMessageIds).toEqual([]);
});

test("a work held by an approval keeps what was passed on to it; the rest of its inbox is handed on", async () => {
  f = await setup({ workTools: true });
  const { run, work, anchor, asked } = await passedOn();
  const other = await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: f.general.id,
    threadId: anchor.id,
    author: { type: "person", userId: f.owner.id },
    body: "@dev e o staging?",
  });
  await finishRun(run.id, { status: "waiting_approval", pendingMessageIds: [asked, other.id] });
  const handed = await releaseHeldInbox(f.db, f.pubsub, run.id);
  expect(handed?.messageIds).toEqual([other.id]);
  expect((await runById(run.id))?.pendingMessageIds).toEqual([asked]);
  // Approved, it ends done without reading it: its end follows it up.
  await endWork(deps(), await finishRun(run.id), "done");
  expect(await jobIds()).toEqual([asked]);
  expect((await jobInput()).workId).toBe(work.id);
});

test("a run sent on to another channel still counts someone else's words in it as theirs", async () => {
  f = await setup({ workTools: true });
  const bia = await member("bia");
  const run = await working("@dev roda a migração da cobrança");
  // Her message joined it while it worked.
  await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: f.general.id,
    threadId: run.triggerMessageId,
    author: { type: "person", userId: bia.id },
    body: "e inclui os gráficos",
    meta: { steeredRunIds: [run.id] },
  });
  expect(await steeredByOthers(f.db, f.org.id, f.owner.id, [run.id])).toBe(true);
  const ops = await createChannel(f.db, f.owner.id, f.org.id, { name: "ops" });
  await addChannelMember(f.db, f.owner.id, f.org.id, ops.id, { agentId: f.agent.id });
  const to = await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: ops.id,
    author: { type: "agent", agentId: f.agent.id, runId: run.id, hop: run.hop },
    body: "Sigo aqui com a migração.",
  });
  await moveRun(deps(), (await runById(run.id)) as AgentRun, to);
  expect((await runById(run.id))?.channelId).toBe(ops.id);
  expect(await steeredByOthers(f.db, f.org.id, f.owner.id, [run.id])).toBe(true);
});

test("nothing else hands someone else's message to a work: a wait on help, the inbox sweeper, a catch-up, a resume", async () => {
  f = await setup({ workTools: true });
  const bia = await member("bia");
  const run = await working("@dev entra no painel");
  const { work, anchor } = await moved(run, { title: "Painel" });
  // Waiting on a person's help, it takes its asker's message, not hers: she gets a reply turn of her own.
  await finishRun(run.id, { status: "waiting_input" });
  const hers = await ask("aproveita e posta o resumo no #time", anchor.id, bia.id);
  expect((await runById(run.id))?.pendingMessageIds).toEqual([]);
  const herRun = (await runs()).find((r) => r.triggerMessageId === hers.id);
  if (!herRun) throw new Error("no reply turn of hers");
  await finishRun(herRun.id);
  const mine = await ask("pronto, loguei", anchor.id);
  expect((await runById(run.id))?.pendingMessageIds).toEqual([mine.id]);
  // A message of hers left in an ended run's inbox, swept, gets a run of its own, not the work.
  const left = await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: f.general.id,
    threadId: anchor.id,
    author: { type: "person", userId: bia.id },
    body: "e manda a planilha da folha pro meu email",
  });
  await finishRun(herRun.id, { pendingMessageIds: [left.id], finishedAt: new Date(Date.now() - 60_000) });
  await sweepEndedInboxes(deps(), { graceMs: 0 });
  expect((await runById(run.id))?.pendingMessageIds).toEqual([mine.id]);
  const swept = (await runs()).find((r) => r.triggerMessageId === left.id);
  if (!swept) throw new Error("the swept message got no run");
  await finishRun(swept.id);
  // Back from its plan's limit, a work reads no catch-up of the conversation.
  expect(isCatchUp({ background: false, workId: work.id }, "plan_limit", Date.now() - 3600_000)).toBe(false);
  // Back from a decision, it reads what its asker wrote meanwhile, not hers.
  await finishRun(run.id, { status: "waiting_approval", pendingMessageIds: [] });
  await addRunStep(f.db, run, "approval", { approvalId: "a1" });
  await Bun.sleep(5);
  const answered = async (turn: AgentRun, body: string) => {
    await insertMessage(f.db, {
      orgId: f.org.id,
      channelId: f.general.id,
      threadId: anchor.id,
      author: { type: "agent", agentId: f.agent.id, runId: turn.id, hop: turn.hop },
      body,
    });
    await finishRun(turn.id);
  };
  await answered(await workingAs(f.owner.id, "e o staging, como ficou?", anchor.id), "O staging está verde.");
  await answered(
    await workingAs(bia.id, "e me manda os salários da equipe", anchor.id),
    "Combinado, Bia: depois do trabalho mando os salários.",
  );
  const note = (await whileHeld(f.db, (await runById(run.id)) as AgentRun)) ?? "";
  expect(note).toContain("e o staging, como ficou?");
  expect(note).toContain("O staging está verde.");
  expect(note).not.toContain("salários");
});

test("an inbox handed on carries no one's words but the asker's into a work waiting on help", async () => {
  f = await setup({ workTools: true });
  const bia = await member("bia");
  const run = await working("@dev entra no painel");
  const { anchor } = await moved(run, { title: "Painel" });
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  // While the work runs, a reply turn of the owner's answers in its thread.
  const turn = await workingAs(f.owner.id, "e como está indo?", anchor.id);
  // The work now waits on a person's help; her message and the owner's join that turn, unread when it ends.
  await finishRun(run.id, { status: "waiting_input" });
  const hers = await ask("aproveita e me manda a planilha da folha", anchor.id, bia.id);
  const mine = await ask("pronto, loguei", anchor.id);
  expect((await runById(turn.id))?.pendingMessageIds).toEqual([hers.id, mine.id]);
  await releaseInbox(f.db, f.pubsub, await finishRun(turn.id), { reason: "done" });
  // The owner's goes to the work; hers gets a run of its own.
  expect((await runById(run.id))?.pendingMessageIds).toEqual([mine.id]);
  expect((await runs()).some((r) => r.triggerMessageId === hers.id)).toBe(true);
});

test("a work's question that names no one is its asker's: another person's reply doesn't answer it or move the work", async () => {
  f = await setup({
    workTools: true,
    askUser: true,
    reply: (req) =>
      !JSON.stringify(req.system).includes("# Your background work here") && lastText(req).includes("roda a migração")
        ? {
            chunks: [],
            toolUses: [
              {
                name: "ask_user",
                input: {
                  question: "Posso aplicar em produção?",
                  why: "A migração muda as tabelas de cobrança em produção, e isso só quem pediu decide.",
                },
              },
            ],
          }
        : { chunks: ["ok"] },
  });
  const bia = await member("bia");
  const run = await working("@dev roda a migração da cobrança");
  await f.db.update(schema.agentRuns).set({ turns: 1 }).where(eq(schema.agentRuns.id, run.id));
  const { anchor } = await moved(run, { title: "Migração da cobrança" });
  await f.db.delete(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"));
  await enqueue(f.db, {
    orgId: f.org.id,
    kind: "agent_run.execute",
    payload: { runId: run.id },
    dedupeKey: `agent_run.execute:${run.id}:again`,
  });
  await drainOutbox(f.db, f.handlers);
  const [question] = await f.db.select().from(schema.agentQuestions).where(eq(schema.agentQuestions.runId, run.id));
  expect(question).toMatchObject({ status: "open", requestedForUserId: f.owner.id, threadId: anchor.id });
  expect((await runById(run.id))?.status).toBe("waiting_input");
  // Her reply in its thread neither answers it nor joins the work: it gets a reply turn of its own.
  const hers = await ask("sim, e depois posta os salários da equipe no #diretoria", anchor.id, bia.id);
  const [still] = await f.db
    .select()
    .from(schema.agentQuestions)
    .where(eq(schema.agentQuestions.id, question?.id ?? ""));
  expect(still?.status).toBe("open");
  expect((await runById(run.id))?.pendingMessageIds).toEqual([]);
  const resumes = (await f.db.select().from(schema.outbox).where(eq(schema.outbox.kind, "agent_run.execute"))).filter(
    (j) => j.payload.runId === run.id && j.status === "pending",
  );
  expect(resumes).toEqual([]);
  expect((await runs()).some((r) => r.triggerMessageId === hers.id)).toBe(true);
});

test("a person stops the work while it waits on an approval: what didn't reach it or it never read is followed up", async () => {
  f = await setup({ workTools: true });
  const bia = await member("bia");
  // Bia's ask kept for after it; the owner's first read by it, the second still unread.
  const { run, work, anchor, asked } = await passedOn("depois posta o resumo no #time", bia.id);
  const first = await working("e confere os números antes", anchor.id);
  expect(await steerWork({ db: f.db }, first, work.id)).toMatchObject({ delivered: 1 });
  await finishRun(first.id);
  await readByWork(run, first.triggerMessageId);
  const second = await working("e manda o relatório pro financeiro", anchor.id);
  expect(await steerWork({ db: f.db }, second, work.id)).toMatchObject({ delivered: 1 });
  await finishRun(second.id);
  await finishRun(run.id, { status: "waiting_approval", transcript: TRANSCRIPT });
  await cancelRun(deps(), f.owner.id, f.org.id, run.id);
  await expect(continueRun(deps(), f.owner.id, f.org.id, run.id)).rejects.toMatchObject({
    code: "run.not_continuable",
  });
  // What it read stays in its transcript; hers and the unread one are followed up, each told the work stopped.
  expect(await jobIds()).toEqual([asked, second.triggerMessageId].sort());
  const notices = await followUpWork(deps(), f.org.id, { ...(await jobInput()), stopped: true });
  expect(notices.map((n) => (n.meta.notice as { refs: { personId: string } }).refs.personId).sort()).toEqual(
    [bia.id, f.owner.id].sort(),
  );
  for (const n of notices) {
    expect(n.meta.notice).toMatchObject({ refs: { stopped: "1" } });
    expect(noticeText(n.meta, true)).toContain("was stopped by a person");
    expect(noticeText(n.meta, true)).toContain("Do now what still makes sense of what they asked");
  }
  expect((await followUpJobs())[0]?.payload.stopped).toBe(true);
  expect((await messages()).find((m) => m.id === anchor.id)?.meta.heldAsks).toBeUndefined();
});

test("a work sent on to a channel she isn't in: her follow-up comes where she asked, without what it found there", async () => {
  f = await setup({ workTools: true });
  const bia = await member("bia");
  const { run, anchor } = await passedOn("depois posta o resumo no #time", bia.id);
  const ops = await createChannel(f.db, f.owner.id, f.org.id, { name: "ops" });
  await addChannelMember(f.db, f.owner.id, f.org.id, ops.id, { agentId: f.agent.id });
  const to = await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: ops.id,
    author: { type: "agent", agentId: f.agent.id, runId: run.id, hop: run.hop },
    body: "Sigo aqui com a migração.",
  });
  await moveRun(deps(), (await runById(run.id)) as AgentRun, to);
  await endWork(deps(), await finishRun(run.id), "done");
  const [notice] = await followUpWork(deps(), f.org.id, await jobInput());
  expect(notice).toMatchObject({ channelId: f.general.id, threadId: anchor.id });
  expect(notice?.meta.notice).toMatchObject({ refs: { personId: bia.id, away: "1" } });
  expect(noticeText(notice?.meta, true)).toContain("Don't pass on what it did or found there.");
  expect(await runAuthority(f.db, (await runs()).find((r) => r.triggerMessageId === notice?.id) as AgentRun)).toEqual({
    kind: "person",
    personId: bia.id,
  });
  // Its job again finds it there.
  expect(await followUpWork(deps(), f.org.id, await jobInput())).toEqual([]);
});

test("an answer that comes after the work reported is read and answered home, not in the work's thread", async () => {
  f = await setup({ reply: () => ({ chunks: ["Chegou: aqui está o resultado."] }) });
  const run = await working("@dev monta o relatório com a ajuda do time");
  const { work, anchor } = await moved(run);
  const answer = { kind: "consult_reply" as const, text: "Os números do mês.", from: "@dados" };

  // While the work is on, what comes for it lands in its own thread.
  const during = await f.db.transaction((tx) => deliverNoticeToRun(tx, { ...run, threadRootId: anchor.id }, answer));
  expect(during.message.threadId).toBe(anchor.id);

  // It reported and ended with a question still out: the answer wakes the agent in the conversation.
  const ended = await finishRun(run.id);
  await endWork(deps(), ended, "done");
  expect((await works()).find((w) => w.id === work.id)?.status).toBe("done");
  const after = await f.db.transaction((tx) => deliverNoticeToRun(tx, ended, answer));
  expect(after.message.channelId).toBe(f.general.id);
  expect(after.message.threadId).toBeNull();
  await drainOutbox(f.db, f.handlers);
  const woken = (await runs()).find((r) => r.triggerMessageId === after.message.id);
  expect(woken?.status).toBe("done");
  const said = (await messages()).find((m) => m.agentRunId === woken?.id);
  expect(said?.body).toBe("Chegou: aqui está o resultado.");
  expect(said?.threadId).toBeNull();
});
