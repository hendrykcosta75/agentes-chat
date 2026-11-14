import { afterEach, describe, expect, test } from "bun:test";
import { eq, schema } from "@agenteschat/db";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AHEAD_REFUSED,
  acceptCustomSuggestion,
  addChannelMember,
  addRunStep,
  approvalView,
  COMPOSIO_EXECUTOR,
  type CustomDeps,
  composioMcpTool,
  connectCustomServer,
  consultationNotice,
  createAgent,
  createConnectorToolSource,
  createRole,
  createRoutine,
  createScheduleToolSource,
  createToolGateway,
  decideApproval,
  deleteRoutine,
  deliverNoticeToRun,
  type InvokeResult,
  insertMessage,
  MCP_PRESETS,
  type McpConnect,
  mcpSessionOver,
  type RoutineBrief,
  RUN_APPROVED_ACTION,
  setMemberRoles,
  type ToolContext,
  updateRoutine,
} from "../src";
import { addMember, type Fixture, setup } from "./fixtures";

let f: Fixture;
afterEach(async () => {
  const current = f;
  f = undefined as unknown as Fixture;
  await current?.close();
});

const EXEC = `composio_${COMPOSIO_EXECUTOR}`;
const WORKBENCH = "COMPOSIO_REMOTE_WORKBENCH";
const WHY = "The weekly summary goes to the team channel every Monday, as the person asked for.";

/** Real actions the code's own rules call ordinary writes: a routine's own run does them with no card. */
const WRITES = [
  "GOOGLESHEETS_VALUES_UPDATE",
  "HUBSPOT_UPDATE_DEAL",
  "SALESFORCE_UPDATE_OPPORTUNITY",
  "ASANA_UPDATE_A_TASK",
  "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT",
];
/** A send, a delete, a payment, an invite and one its app's entry always asks for: each still asks. */
const RISKY = [
  "SLACK_SEND_MESSAGE",
  "GOOGLESHEETS_DELETE_SHEET",
  "SQUARE_CREATE_REFUND",
  "SLACK_INVITE_USER_TO_CHANNEL",
  "GOOGLESHEETS_CLEAR_VALUES",
];

/** A Composio action as its connection lists it: the warning our rules for its app's entry give it. */
function composioAction(slug: string) {
  const way = MCP_PRESETS.find((p) => p.composio?.actions.includes(slug))?.composio;
  if (!way) throw new Error(`no app entry lists ${slug}`);
  return composioMcpTool(way, { slug, description: slug, inputSchema: { type: "object" }, tags: [] });
}

/** A Composio-shaped server in process: its executor, its code workbench and `actions`, each call kept. */
function composioMcp(actions: readonly string[] = []) {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
  const build = () => {
    const server = new McpServer({ name: "composio", version: "1" });
    server.registerTool(
      COMPOSIO_EXECUTOR,
      {
        description: "Executes up to 50 tools in parallel.",
        inputSchema: {
          tools: z.array(z.object({ tool_slug: z.string(), arguments: z.record(z.string(), z.unknown()).optional() })),
          sync_response_to_workbench: z.boolean(),
        },
        annotations: { destructiveHint: true },
      },
      async (args) => {
        calls.push({ tool: COMPOSIO_EXECUTOR, args });
        return text(`ran ${args.tools.map((t) => t.tool_slug).join(", ")}`);
      },
    );
    for (const slug of actions) {
      const listed = composioAction(slug);
      server.registerTool(
        slug,
        {
          description: slug,
          inputSchema: { text: z.string().optional() },
          annotations: { destructiveHint: listed.destructiveHint ?? false },
        },
        async (args) => {
          calls.push({ tool: slug, args });
          return text("done");
        },
      );
    }
    server.registerTool(
      WORKBENCH,
      { description: "Runs Python in a sandbox", inputSchema: { code_to_execute: z.string() } },
      async (args) => {
        calls.push({ tool: WORKBENCH, args });
        return text("done");
      },
    );
    return server;
  };
  const connect: McpConnect = async () => {
    const [client, server] = InMemoryTransport.createLinkedPair();
    await build().connect(server);
    return mcpSessionOver(client);
  };
  return { connect, calls };
}

async function world(fx: Fixture, actions: readonly string[] = []) {
  const mcp = composioMcp(actions);
  const deps: CustomDeps = {
    db: fx.db,
    keyWrappers: [fx.keyWrapper],
    publicUrl: "https://chat.example.com",
    resolveHost: async () => ["93.184.216.34"],
    connect: mcp.connect,
  };
  const started = await connectCustomServer(deps, fx.owner.id, fx.org.id, {
    serverUrl: "https://backend.composio.dev/v3/mcp/composio",
    apiKey: "ck_fake_key_for_tests",
    label: "Composio",
  });
  if (started.status !== "connected") throw new Error(`expected connected, got ${started.status}`);
  await acceptCustomSuggestion(deps, fx.owner.id, fx.org.id, started.server.id);
  const gateway = createToolGateway({
    sources: [createConnectorToolSource(deps), createScheduleToolSource({ pubsub: fx.pubsub, context: fx.context })],
  });
  return { mcp, gateway };
}

/** A run `userId` asked for in #general. */
async function personRun(fx: Fixture, userId = fx.owner.id): Promise<ToolContext> {
  const msg = await insertMessage(fx.db, {
    orgId: fx.org.id,
    channelId: fx.general.id,
    author: { type: "person", userId },
    body: "@dev toda segunda às 9h manda o resumo da semana no Slack e por email",
  });
  const [run] = await fx.db
    .insert(schema.agentRuns)
    .values({
      orgId: fx.org.id,
      agentId: fx.agent.id,
      channelId: fx.general.id,
      threadRootId: msg.id,
      triggerMessageId: msg.id,
      trigger: "mention",
      hop: 1,
      status: "running",
    })
    .returning();
  if (!run) throw new Error("no run");
  return {
    db: fx.db,
    orgId: fx.org.id,
    agentId: fx.agent.id,
    runId: run.id,
    channelId: fx.general.id,
    threadRootId: msg.id,
    triggerMessageId: msg.id,
  };
}

/** The routine's scheduled background run, its brief as the server writes it when it fires. */
async function routineRun(
  fx: Fixture,
  routineId: string,
  creatorUserId = fx.owner.id,
  dueAt = new Date(),
): Promise<ToolContext> {
  const brief: RoutineBrief = {
    routineId,
    routineRunId: crypto.randomUUID(),
    name: "Resumo da semana",
    creatorUserId,
    deliverTo: { channelId: fx.general.id, threadId: null },
    access: "act",
    report: "when_new",
    trigger: "schedule",
    dueAt: dueAt.toISOString(),
  };
  const msg = await insertMessage(fx.db, {
    orgId: fx.org.id,
    channelId: fx.general.id,
    author: { type: "person", userId: creatorUserId },
    body: "Resumo da semana",
    meta: { routineBrief: brief, background: true },
  });
  const [run] = await fx.db
    .insert(schema.agentRuns)
    .values({
      orgId: fx.org.id,
      agentId: fx.agent.id,
      channelId: fx.general.id,
      threadRootId: msg.id,
      triggerMessageId: msg.id,
      trigger: "mention",
      hop: 1,
      background: true,
    })
    .returning();
  if (!run) throw new Error("no run");
  return {
    db: fx.db,
    orgId: fx.org.id,
    agentId: fx.agent.id,
    runId: run.id,
    channelId: fx.general.id,
    threadRootId: msg.id,
    triggerMessageId: msg.id,
    background: true,
  };
}

/**
 * The run a routine's report woke: the `routine_handoff` notice its `hand_off` with `wake_me` posts in the
 * conversation it reports to. Nobody is behind it (`routine_report`), and it keeps the routine's brief. With
 * `chain`, a run on the routine's own run's message instead (reason `routine`, the end of work a routine started).
 */
async function reportRun(
  fx: Fixture,
  routineRunId: string,
  { agentId = fx.agent.id, chain = false }: { agentId?: string; chain?: boolean } = {},
): Promise<ToolContext> {
  const text = "Erro novo no checkout";
  const msg = await insertMessage(fx.db, {
    orgId: fx.org.id,
    channelId: fx.general.id,
    author: { type: "agent", agentId: fx.agent.id, runId: chain ? routineRunId : null, hop: 0, stretchId: null },
    body: text,
    meta: chain ? {} : { notice: { kind: "routine_handoff", text, from: "Routine", refs: { runId: routineRunId } } },
  });
  const [run] = await fx.db
    .insert(schema.agentRuns)
    .values({
      orgId: fx.org.id,
      agentId,
      channelId: fx.general.id,
      threadRootId: msg.id,
      triggerMessageId: msg.id,
      trigger: "mention",
      hop: 1,
      status: "running",
    })
    .returning();
  if (!run) throw new Error("no run");
  return {
    db: fx.db,
    orgId: fx.org.id,
    agentId,
    runId: run.id,
    channelId: fx.general.id,
    threadRootId: msg.id,
    triggerMessageId: msg.id,
  };
}

/** A teammate agent in #general, for the routine's agent to ask. */
async function teammate(fx: Fixture, handle = "qa") {
  const agent = await createAgent(
    fx.db,
    fx.owner.id,
    fx.org.id,
    { name: handle.toUpperCase(), handle, credentialId: fx.credential.id },
    { model: "claude-sonnet-5-5" },
  );
  await addChannelMember(fx.db, fx.owner.id, fx.org.id, fx.general.id, { agentId: agent.id });
  return agent;
}

const ANSWER = "Sim, o deploy de ontem quebrou o checkout.";

/** A question run `askerRunId` asked `targetAgentId` (`ask_agent`), answered. */
async function answeredQuestion(fx: Fixture, askerRunId: string, targetAgentId: string) {
  const [consultation] = await fx.db
    .insert(schema.agentConsultations)
    .values({
      orgId: fx.org.id,
      askerRunId,
      askerAgentId: fx.agent.id,
      targetAgentId,
      channelId: fx.general.id,
      messageId: crypto.randomUUID(),
      waitId: crypto.randomUUID(),
      question: "O erro do checkout é do deploy de ontem?",
      chain: [fx.agent.id],
      status: "answered",
      answer: ANSWER,
      answeredAt: new Date(),
      expiresAt: new Date(Date.now() + 600_000),
    })
    .returning();
  if (!consultation) throw new Error("no consultation");
  return consultation;
}

/** The `consult_reply` notice a teammate's answer to run `askerRunId`'s question posts back for the asker's agent. */
async function answerNotice(fx: Fixture, askerRunId: string, targetAgentId: string) {
  const consultation = await answeredQuestion(fx, askerRunId, targetAgentId);
  return insertMessage(fx.db, {
    orgId: fx.org.id,
    channelId: fx.general.id,
    author: { type: "agent", agentId: fx.agent.id, runId: null, hop: 0, stretchId: null },
    body: ANSWER,
    meta: {
      notice: {
        kind: "consult_reply",
        text: ANSWER,
        from: "@qa",
        refs: { consultationId: consultation.id, runId: askerRunId },
      },
    },
  });
}

/** The run the routine's agent starts on a teammate's answer (it never waits for one: the answer wakes it). */
async function answerRun(fx: Fixture, askerRunId: string, targetAgentId: string): Promise<ToolContext> {
  const msg = await answerNotice(fx, askerRunId, targetAgentId);
  const [run] = await fx.db
    .insert(schema.agentRuns)
    .values({
      orgId: fx.org.id,
      agentId: fx.agent.id,
      channelId: fx.general.id,
      threadRootId: msg.id,
      triggerMessageId: msg.id,
      trigger: "mention",
      hop: 1,
      status: "running",
    })
    .returning();
  if (!run) throw new Error("no run");
  return {
    db: fx.db,
    orgId: fx.org.id,
    agentId: fx.agent.id,
    runId: run.id,
    channelId: fx.general.id,
    threadRootId: msg.id,
    triggerMessageId: msg.id,
  };
}

/** Records that `run` read `messageId` after its trigger, as the executor does when a message joins it. */
const readJoined = (fx: Fixture, run: ToolContext, messageId: string) =>
  addRunStep(fx.db, { id: run.runId, orgId: fx.org.id }, "context", { steeredMessageIds: [messageId] });

const exec = (...slugs: string[]) => ({
  tools: slugs.map((tool_slug) => ({ tool_slug, arguments: { channel: "#time", text: "Resumo" } })),
  sync_response_to_workbench: false,
});

let seq = 0;
const invoke = (gateway: ReturnType<typeof createToolGateway>, ctx: ToolContext, name: string, input: object) =>
  gateway.invoke(ctx, { toolUseId: `call-${++seq}`, name, input: input as Record<string, unknown> });

function asked(result: InvokeResult) {
  if (result.type !== "approval") throw new Error(`expected an approval, got ${JSON.stringify(result)}`);
  return result.approval;
}
function answered(result: InvokeResult) {
  if (result.type !== "result") throw new Error(`expected a result, got ${JSON.stringify(result)}`);
  return result.output;
}
const routineRow = async (id: string) =>
  (await f.db.select().from(schema.routines).where(eq(schema.routines.id, id)))[0];

/** The person asks the agent for the routine in the chat, with the actions its job needs. */
async function created(
  gateway: ReturnType<typeof createToolGateway>,
  ownActions: string[],
  prompt = "Manda o resumo da semana no Slack (#time) e por email para a diretoria.",
) {
  const ctx = await personRun(f);
  const out = answered(
    await invoke(gateway, ctx, "create_routine", {
      prompt,
      schedule: "toda segunda às 9h",
      own_actions: ownActions,
    }),
  );
  const id = (out.data?.routine as { id: string } | undefined)?.id;
  if (out.isError || !id) throw new Error(`not created: ${out.content}`);
  return { ctx, out, id };
}

describe("a routine's own job (routines.own_actions)", () => {
  test("a scheduled routine posts to Slack and sends the email it was set up for, without a card", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    const { ctx, out, id } = await created(gateway, ["SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL"]);
    // At creation the person hears what it will do on its own, and the receipt carries it.
    expect(out.content).toContain("On its own, without asking, every run may: SLACK_SEND_MESSAGE, GMAIL_SEND_EMAIL");
    expect((await routineRow(id))?.ownActions).toEqual(["SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL"]);
    const [receipt] = await f.db.select().from(schema.agentActions).where(eq(schema.agentActions.runId, ctx.runId));
    expect(receipt?.params).toMatchObject({ ownActions: ["SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL"] });

    const run = await routineRun(f, id);
    expect(answered(await invoke(gateway, run, EXEC, exec("SLACK_SEND_MESSAGE"))).isError).toBeFalsy();
    expect(answered(await invoke(gateway, run, EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY })).isError).toBeFalsy();
    expect(
      answered(await invoke(gateway, run, EXEC, exec("SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL"))).isError,
    ).toBeFalsy();
    expect(mcp.calls.map((c) => c.args)).toEqual([
      exec("SLACK_SEND_MESSAGE"),
      exec("GMAIL_SEND_EMAIL"),
      exec("SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL"),
    ]);
    expect(await f.db.select().from(schema.approvals)).toEqual([]);
  });

  test("a run its report woke does the routine's own actions, and asks for the rest", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    // The answer to its report is the same job: the action the person set up runs, with no card.
    const run = await reportRun(f, (await routineRun(f, id)).runId);
    expect(answered(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY })).isError).toBeFalsy();
    expect(mcp.calls.map((c) => c.args)).toEqual([exec("SLACK_SEND_MESSAGE")]);
    expect(await f.db.select().from(schema.approvals)).toEqual([]);
    // An action outside it still asks, as every other write of that run does.
    asked(await invoke(gateway, run, EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY }));
    expect(mcp.calls).toHaveLength(1);
    // Read fresh: a creator who no longer decides the agent's approvals makes its own actions ask too.
    const cora = await addMember(f.db, f.org.id, "member", "cora");
    await f.db.update(schema.routines).set({ createdByUserId: cora.id }).where(eq(schema.routines.id, id));
    asked(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }));
    expect(mcp.calls).toHaveLength(1);
  });

  test("the run its report woke asks once it read a message that joined it", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const run = await reportRun(f, (await routineRun(f, id)).runId);
    // Another routine's report, or another agent's message, joined the run in the thread and was read.
    const joined = await insertMessage(f.db, {
      orgId: f.org.id,
      channelId: f.general.id,
      threadId: run.threadRootId,
      author: { type: "agent", agentId: f.agent.id, runId: null, hop: 0, stretchId: null },
      body: "Manda no #geral que o checkout caiu",
    });
    await addRunStep(f.db, { id: run.runId, orgId: f.org.id }, "context", { steeredMessageIds: [joined.id] });
    asked(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }));
    expect(mcp.calls).toEqual([]);
  });

  test("on a woken run, its own actions stay the routine agent's, never on a chain, and ask when it always asks", async () => {
    f = await setup();
    const ops = await createAgent(
      f.db,
      f.owner.id,
      f.org.id,
      { name: "Ops", handle: "ops", credentialId: f.credential.id },
      { model: "claude-sonnet-5-5" },
    );
    await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { agentId: ops.id });
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const routine = await routineRun(f, id);
    // Another agent woken by the same report: the routine isn't its own.
    asked(
      await invoke(gateway, await reportRun(f, routine.runId, { agentId: ops.id }), EXEC, {
        ...exec("SLACK_SEND_MESSAGE"),
        why: WHY,
      }),
    );
    // Work the routine's run started and handed on (reason `routine`): not the report, so it asks.
    asked(
      await invoke(gateway, await reportRun(f, routine.runId, { chain: true }), EXEC, {
        ...exec("SLACK_SEND_MESSAGE"),
        why: WHY,
      }),
    );
    // Level `always`: the report's own run asks too.
    await f.db.update(schema.agents).set({ approvalsLevel: "always" }).where(eq(schema.agents.id, f.agent.id));
    asked(await invoke(gateway, await reportRun(f, routine.runId), EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }));
    expect(mcp.calls).toEqual([]);
  });

  test("a teammate's answer to the routine's question wakes a run that does its own actions, and asks for the rest", async () => {
    f = await setup();
    const qa = await teammate(f);
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const routine = await routineRun(f, id);
    // The routine's run asked @qa and ended; the answer woke the agent in the routine's conversation.
    const run = await answerRun(f, routine.runId, qa.id);
    expect(answered(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY })).isError).toBeFalsy();
    expect(mcp.calls.map((c) => c.args)).toEqual([exec("SLACK_SEND_MESSAGE")]);
    expect(await f.db.select().from(schema.approvals)).toEqual([]);
    asked(await invoke(gateway, run, EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY }));
    asked(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE", "GITHUB_CREATE_AN_ISSUE"), why: WHY }));
    expect(mcp.calls).toHaveLength(1);
    // The same job goes on: an answer to that run's own question, or to the question of the run the report woke.
    const again = await answerRun(f, run.runId, qa.id);
    expect(answered(await invoke(gateway, again, EXEC, exec("SLACK_SEND_MESSAGE"))).isError).toBeFalsy();
    const report = await reportRun(f, routine.runId);
    const fromReport = await answerRun(f, report.runId, qa.id);
    expect(answered(await invoke(gateway, fromReport, EXEC, exec("SLACK_SEND_MESSAGE"))).isError).toBeFalsy();
    expect(mcp.calls).toHaveLength(3);
    // At "Sempre perguntar" it asks.
    await f.db.update(schema.agents).set({ approvalsLevel: "always" }).where(eq(schema.agents.id, f.agent.id));
    asked(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }));
    expect(mcp.calls).toHaveLength(3);
  });

  test("the answer as the server delivers it wakes, in the routine's conversation, a run that does its own actions", async () => {
    f = await setup();
    const qa = await teammate(f);
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const routine = await routineRun(f, id);
    // The routine's run asked @qa and ended at once; the answer closes later (`closeConsultation`).
    const [asker] = await f.db
      .update(schema.agentRuns)
      .set({ status: "done" })
      .where(eq(schema.agentRuns.id, routine.runId))
      .returning();
    if (!asker) throw new Error("no routine run");
    const question = await answeredQuestion(f, asker.id, qa.id);
    const { message, runs } = await f.db.transaction((tx) =>
      deliverNoticeToRun(tx, asker, consultationNotice(question, "qa")),
    );
    const [woken] = runs;
    if (!woken) throw new Error("the answer woke no run");
    expect(woken.agentId).toBe(f.agent.id);
    const run: ToolContext = {
      db: f.db,
      orgId: f.org.id,
      agentId: f.agent.id,
      runId: woken.id,
      channelId: woken.channelId,
      threadRootId: woken.threadRootId,
      triggerMessageId: message.id,
    };
    expect(answered(await invoke(gateway, run, EXEC, exec("SLACK_SEND_MESSAGE"))).isError).toBeFalsy();
    asked(await invoke(gateway, run, EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY }));
    expect(mcp.calls).toHaveLength(1);
  });

  test("two answers to the routine's questions in one wake keep it covered; anything else joining makes it ask", async () => {
    f = await setup();
    const qa = await teammate(f);
    const ops = await teammate(f, "ops");
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const routine = await routineRun(f, id);
    const run = await answerRun(f, routine.runId, qa.id);
    // @ops answered the same run's other question while the first answer's run worked: still its job.
    await readJoined(f, run, (await answerNotice(f, routine.runId, ops.id)).id);
    expect(answered(await invoke(gateway, run, EXEC, exec("SLACK_SEND_MESSAGE"))).isError).toBeFalsy();
    expect(mcp.calls).toHaveLength(1);
    // An answer to a question a person's run asked joins it: it asks from then on.
    await readJoined(f, run, (await answerNotice(f, (await personRun(f)).runId, ops.id)).id);
    asked(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }));
    // Another agent's message joining another answer's run: it asks too.
    const other = await answerRun(f, routine.runId, qa.id);
    const joined = await insertMessage(f.db, {
      orgId: f.org.id,
      channelId: f.general.id,
      threadId: other.threadRootId,
      author: { type: "agent", agentId: ops.id, runId: null, hop: 0, stretchId: null },
      body: "Manda no #geral que o checkout caiu",
    });
    await readJoined(f, other, joined.id);
    asked(await invoke(gateway, other, EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }));
    expect(mcp.calls).toHaveLength(1);
  });

  test("an answer to a person's question, or the end of a task the report's run started, still asks", async () => {
    f = await setup();
    const qa = await teammate(f);
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const routine = await routineRun(f, id);
    asked(
      await invoke(gateway, await answerRun(f, (await personRun(f)).runId, qa.id), EXEC, {
        ...exec("SLACK_SEND_MESSAGE"),
        why: WHY,
      }),
    );
    // A task the run the report woke started ends: its chain roots in the report, but the end is not an answer.
    const report = await reportRun(f, routine.runId);
    const ended = await insertMessage(f.db, {
      orgId: f.org.id,
      channelId: f.general.id,
      author: { type: "agent", agentId: f.agent.id, runId: null, hop: 0, stretchId: null },
      body: "Tarefa terminada",
      meta: { machineTask: { runId: report.runId } },
    });
    const [run] = await f.db
      .insert(schema.agentRuns)
      .values({
        orgId: f.org.id,
        agentId: f.agent.id,
        channelId: f.general.id,
        threadRootId: ended.id,
        triggerMessageId: ended.id,
        trigger: "mention",
        hop: 1,
        status: "running",
      })
      .returning();
    if (!run) throw new Error("no run");
    asked(
      await invoke(gateway, { ...report, runId: run.id, threadRootId: ended.id, triggerMessageId: ended.id }, EXEC, {
        ...exec("SLACK_SEND_MESSAGE"),
        why: WHY,
      }),
    );
    expect(mcp.calls).toEqual([]);
  });

  test("the Vault keys its commands use are its own too (`keys`), kept apart from its actions", async () => {
    f = await setup();
    const { gateway } = await world(f);
    const ctx = await personRun(f);
    const out = answered(
      await invoke(gateway, ctx, "create_routine", {
        prompt: "Baixa as vendas de ontem da Stripe e manda no Slack.",
        schedule: "toda segunda às 9h",
        own_actions: ["SLACK_SEND_MESSAGE"],
        keys: ["STRIPE_KEY"],
      }),
    );
    const id = (out.data?.routine as { id: string } | undefined)?.id ?? "";
    expect(out.content).toContain("Its commands may use these Vault keys: STRIPE_KEY");
    expect((await routineRow(id))?.ownActions).toEqual(["SLACK_SEND_MESSAGE", "vault:STRIPE_KEY"]);
    // Its actions changed alone keep its keys; its keys changed alone keep its actions.
    answered(await invoke(gateway, ctx, "update_routine", { id, own_actions: [] }));
    expect((await routineRow(id))?.ownActions).toEqual(["vault:STRIPE_KEY"]);
    answered(await invoke(gateway, ctx, "update_routine", { id, own_actions: ["SLACK_SEND_MESSAGE"], keys: [] }));
    expect((await routineRow(id))?.ownActions).toEqual(["SLACK_SEND_MESSAGE"]);
  });

  test("an action outside its job still asks, alone or beside one of its own", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const run = await routineRun(f, id);
    asked(await invoke(gateway, run, EXEC, { ...exec("SLACK_DELETE_MESSAGE"), why: WHY }));
    asked(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE", "GITHUB_CREATE_AN_ISSUE"), why: WHY }));
    // A tool that runs whatever its input says never counts, even listed.
    await updateRoutine({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, id, {
      ownActions: ["SLACK_SEND_MESSAGE", WORKBENCH],
    });
    asked(await invoke(gateway, run, `composio_${WORKBENCH}`, { code_to_execute: "print(1)", why: WHY }));
    expect(mcp.calls).toEqual([]);
  });

  test("a deploy always asks: it can't be listed, and a run that tries it gets a card", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    const refused = answered(
      await invoke(gateway, await personRun(f), "create_routine", {
        prompt: "Faz o deploy toda segunda.",
        schedule: "toda segunda às 9h",
        own_actions: ["VERCEL_CREATE_NEW_DEPLOYMENT"],
      }),
    );
    expect(refused.isError).toBe(true);
    expect(refused.content).toContain("can't be one of a routine's own actions");
    expect(await f.db.select().from(schema.routines)).toEqual([]);

    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    // Even stored by hand, a deploy or a merge asks at the time.
    await f.db
      .update(schema.routines)
      .set({ ownActions: ["SLACK_SEND_MESSAGE", "VERCEL_CREATE_NEW_DEPLOYMENT", "GITHUB_MERGE_A_PULL_REQUEST"] })
      .where(eq(schema.routines.id, id));
    const run = await routineRun(f, id);
    asked(await invoke(gateway, run, EXEC, { ...exec("VERCEL_CREATE_NEW_DEPLOYMENT"), why: WHY }));
    asked(await invoke(gateway, run, EXEC, { ...exec("GITHUB_MERGE_A_PULL_REQUEST"), why: WHY }));
    expect(mcp.calls).toEqual([]);
  });

  test("only someone who decides the agent's approvals sets them, and losing that right makes the run ask", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    // Cora manages routines but doesn't approve the agent's actions.
    const cora = await addMember(f.db, f.org.id, "member", "cora");
    const role = await createRole(f.db, f.owner.id, f.org.id, { name: "Rotinas", permissions: ["manage_routines"] });
    await setMemberRoles(f.db, f.owner.id, f.org.id, cora.id, [role.id]);
    await addChannelMember(f.db, f.owner.id, f.org.id, f.general.id, { userId: cora.id });
    const input = {
      agentId: f.agent.id,
      prompt: "Manda o resumo no Slack.",
      target: { type: "channel" as const, channelId: f.general.id },
      trigger: { type: "schedule" as const, phrase: "toda segunda às 9h" },
    };
    const deps = { db: f.db, pubsub: f.pubsub, context: f.context };
    await expect(
      createRoutine(deps, cora.id, f.org.id, { ...input, ownActions: ["SLACK_SEND_MESSAGE"] }),
    ).rejects.toMatchObject({ code: "routine.actions_need_approver" });
    const routine = await createRoutine(deps, cora.id, f.org.id, input);
    expect(routine.ownActions).toEqual([]);

    // Stored for her anyway, it doesn't count: she couldn't approve it herself.
    await f.db
      .update(schema.routines)
      .set({ ownActions: ["SLACK_SEND_MESSAGE"] })
      .where(eq(schema.routines.id, routine.id));
    asked(
      await invoke(gateway, await routineRun(f, routine.id, cora.id), EXEC, {
        ...exec("SLACK_SEND_MESSAGE"),
        why: WHY,
      }),
    );
    expect(mcp.calls).toEqual([]);

    // Taking actions away only makes it ask more: she may, and so may an editor who isn't its creator.
    const shrunk = await updateRoutine(deps, cora.id, f.org.id, routine.id, { ownActions: [] });
    expect(shrunk.ownActions).toEqual([]);
    const own = await createRoutine(deps, f.owner.id, f.org.id, { ...input, ownActions: ["SLACK_SEND_MESSAGE"] });
    await expect(
      updateRoutine(deps, cora.id, f.org.id, own.id, { ownActions: ["SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL"] }),
    ).rejects.toMatchObject({ code: "routine.act_take_over" });
    expect((await updateRoutine(deps, cora.id, f.org.id, own.id, { ownActions: [] })).ownActions).toEqual([]);
  });

  test("an agent that always asks: its routine's own actions ask too, and the card offers no way around it", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    await f.db.update(schema.agents).set({ approvalsLevel: "always" }).where(eq(schema.agents.id, f.agent.id));
    const run = await routineRun(f, id);
    expect(
      asked(await invoke(gateway, run, EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY })).approveAlways,
    ).toBeNull();
    expect(asked(await invoke(gateway, run, EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY })).approveAlways).toBeNull();
    expect(mcp.calls).toEqual([]);
  });

  test("a routine with no own actions asks for a send", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    const { out, id } = await created(gateway, []);
    expect(out.content).toContain(
      "Its changes in connected apps run without asking, except a send, a delete, a payment or an invite, which ask a person first.",
    );
    asked(await invoke(gateway, await routineRun(f, id), EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }));
    expect(mcp.calls).toEqual([]);
  });
});

describe("a routine's writes at Só o arriscado", () => {
  const app = (slug: string) => `composio_${slug}`;
  const write = { text: "Total de ontem", why: WHY };

  test("its own run does ordinary writes with no card, and its sends, deletes, payments and invites ask", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f, [...WRITES, ...RISKY]);
    const { id } = await created(gateway, []);
    const run = await routineRun(f, id);
    for (const slug of WRITES)
      expect(answered(await invoke(gateway, run, app(slug), { text: "1" })).isError).toBeFalsy();
    expect(mcp.calls.map((c) => c.tool)).toEqual(WRITES);
    expect(await f.db.select().from(schema.approvals)).toEqual([]);
    for (const slug of RISKY) asked(await invoke(gateway, run, app(slug), write));
    expect(mcp.calls).toHaveLength(WRITES.length);
  });

  test("at Sempre perguntar every write asks", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f, [...WRITES, ...RISKY]);
    const { id } = await created(gateway, []);
    await f.db.update(schema.agents).set({ approvalsLevel: "always" }).where(eq(schema.agents.id, f.agent.id));
    const run = await routineRun(f, id);
    for (const slug of [...WRITES, ...RISKY]) asked(await invoke(gateway, run, app(slug), write));
    expect(mcp.calls).toEqual([]);
  });

  test("a routine whose creator no longer decides the agent's approvals, or has none, asks for a write", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f, WRITES);
    const { id } = await created(gateway, []);
    const cora = await addMember(f.db, f.org.id, "member", "cora");
    await f.db.update(schema.routines).set({ createdByUserId: cora.id }).where(eq(schema.routines.id, id));
    asked(await invoke(gateway, await routineRun(f, id, cora.id), app("HUBSPOT_UPDATE_DEAL"), write));
    await f.db.update(schema.routines).set({ createdByUserId: null }).where(eq(schema.routines.id, id));
    asked(await invoke(gateway, await routineRun(f, id), app("HUBSPOT_UPDATE_DEAL"), write));
    expect(mcp.calls).toEqual([]);
  });

  test("a run its report or a teammate's answer woke asks for a write that is not on its list", async () => {
    f = await setup();
    const qa = await teammate(f);
    const { mcp, gateway } = await world(f, WRITES);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const routine = await routineRun(f, id);
    asked(await invoke(gateway, await reportRun(f, routine.runId), app("HUBSPOT_UPDATE_DEAL"), write));
    asked(await invoke(gateway, await answerRun(f, routine.runId, qa.id), app("HUBSPOT_UPDATE_DEAL"), write));
    expect(mcp.calls).toEqual([]);
  });

  test("a write a person refused ahead for its run never runs, and one they approved runs once", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f, WRITES);
    const { id } = await created(gateway, []);
    const prepare = async (text: string) =>
      asked(
        await invoke(gateway, await personRun(f), "schedule_action", {
          tool: app("HUBSPOT_UPDATE_DEAL"),
          arguments: { text },
          routine: id,
          title: "Atualizar o negócio",
          why: WHY,
        }),
      );
    const decide = (approvalId: string, decision: "approve" | "refuse") =>
      decideApproval({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, approvalId, { decision });
    const refused = await prepare("Perdido");
    await decide(refused.id, "refuse");
    const approved = await prepare("Ganho");
    await decide(approved.id, "approve");
    if (!refused.runAt) throw new Error("not prepared ahead");
    const run = await routineRun(f, id, f.owner.id, refused.runAt);
    for (const call of [
      { name: RUN_APPROVED_ACTION, input: { id: refused.id } },
      { name: app("HUBSPOT_UPDATE_DEAL"), input: { text: "Perdido" } },
    ]) {
      expect(answered(await invoke(gateway, run, call.name, call.input))).toMatchObject({ content: AHEAD_REFUSED });
    }
    expect(answered(await invoke(gateway, run, RUN_APPROVED_ACTION, { id: approved.id })).isError).toBeFalsy();
    expect(mcp.calls).toEqual([{ tool: "HUBSPOT_UPDATE_DEAL", args: { text: "Ganho" } }]);
    const [row] = await f.db.select().from(schema.approvals).where(eq(schema.approvals.id, approved.id));
    expect(row?.executedAt).not.toBeNull();
  });
});

describe('"Sempre nesta rotina": a routine\'s card keeps its kind for that routine', () => {
  const decide = (id: string, userId = f.owner.id) =>
    decideApproval({ db: f.db, pubsub: f.pubsub }, userId, f.org.id, id, { decision: "approve", always: true });

  test("offered on its card; approved, this routine's next runs do it without asking, and no other run does", async () => {
    f = await setup();
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const other = await created(gateway, [], "Manda os números do mês por email.");
    const card = asked(await invoke(gateway, await routineRun(f, id), EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY }));
    expect(card.approveAlways).toEqual({ tool: EXEC, actions: ["GMAIL_SEND_EMAIL"], routineId: id });
    expect(approvalView(card, true).approveAlways).toEqual({
      tool: EXEC,
      actions: ["GMAIL_SEND_EMAIL"],
      routineId: id,
    });

    await decide(card.id);
    expect((await routineRow(id))?.ownActions).toEqual(["SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL"]);
    // No rule of the agent: "Aprovado sempre" stays as it was.
    expect(await f.db.select().from(schema.approvalRules)).toEqual([]);
    const audit = await f.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "routine.own_actions_added"));
    expect(audit.map((a) => [a.targetId, a.actorId])).toEqual([[id, f.owner.id]]);

    expect(
      answered(await invoke(gateway, await routineRun(f, id), EXEC, exec("GMAIL_SEND_EMAIL"))).isError,
    ).toBeFalsy();
    expect(mcp.calls.map((c) => c.args)).toEqual([exec("GMAIL_SEND_EMAIL")]);
    // Another routine of the agent still asks.
    asked(await invoke(gateway, await routineRun(f, other.id), EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY }));
    // Undone in the routine's settings: it asks at once.
    await updateRoutine({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, id, {
      ownActions: ["SLACK_SEND_MESSAGE"],
    });
    asked(await invoke(gateway, await routineRun(f, id), EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY }));
  });

  test("a run its report or a teammate's answer woke offers it too, with the same refusals", async () => {
    f = await setup();
    const qa = await teammate(f);
    const { mcp, gateway } = await world(f);
    const { id } = await created(gateway, ["SLACK_SEND_MESSAGE"]);
    const routine = await routineRun(f, id);
    const woken = await reportRun(f, routine.runId);
    const card = asked(await invoke(gateway, woken, EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY }));
    expect(card.approveAlways).toEqual({ tool: EXEC, actions: ["GMAIL_SEND_EMAIL"], routineId: id });
    const answer = await answerRun(f, routine.runId, qa.id);
    expect(asked(await invoke(gateway, answer, EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY })).approveAlways).toEqual(
      { tool: EXEC, actions: ["GMAIL_SEND_EMAIL"], routineId: id },
    );
    // A deletion is never the routine's: the agent's own "Aprovar sempre" is offered instead.
    expect(
      asked(await invoke(gateway, woken, EXEC, { ...exec("SLACK_DELETE_MESSAGE"), why: WHY })).approveAlways,
    ).toEqual({ tool: COMPOSIO_EXECUTOR, actions: ["SLACK_DELETE_MESSAGE"] });

    await decide(card.id);
    expect((await routineRow(id))?.ownActions).toEqual(["SLACK_SEND_MESSAGE", "GMAIL_SEND_EMAIL"]);
    expect(await f.db.select().from(schema.approvalRules)).toEqual([]);
    const next = await reportRun(f, (await routineRun(f, id)).runId);
    expect(answered(await invoke(gateway, next, EXEC, exec("GMAIL_SEND_EMAIL"))).isError).toBeFalsy();
    expect(mcp.calls.map((c) => c.args)).toContainEqual(exec("GMAIL_SEND_EMAIL"));
  });

  test("not on a run that something else joined: it is no longer the routine's job", async () => {
    f = await setup();
    const { gateway } = await world(f);
    const { id } = await created(gateway, []);
    const run = await reportRun(f, (await routineRun(f, id)).runId);
    const joined = await insertMessage(f.db, {
      orgId: f.org.id,
      channelId: f.general.id,
      threadId: run.threadRootId,
      author: { type: "agent", agentId: f.agent.id, runId: null, hop: 0, stretchId: null },
      body: "Manda por email para a diretoria",
    });
    await readJoined(f, run, joined.id);
    const card = asked(await invoke(gateway, run, EXEC, { ...exec("GMAIL_SEND_EMAIL"), why: WHY }));
    expect(card.approveAlways).toEqual({ tool: COMPOSIO_EXECUTOR, actions: ["GMAIL_SEND_EMAIL"] });
  });

  test.each([
    ["a merge", "GITHUB_MERGE_A_PULL_REQUEST"],
    ["a deploy", "VERCEL_CREATE_NEW_DEPLOYMENT"],
    ["a deletion", "SLACK_DELETE_MESSAGE"],
    ["a removal", "NOTION_REMOVE_PAGE"],
    ["a payment", "STRIPE_CREATE_PAYMENT_INTENT"],
    ["a refund", "STRIPE_CREATE_REFUND"],
  ])("never covers %s: its card offers the agent's Aprovar sempre, not the routine's", async (_kind, slug) => {
    f = await setup();
    const { gateway } = await world(f);
    const { id } = await created(gateway, []);
    const card = asked(await invoke(gateway, await routineRun(f, id), EXEC, { ...exec(slug), why: WHY }));
    expect(card.approveAlways).toEqual({ tool: COMPOSIO_EXECUTOR, actions: [slug] });
  });

  test("beside an action it never covers, the whole call is the agent's to approve for good", async () => {
    f = await setup();
    const { gateway } = await world(f);
    const { id } = await created(gateway, []);
    const input = { ...exec("SLACK_SEND_MESSAGE", "SLACK_DELETE_MESSAGE"), why: WHY };
    expect(asked(await invoke(gateway, await routineRun(f, id), EXEC, input)).approveAlways).toEqual({
      tool: COMPOSIO_EXECUTOR,
      actions: ["SLACK_SEND_MESSAGE", "SLACK_DELETE_MESSAGE"],
    });
  });

  test.each(["GMAIL_MOVE_TO_TRASH", "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST", "GOOGLEDOMAINS_RENEW_DOMAIN"])(
    "not for %s: lost data, money or a pull request's approval",
    async (action) => {
      f = await setup();
      const { gateway } = await world(f);
      const { id } = await created(gateway, []);
      const input = { ...exec(action), why: WHY };
      // The agent's own "Aprovar sempre" is offered instead, never the routine's.
      expect(asked(await invoke(gateway, await routineRun(f, id), EXEC, input)).approveAlways).toEqual({
        tool: COMPOSIO_EXECUTOR,
        actions: [action],
      });
    },
  );

  test("not when the routine's creator no longer decides the agent's approvals: own actions would still ask", async () => {
    f = await setup();
    const { gateway } = await world(f);
    const cora = await addMember(f.db, f.org.id, "member", "cora");
    const { id } = await created(gateway, []);
    await f.db.update(schema.routines).set({ createdByUserId: cora.id }).where(eq(schema.routines.id, id));
    const card = asked(
      await invoke(gateway, await routineRun(f, id), EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }),
    );
    expect(card.approveAlways).toEqual({ tool: COMPOSIO_EXECUTOR, actions: ["SLACK_SEND_MESSAGE"] });
  });

  test("not on a routine that has no room left", async () => {
    f = await setup();
    const { gateway } = await world(f);
    const { id } = await created(
      gateway,
      Array.from({ length: 20 }, (_, i) => `SLACK_ACTION_${i}`),
    );
    const card = asked(
      await invoke(gateway, await routineRun(f, id), EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }),
    );
    expect(card.approveAlways).toEqual({ tool: COMPOSIO_EXECUTOR, actions: ["SLACK_SEND_MESSAGE"] });
  });

  test("a routine deleted while it waited: the decision fails and nothing is approved", async () => {
    f = await setup();
    const { gateway } = await world(f);
    const { id } = await created(gateway, []);
    const card = asked(
      await invoke(gateway, await routineRun(f, id), EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }),
    );
    await deleteRoutine({ db: f.db, pubsub: f.pubsub }, f.owner.id, f.org.id, id);
    await expect(decide(card.id)).rejects.toMatchObject({ code: "approval.always_unavailable" });
    const [row] = await f.db.select().from(schema.approvals).where(eq(schema.approvals.id, card.id));
    expect(row?.status).toBe("pending");
  });

  test("someone covering for its owner can't use it: approving for good is never in someone else's name", async () => {
    f = await setup();
    const { gateway } = await world(f);
    const { id } = await created(gateway, []);
    const card = asked(
      await invoke(gateway, await routineRun(f, id), EXEC, { ...exec("SLACK_SEND_MESSAGE"), why: WHY }),
    );
    const bob = await addMember(f.db, f.org.id, "member", "bob");
    await expect(decide(card.id, bob.id)).rejects.toThrow();
    expect((await routineRow(id))?.ownActions).toEqual([]);
  });
});
