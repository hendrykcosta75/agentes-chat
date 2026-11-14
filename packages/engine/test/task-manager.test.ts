import { afterEach, describe, expect, test } from "bun:test";
import { countQueries, eq, schema, sql } from "@agenteschat/db";
import {
  addChannelMember,
  addRunStep,
  cancelRun,
  continuePausedRuns,
  createAgent,
  drainOutbox,
  ForbiddenError,
  insertMessage,
  listMessages,
  type Membership,
  mayContinuePause,
  NotFoundError,
  openPersonAgentDm,
  postPersonMessage,
  sendNote,
  setStopReason,
  taskManager,
  taskSteps,
  ValidationError,
} from "../src";
import { addMember, type Fixture, setup } from "./fixtures";

let f: Fixture;
afterEach(async () => {
  const current = f;
  f = undefined as unknown as Fixture;
  await current?.close();
});

const deps = () => ({ db: f.db, pubsub: f.pubsub });
const ask = (body: string) =>
  postPersonMessage({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, f.general.id, { body });
const runs = () => f.db.select().from(schema.agentRuns);
const stoppedNotices = async () =>
  (await listMessages(f.db, f.owner.id, f.org.id, f.general.id)).filter(
    (m) => (m.meta as { notice?: { kind?: string } }).notice?.kind === "run_stopped",
  );

describe("work agents asked of each other (ADR 0128)", () => {
  /** @dev, in #general, asked @infra in their private conversation; @infra's run is at work there. */
  async function delegated() {
    const infra = await createAgent(
      f.db,
      f.owner.id,
      f.org.id,
      { name: "Infra", handle: "infra", role: "Servers", instructions: "You run them.", credentialId: f.credential.id },
      { model: "claude-sonnet-5-5" },
    );
    await ask("@dev olha os bugs");
    const [asker] = await runs();
    if (!asker) throw new Error("no run");
    const sent = await sendNote(f.db, {
      orgId: f.org.id,
      agentId: f.agent.id,
      runId: asker.id,
      hop: 1,
      targetAgentId: infra.id,
      body: "Vê o log de ontem",
      chain: [f.agent.id],
    });
    if (!sent) throw new Error("not sent");
    const helper = (await runs()).find((r) => r.agentId === infra.id);
    if (!helper) throw new Error("no helper run");
    await f.db.update(schema.agentRuns).set({ status: "running" });
    return { infra, asker, helper };
  }

  test("admins and the agent's owner see it, with who asked and what started it; others only count it", async () => {
    f = await setup();
    const { infra, asker, helper } = await delegated();

    const view = await taskManager(f.db, f.owner.id, f.org.id);
    const row = view.tasks.find((t) => t.runId === helper.id);
    expect(row).toMatchObject({
      agentId: infra.id,
      channelKind: "dm",
      betweenAgents: true,
      label: null,
      canStop: true,
      delegation: { agentId: f.agent.id, origin: { kind: "person", userId: f.owner.id } },
      subject: "Vê o log de ontem",
    });
    expect(view.tasks.find((t) => t.runId === asker.id)).toMatchObject({ delegation: null, helpers: 1, subject: null });
    expect(view.hidden).toEqual({ total: 0, working: 0, byAgent: {} });
    expect((await taskSteps(f.db, f.owner.id, f.org.id, helper.id)).steps).toEqual([]);

    const member = await addMember(f.db, f.org.id, "member", "bia");
    const theirs = await taskManager(f.db, member.id, f.org.id);
    expect(theirs.tasks.find((t) => t.runId === helper.id)).toBeUndefined();
    expect(theirs.hidden.byAgent[infra.id]).toBe(1);
    expect(theirs.hidden.total).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(theirs)).not.toContain("Vê o log");
    await expect(taskSteps(f.db, member.id, f.org.id, helper.id)).rejects.toBeInstanceOf(NotFoundError);

    // Its owner sees it without admin rights, but not what was asked: they don't read #general.
    await f.db.update(schema.agents).set({ ownerUserId: member.id }).where(eq(schema.agents.id, infra.id));
    const owners = await taskManager(f.db, member.id, f.org.id);
    expect(owners.tasks.find((t) => t.runId === helper.id)).toMatchObject({
      delegation: { from: null },
      subject: null,
    });
    expect(JSON.stringify(owners)).not.toContain("Vê o log");
  });

  test("an admin who doesn't read the conversation it came from sees the task, never what was asked", async () => {
    f = await setup();
    const infra = await createAgent(
      f.db,
      f.owner.id,
      f.org.id,
      { name: "Infra", handle: "infra", role: "Servers", instructions: "You run them.", credentialId: f.credential.id },
      { model: "claude-sonnet-5-5" },
    );
    const dm = await openPersonAgentDm(f.db, f.org.id, f.owner.id, f.agent.id);
    await postPersonMessage(deps(), f.owner.id, f.org.id, dm.id, { body: "olha os bugs" });
    const asker = (await runs()).find((r) => r.agentId === f.agent.id);
    if (!asker) throw new Error("no run");
    await sendNote(f.db, {
      orgId: f.org.id,
      agentId: f.agent.id,
      runId: asker.id,
      hop: 1,
      targetAgentId: infra.id,
      body: "Vê o log do meu cliente",
      chain: [f.agent.id],
    });
    const helper = (await runs()).find((r) => r.agentId === infra.id);
    if (!helper) throw new Error("no helper run");
    await f.db.update(schema.agentRuns).set({ status: "running" });

    expect((await taskManager(f.db, f.owner.id, f.org.id)).tasks.find((t) => t.runId === helper.id)?.subject).toBe(
      "Vê o log do meu cliente",
    );
    const rui = await addMember(f.db, f.org.id, "admin", "rui");
    const theirs = await taskManager(f.db, rui.id, f.org.id);
    expect(theirs.tasks.find((t) => t.runId === helper.id)).toMatchObject({
      delegation: { from: null },
      subject: null,
    });
    expect(JSON.stringify(theirs)).not.toContain("meu cliente");
  });

  test("called by the latest question its run took, one sentence of it", async () => {
    f = await setup();
    const { helper } = await delegated();
    const [first] = await f.db
      .select()
      .from(schema.agentConsultations)
      .where(eq(schema.agentConsultations.targetRunId, helper.id));
    if (!first) throw new Error("no consultation");
    const question = "Agora veja a fila.\n\nDepois me diga quem ficou sem resposta.";
    const message = await insertMessage(f.db, {
      orgId: f.org.id,
      channelId: first.channelId,
      author: { type: "agent", agentId: first.askerAgentId, runId: first.askerRunId, hop: 1 },
      body: question,
    });
    const { id: _id, ...rest } = first;
    await f.db.insert(schema.agentConsultations).values({
      ...rest,
      messageId: message.id,
      waitId: `${first.waitId}-2`,
      question,
      createdAt: new Date(first.createdAt.getTime() + 60_000),
    });
    const row = (await taskManager(f.db, f.owner.id, f.org.id)).tasks.find((t) => t.runId === helper.id);
    expect(row?.subject).toBe("Agora veja a fila.");
  });

  test("hidden work asking its computer from the line counts as waiting, not working", async () => {
    f = await setup();
    const { infra, helper } = await delegated();
    const [machine] = await f.db.insert(schema.machines).values({ orgId: f.org.id, name: "Mac" }).returning();
    const member = await addMember(f.db, f.org.id, "member", "bia");
    const hide = (waitingMachineId: string | null) =>
      f.db
        .update(schema.agentRuns)
        .set({ status: "running", waitingMachineId })
        .where(eq(schema.agentRuns.id, helper.id));

    await hide(machine?.id ?? null);
    const asking = (await taskManager(f.db, member.id, f.org.id)).hidden;
    expect(asking.byAgent[infra.id]).toBe(1);
    await hide(null);
    const working = (await taskManager(f.db, member.id, f.org.id)).hidden;
    expect(working.working).toBe(asking.working + 1);
  });

  test("a note no run took yet counts as a helper: a stop takes its wake too", async () => {
    f = await setup();
    const { infra, asker } = await delegated();
    await sendNote(f.db, {
      orgId: f.org.id,
      agentId: f.agent.id,
      runId: asker.id,
      hop: 1,
      targetAgentId: infra.id,
      body: "Vê a fila também",
      chain: [f.agent.id],
      deferStart: true,
    });
    const view = await taskManager(f.db, f.owner.id, f.org.id);
    expect(view.tasks.find((t) => t.runId === asker.id)?.helpers).toBe(2);
  });

  test("an agent with no owner: its work still counts for who may not see it", async () => {
    f = await setup();
    const { infra, helper } = await delegated();
    await f.db.update(schema.agents).set({ ownerUserId: null }).where(eq(schema.agents.id, infra.id));
    const member = await addMember(f.db, f.org.id, "member", "bia");
    const theirs = await taskManager(f.db, member.id, f.org.id);
    expect(theirs.tasks.find((t) => t.runId === helper.id)).toBeUndefined();
    expect(theirs.hidden.byAgent[infra.id]).toBe(1);
  });

  test("the chain of a routine says the routine; what ended there stays listed for who sees it", async () => {
    f = await setup();
    const { helper } = await delegated();
    await f.db
      .update(schema.agentRuns)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(schema.agentRuns.id, helper.id));
    const view = await taskManager(f.db, f.owner.id, f.org.id);
    expect(view.ended.find((e) => e.runId === helper.id)).toMatchObject({ betweenAgents: true, status: "done" });
  });
});

describe("stopping a task tells the agent (ADR 0128)", () => {
  test("a notice in that conversation, with the reason, which wakes nothing; the next turn reads it", async () => {
    f = await setup({ reply: () => ({ chunks: ["Ok."] }) });
    await ask("@dev prepara o relatório de vendas");
    const [run] = await runs();
    await cancelRun(deps(), f.owner.id, f.org.id, run?.id ?? "", { reason: "já fiz eu mesma" });

    const [notice] = await stoppedNotices();
    expect(notice?.meta).toMatchObject({
      notice: { kind: "run_stopped", refs: { runId: run?.id, byUserId: f.owner.id, reason: "já fiz eu mesma" } },
    });
    // Stopping means stop: the notice started no run.
    expect(await runs()).toHaveLength(1);
    await drainOutbox(f.db, f.handlers);
    expect(f.provider.calls).toHaveLength(0);

    // The agent's next turn there reads it, as an event.
    await ask("@dev e agora, tudo certo?");
    await drainOutbox(f.db, f.handlers);
    const sent = JSON.stringify(f.provider.calls.at(-1)?.request.messages);
    expect(sent).toContain("A person stopped your task");
    expect(sent).toContain("já fiz eu mesma");
  });

  test("stopped while it asked its computer from the line, it waited: it wasn't working yet", async () => {
    f = await setup();
    await ask("@dev prepara o relatório de vendas");
    const [run] = await runs();
    const [machine] = await f.db.insert(schema.machines).values({ orgId: f.org.id, name: "Mac" }).returning();
    await f.db
      .update(schema.agentRuns)
      .set({ status: "running", waitingMachineId: machine?.id })
      .where(eq(schema.agentRuns.id, run?.id ?? ""));
    await cancelRun(deps(), f.owner.id, f.org.id, run?.id ?? "");
    const [notice] = await stoppedNotices();
    expect(notice?.meta).toMatchObject({ notice: { refs: { was: "waiting" } } });
  });

  test("the reason said later: only who stopped it, once", async () => {
    f = await setup();
    await ask("@dev revisa o contrato");
    const [run] = await runs();
    await cancelRun(deps(), f.owner.id, f.org.id, run?.id ?? "");
    expect((await stoppedNotices())[0]?.meta).toMatchObject({ notice: { refs: { runId: run?.id } } });

    const other = await addMember(f.db, f.org.id, "admin", "bia");
    await expect(setStopReason(deps(), other.id, f.org.id, run?.id ?? "", "não")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await setStopReason(deps(), f.owner.id, f.org.id, run?.id ?? "", "o cliente desistiu");
    const [notice] = await stoppedNotices();
    expect((notice?.meta as { notice?: { text?: string } } | undefined)?.notice?.text).toContain("o cliente desistiu");
    await expect(setStopReason(deps(), f.owner.id, f.org.id, run?.id ?? "", "de novo")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("why a task waits", () => {
  /** Parks a run as the executor does: its wait in the transcript, how far a pause got on its step. */
  const park = async (runId: string, wait: Record<string, unknown>, pause?: Record<string, unknown>) => {
    await f.db
      .update(schema.agentRuns)
      .set({
        status: "waiting_input",
        transcript: { waitingForBrain: { kind: "claude_code", machineId: "", ...wait } } as never,
      })
      .where(eq(schema.agentRuns.id, runId));
    const [run] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, runId));
    if (run)
      await addRunStep(f.db, run, "error", { reason: "usage_wait", code: wait.code, ...(pause ? { pause } : {}) });
  };
  const resetsAt = "2026-11-07T21:00:00.000Z";
  const since = "2026-11-05T09:30:00.000Z";
  const pauseWait = {
    code: "usage_pause",
    source: "plan",
    plan: "Claude",
    resetsAt,
    waitId: "w1",
    waitKey: "plan:m:k:a",
    since: Date.parse(since),
  };

  test("a pause: the plan, its window, how far along, since when and when it resets", async () => {
    f = await setup();
    await ask("@dev resume a semana");
    const [run] = await runs();
    await park(run?.id ?? "", pauseWait, { source: "plan", used: 95, window: "seven_day" });
    const { tasks } = await taskManager(f.db, f.owner.id, f.org.id);
    expect(tasks[0]?.held).toBe("plan");
    expect(tasks[0]?.wait).toEqual({
      code: "usage_pause",
      key: "plan:m:k:a",
      plan: "Claude",
      model: null,
      scope: null,
      percent: 95,
      window: "seven_day",
      resetsAt,
      since,
      canContinue: true,
    });
  });

  test("the agent's line of work keeps its own code; a run at work has no wait", async () => {
    f = await setup();
    await ask("@dev resume a semana");
    const [run] = await runs();
    expect((await taskManager(f.db, f.owner.id, f.org.id)).tasks[0]?.wait).toBeNull();
    await park(run?.id ?? "", { code: "work_queue", waitId: "w1" });
    expect((await taskManager(f.db, f.owner.id, f.org.id)).tasks[0]?.wait?.code).toBe("work_queue");
  });

  test("a model's own limit says the model by name", async () => {
    f = await setup();
    await ask("@dev resume a semana");
    const [run] = await runs();
    await park(run?.id ?? "", {
      code: "plan_limit",
      plan: "OpenCode Go",
      model: "glm-5.3",
      scope: "model",
      waitId: "w1",
    });
    const { tasks } = await taskManager(f.db, f.owner.id, f.org.id);
    expect(tasks[0]?.wait).toMatchObject({ scope: "model", model: "GLM-5.3", canContinue: false });
  });

  test("Continuar agora on several: who may goes on, once; anyone else is refused and sees no way to", async () => {
    f = await setup();
    await ask("@dev resume a semana");
    const [run] = await runs();
    const runId = run?.id ?? "";
    await park(runId, pauseWait, { source: "plan", used: 95, window: "seven_day" });
    const other = await addMember(f.db, f.org.id, "member", "caio");
    await f.db.insert(schema.channelMembers).values({ orgId: f.org.id, channelId: f.general.id, userId: other.id });

    const seen = await taskManager(f.db, other.id, f.org.id);
    expect(seen.tasks[0]?.wait?.canContinue).toBe(false);
    await expect(continuePausedRuns({ db: f.db }, other.id, f.org.id, [runId])).rejects.toBeInstanceOf(ForbiddenError);

    expect(await continuePausedRuns({ db: f.db }, f.owner.id, f.org.id, [runId])).toEqual({ continued: 1 });
    const [after] = await f.db.select().from(schema.agentRuns).where(eq(schema.agentRuns.id, runId));
    const transcript = after?.transcript as unknown as { usagePause?: { override?: unknown } } | undefined;
    expect(transcript?.usagePause?.override).toEqual({
      until: resetsAt,
      by: f.owner.id,
    });
    expect(await continuePausedRuns({ db: f.db }, f.owner.id, f.org.id, [runId])).toEqual({ continued: 0 });
  });

  test("managing routines is no way past the rule for a run that isn't a routine's", async () => {
    f = await setup();
    await ask("@dev resume a semana");
    const [run] = await runs();
    const membership = { permissions: new Set(["manage_routines"]) } as unknown as Membership;
    const row = {
      run: { orgId: f.org.id, triggerMessageId: run?.triggerMessageId ?? "" },
      requester: null,
      ownerUserId: null,
      routineCreatorId: null,
    };
    const other = await addMember(f.db, f.org.id, "member", "caio");
    expect(await mayContinuePause(f.db, other.id, membership, { ...row, routineId: null })).toBe(false);
    expect(await mayContinuePause(f.db, other.id, membership, { ...row, routineId: "a-routine" })).toBe(true);
  });

  test("Continuar agora on several says so on a run's card, as pressing the card does", async () => {
    f = await setup();
    await ask("@dev resume a semana");
    const [run] = await runs();
    const runId = run?.id ?? "";
    await park(runId, pauseWait, { source: "plan", used: 95, window: "seven_day" });
    const card = { kind: "usage_paused", state: "paused", runId, waitId: "w1", continuedByUserId: null };
    const [trigger] = await f.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, run?.triggerMessageId ?? ""));
    await f.db
      .update(schema.messages)
      .set({ meta: { ...trigger?.meta, actionCard: card } })
      .where(eq(schema.messages.id, trigger?.id ?? ""));
    await f.db
      .update(schema.agentRuns)
      .set({
        transcript: sql`${schema.agentRuns.transcript} || jsonb_build_object('usagePause', jsonb_build_object('cardId', ${trigger?.id}::text))`,
      })
      .where(eq(schema.agentRuns.id, runId));

    expect(await continuePausedRuns(deps(), f.owner.id, f.org.id, [runId])).toEqual({ continued: 1 });
    const [after] = await f.db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, trigger?.id ?? ""));
    expect(after?.meta.actionCard).toMatchObject({ state: "continued", continuedByUserId: f.owner.id, waitId: "w1" });
  });
});

describe("the task manager", () => {
  test("lists the tasks you see, what each uses now, and what ended", async () => {
    f = await setup();
    await ask("@dev compara os preços dos concorrentes");
    const [run] = await runs();
    if (!run) throw new Error("no run");
    await addRunStep(f.db, run, "tool_call", { name: "browser_do", detail: "acme.example/precos" });

    const view = await taskManager(f.db, f.owner.id, f.org.id);
    expect(view.tasks).toHaveLength(1);
    expect(view.tasks[0]).toMatchObject({
      runId: run.id,
      agentId: f.agent.id,
      channelId: f.general.id,
      status: "queued",
      background: false,
      requester: { userId: f.owner.id },
      now: { tool: "browser_do", detail: "acme.example/precos" },
      steps: 1,
      canStop: true,
    });
    // Never the ask's own words: no work or thread title yet, so the apps say where it is.
    expect(view.tasks[0]?.label).toBeNull();
    expect(view.activity[f.agent.id]?.at(-1)).toBe(1);

    await cancelRun(deps(), f.owner.id, f.org.id, run.id);
    const after = await taskManager(f.db, f.owner.id, f.org.id);
    expect(after.tasks).toHaveLength(0);
    expect(after.ended[0]).toMatchObject({ runId: run.id, status: "canceled", stoppedBy: { userId: f.owner.id } });
  });

  test("each task says how it stands for its reader, by an agent's line's rule and clock", async () => {
    f = await setup();
    await ask("@dev faz o merge do PR #12");
    const [run] = await runs();
    if (!run) throw new Error("no run");
    const bia = await addMember(f.db, f.org.id, "member", "bia");
    const caio = await addMember(f.db, f.org.id, "member", "caio");
    for (const id of [bia.id, caio.id])
      await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: id });
    const workOf = async (userId: string) =>
      (await taskManager(f.db, userId, f.org.id)).tasks.find((t) => t.runId === run.id)?.work;
    const startedAt = new Date(Date.now() - 600_000);
    await f.db.update(schema.agentRuns).set({ status: "running", startedAt }).where(eq(schema.agentRuns.id, run.id));
    expect(await workOf(caio.id)).toEqual({ state: "working", since: startedAt.toISOString(), card: null });

    // Parked on a card Bia decides (she owns its approvals), as the workspace's owner does: theirs. Caio's waits on
    // someone else, since the card was posted, however long it worked before.
    await f.db
      .update(schema.agentRuns)
      .set({ status: "waiting_approval", updatedAt: new Date() })
      .where(eq(schema.agentRuns.id, run.id));
    const cardAt = new Date(Date.now() - 180_000);
    await f.db.insert(schema.approvals).values({
      orgId: f.org.id,
      runId: run.id,
      agentId: f.agent.id,
      channelId: f.general.id,
      threadRootId: run.threadRootId,
      toolUseId: "toolu_1",
      tool: "github_merge_pull_request",
      scope: "",
      params: {},
      actionHash: "hash",
      title: "Merge PR #12",
      ownerUserId: bia.id,
      requestedByUserId: f.owner.id,
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: cardAt,
      messageId: run.triggerMessageId,
    });
    expect((await workOf(bia.id))?.state).toBe("you");
    expect((await workOf(f.owner.id))?.state).toBe("you");
    // Its row opens at the card.
    expect(await workOf(caio.id)).toEqual({
      state: "approval",
      since: cardAt.toISOString(),
      card: run.triggerMessageId,
    });
  });

  test("a task stopped to read a message its person sent is no ended task: it goes on in the next run", async () => {
    f = await setup();
    await ask("@dev compara os preços dos concorrentes");
    const [run] = await runs();
    if (!run) throw new Error("no run");
    const said = await ask("só os três maiores");
    await cancelRun(deps(), f.owner.id, f.org.id, run.id, { sendMessageId: said.id });
    const view = await taskManager(f.db, f.owner.id, f.org.id);
    expect(view.ended.some((e) => e.runId === run.id)).toBe(false);
  });

  test("a member who isn't in the conversation doesn't see its task", async () => {
    f = await setup();
    await ask("@dev arruma o link");
    const outsider = await addMember(f.db, f.org.id, "member", "caio");
    const view = await taskManager(f.db, outsider.id, f.org.id, { doneToday: true });
    expect(view.tasks).toHaveLength(0);
    expect(view.doneToday).toBe(0);
  });

  test("done today counts every task done, past the ended list's cut; not the failed, nor what others can't see", async () => {
    f = await setup();
    for (let i = 0; i < 52; i++) {
      await ask(`@dev resumo ${i}`);
      await f.db.execute(
        sql`update ${schema.agentRuns} set status = ${i === 0 ? "failed" : "done"}, finished_at = now()
          where status not in ('done', 'failed')`,
      );
    }
    const view = await taskManager(f.db, f.owner.id, f.org.id, { doneToday: true });
    expect(view.ended).toHaveLength(50);
    expect(view.doneToday).toBe(51);
    const outsider = await addMember(f.db, f.org.id, "member", "caio");
    expect((await taskManager(f.db, outsider.id, f.org.id, { doneToday: true })).doneToday).toBe(0);
  });

  test("done today only when asked: a caller that doesn't ask gets no count and runs no count query", async () => {
    f = await setup();
    await ask("@dev resumo");
    await f.db.execute(sql`update ${schema.agentRuns} set status = 'done', finished_at = now()`);
    const plain = await countQueries(() => taskManager(f.db, f.owner.id, f.org.id));
    const counted = await countQueries(() => taskManager(f.db, f.owner.id, f.org.id, { doneToday: true }));
    expect("doneToday" in plain.result).toBe(false);
    expect(counted.result.doneToday).toBe(1);
    expect(counted.result.ended).toEqual(plain.result.ended);
    expect(counted.queries).toBe(plain.queries + 1);
  });

  test("a task's steps: what each call was, never its input; only for who sees the task", async () => {
    f = await setup();
    await ask("@dev manda o relatório pro cliente");
    const [run] = await runs();
    if (!run) throw new Error("no run");
    await addRunStep(f.db, run, "tool_call", {
      toolUseId: "t1",
      name: "gmail_send_email",
      input: { to: "cliente@acme.example", body: "segredo" },
      connector: "Gmail",
      service: "gmail",
    });
    await addRunStep(f.db, run, "tool_result", {
      toolUseId: "t1",
      name: "gmail_send_email",
      isError: false,
      content: "sent",
    });

    const { steps } = await taskSteps(f.db, f.owner.id, f.org.id, run.id);
    expect(steps.map((s) => s.kind)).toEqual(["tool_call", "tool_result"]);
    expect(steps[0]?.data).toEqual({ toolUseId: "t1", name: "gmail_send_email", connector: "Gmail", service: "gmail" });
    expect(steps[1]?.data).toEqual({ toolUseId: "t1", name: "gmail_send_email", isError: false });

    const outsider = await addMember(f.db, f.org.id, "member", "caio");
    await expect(taskSteps(f.db, outsider.id, f.org.id, run.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("a task waiting for room on its computer is listed, and says so (not as waiting on a person)", async () => {
    f = await setup();
    await ask("@dev roda os testes");
    const [run] = await runs();
    if (!run) throw new Error("no run");
    await f.db
      .update(schema.agentRuns)
      .set({
        status: "waiting_input",
        transcript: { waitingForBrain: { kind: "claude_code", code: "busy", waitId: "w1" } },
      })
      .where(eq(schema.agentRuns.id, run.id));
    const view = await taskManager(f.db, f.owner.id, f.org.id);
    expect(view.tasks[0]).toMatchObject({ runId: run.id, status: "waiting_input", held: "computer_busy" });
  });

  test("the computer's line: each task's place as the line orders it (people first), and the computers row", async () => {
    f = await setup();
    const [machine] = await f.db.insert(schema.machines).values({ orgId: f.org.id, name: "Mac" }).returning();
    if (!machine) throw new Error("no machine");
    await ask("@dev roda os testes");
    const second = await ask("@dev e o lint");
    const [a] = await runs();
    if (!a) throw new Error("no run");
    // A second turn of its own (the main timeline would join the first one), as another conversation would start.
    const [b] = await f.db
      .insert(schema.agentRuns)
      .values({ ...a, id: undefined, triggerMessageId: second.id, threadRootId: second.id })
      .returning();
    if (!b) throw new Error("no second run");
    const inLine = (since: number, people: boolean) => ({
      status: "waiting_input" as const,
      waitingMachineId: machine.id,
      transcript: {
        waitingForBrain: { kind: "claude_code", code: "busy", waitId: "w" },
        roomWaitSince: since,
        roomPeople: people,
      },
    });
    // The agents' turn waited longer, but a person waits on the other one: it goes first.
    await f.db.update(schema.agentRuns).set(inLine(1_000, false)).where(eq(schema.agentRuns.id, a.id));
    await f.db.update(schema.agentRuns).set(inLine(2_000, true)).where(eq(schema.agentRuns.id, b.id));

    const view = await taskManager(f.db, f.owner.id, f.org.id);
    expect(view.tasks.find((t) => t.runId === b.id)?.line).toMatchObject({
      machineId: machine.id,
      position: 1,
      of: 2,
      people: true,
    });
    expect(view.tasks.find((t) => t.runId === a.id)?.line).toMatchObject({ position: 2, of: 2, people: false });
    expect(view.computers).toEqual([{ id: machine.id, name: "Mac", working: 0, inLine: 2 }]);
  });
});
