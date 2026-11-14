import { afterEach, describe, expect, test } from "bun:test";
import { eq, schema } from "@agenteschat/db";
import {
  addChannelMember,
  approvalView,
  bridgeToolsFor,
  createChannel,
  createMissionRunToolSource,
  createToolGateway,
  createWebToolSource,
  grantScopes,
  insertMessage,
  type RoutineAccess,
  type RoutineBrief,
  type RunAuthority,
  type ToolContext,
  type ToolDefinition,
  type ToolSource,
} from "../src";
import { exposedToolName } from "../src/connectors/mcp";
import { carriesCredential, maskCredentials } from "../src/tool-detail";
import { CREDENTIAL_REFUSAL } from "../src/tools/gateway";
import { REFUSALS, takeWhy, toolKind, toolPolicy, WHY_MIN_CHARS, WHY_REFUSAL, withWhy } from "../src/tools/run-policy";
import { type Fixture, setup } from "./fixtures";

let f: Fixture;
afterEach(async () => {
  const current = f;
  f = undefined as unknown as Fixture;
  await current?.close();
});

const WHY = "Two refunds were asked for the same order today; the second one would charge the customer twice.";

// ── The table, on its own ─────────────────────────────────────────────────────

const briefOf = (access: RoutineAccess): RoutineBrief => ({
  routineId: "00000000-0000-4000-8000-000000000001",
  routineRunId: "00000000-0000-4000-8000-000000000002",
  name: "Pedidos do dia",
  creatorUserId: "user_creator",
  deliverTo: { channelId: "00000000-0000-4000-8000-000000000003", threadId: null },
  access,
  report: "when_new",
  trigger: "schedule",
  dueAt: new Date().toISOString(),
});
const routine = (access: RoutineAccess): RunAuthority => ({ kind: "routine", personId: null, brief: briefOf(access) });
const unattended: RunAuthority = { kind: "unattended", personId: null, reason: "agent" };
/** The run a routine's report woke: what the routine read (inbound mail, a webhook) feeds it. */
const reportWoke: RunAuthority = {
  kind: "unattended",
  personId: null,
  reason: "routine_report",
  brief: briefOf("act"),
};
const person: RunAuthority = { kind: "person", personId: "user_ana" };

const builtIn = (name: string, scope = "") => ({ name, scope, connectionId: null });
const app = (name: string, scope: string, sensitive = false) => ({ name, scope, connectionId: "conn_1", sensitive });
const decide = (authority: RunAuthority, tool: Parameters<typeof toolPolicy>[1]) => toolPolicy(authority, tool).action;

describe("run policy table", () => {
  test("classifies tools by name, scope and whether they are a connected app's", () => {
    expect(toolKind(builtIn("list_issues", "issues:read")).kind).toBe("read");
    expect(toolKind(builtIn("create_issue", "issues:write"))).toEqual({ kind: "internal", area: "issues" });
    expect(toolKind(builtIn("remember", "memory:write"))).toEqual({ kind: "internal", area: "memory" });
    expect(toolKind(builtIn("list_routines", "schedule:write")).kind).toBe("read");
    expect(toolKind(builtIn("create_routine", "schedule:write")).kind).toBe("elsewhere");
    expect(toolKind(builtIn("post_message")).kind).toBe("elsewhere");
    expect(toolKind(builtIn("react")).kind).toBe("here");
    expect(toolKind(builtIn("hand_off")).kind).toBe("hand_off");
    // A tool the table doesn't know: a sensitive one asks a person, any other is only for a person's run.
    expect(toolKind({ ...builtIn("deploy_app"), sensitive: true }).kind).toBe("external");
    expect(toolKind(builtIn("some_new_tool")).kind).toBe("unknown");
    expect(toolKind(app("github_get_issue", "github:issues.read")).kind).toBe("read");
    expect(toolKind(app("github_create_issue", "github:issues.write")).kind).toBe("external");
    expect(toolKind(app("mail_support_send", "mail:send")).kind).toBe("external");
    expect(toolKind(app("mail_support_read", "mail:read")).kind).toBe("read");
    expect(toolKind(app("git_clone", "github:git.read"))).toEqual({ kind: "internal", area: "code" });
    expect(toolKind(app("open_pull_request", "github:pr.write"))).toEqual({ kind: "internal", area: "code" });
    // The connector's own way to open one is the same work; what else it writes to a pull request is the app's.
    expect(toolKind(app("github_create_pull_request", "github:pr.write"))).toEqual({ kind: "internal", area: "code" });
    expect(toolKind(app("github_update_pull_request", "github:pr.write")).kind).toBe("external");
    expect(toolKind(app("github_merge_pull_request", "github:pr.merge", true)).kind).toBe("external");
    // Rewriting a skill is a change, whatever its scope is called.
    expect(toolKind(builtIn("update_skill", "skills:read"))).toEqual({ kind: "internal", area: "skills" });
    expect(toolKind(builtIn("load_skill", "skills:read")).kind).toBe("read");
    // The computer's own background task is code work; the mission's (no scope) is the mission's.
    expect(toolKind(builtIn("start_task", "sandbox:run"))).toEqual({ kind: "internal", area: "code" });
    expect(toolKind(builtIn("start_task")).kind).toBe("mission");
    // A new built-in tool the table doesn't know is never a routine's.
    expect(toolKind(builtIn("brand_new_tool")).kind).toBe("unknown");
    // The Vault (ADR 0144): looking is a read, keeping contacts an internal change.
    expect(toolKind(builtIn("vault_list", "vault:read")).kind).toBe("read");
    expect(toolKind(builtIn("vault_save", "vault:write"))).toEqual({ kind: "internal", area: "vault" });
    expect(toolKind(builtIn("vault_delete", "vault:write"))).toEqual({ kind: "internal", area: "vault" });
  });

  test("routine stored as read (ADR 0109): the same as act, the web and the browser included", () => {
    for (const r of [routine("read"), { kind: "routine", personId: null, brief: null } as RunAuthority]) {
      expect(decide(r, builtIn("web_search"))).toBe("allow");
      expect(decide(r, builtIn("web_fetch"))).toBe("allow");
      expect(decide(r, builtIn("browser_open", "browser:use"))).toBe("allow");
      expect(decide(r, builtIn("browser_fill", "browser:use"))).toBe("allow");
      expect(decide(r, builtIn("create_issue", "issues:write"))).toBe("allow");
      expect(decide(r, app("github_create_issue", "github:issues.write"))).toBe("approve");
      expect(decide(r, builtIn("hand_off"))).toBe("allow");
      for (const name of ["post_message", "send_dm", "ask_agent", "tell_agent"])
        expect(decide(r, builtIn(name))).toBe("allow");
      for (const name of ["schedule_reminder", "create_routine", "request_secret"])
        expect(toolPolicy(r, builtIn(name))).toEqual({ action: "refuse", reason: REFUSALS.routineElsewhere });
      expect(toolPolicy(r, builtIn("ask_user"))).toEqual({ action: "refuse", reason: REFUSALS.routineAskUser });
      expect(toolPolicy(r, builtIn("react"))).toEqual({ action: "refuse", reason: REFUSALS.routineReact });
    }
  });

  test("routine, act: internal changes run, connected apps ask a person, other agents and posts are reached, routines never", () => {
    const r = routine("act");
    expect(decide(r, builtIn("create_issue", "issues:write"))).toBe("allow");
    expect(decide(r, builtIn("update_wiki_page", "wiki:write"))).toBe("allow");
    // A routine uses the Vault for its creator, and may keep contacts there (ADR 0144).
    expect(decide(r, builtIn("vault_list", "vault:read"))).toBe("allow");
    expect(decide(r, builtIn("vault_save", "vault:write"))).toBe("allow");
    expect(decide(r, app("git_clone", "github:git.read"))).toBe("allow");
    expect(decide(r, app("github_create_issue", "github:issues.write"))).toBe("approve");
    expect(decide(r, app("github_merge_pr", "github:pr.merge", true))).toBe("approve");
    expect(decide(r, app("mail_support_send", "mail:send"))).toBe("approve");
    for (const name of ["post_message", "send_dm", "ask_agent", "tell_agent"])
      expect(decide(r, builtIn(name))).toBe("allow");
    // A routine never starts or changes routines, so routines can't feed each other.
    const never = ["create_routine", "update_routine", "run_routine_now", "schedule_reminder"];
    for (const name of never)
      expect(toolPolicy(r, builtIn(name, "schedule:write"))).toEqual({
        action: "refuse",
        reason: REFUSALS.routineElsewhere,
      });
  });

  test("unattended: it works as the agent itself, with every tool a person's run has but hand_off", () => {
    for (const tool of [
      builtIn("react"),
      builtIn("ask_user"),
      builtIn("create_issue", "issues:write"),
      builtIn("update_wiki_page", "wiki:write"),
      builtIn("run_code", "sandbox:run"),
      builtIn("start_task", "sandbox:run"),
      builtIn("browser_do", "browser:use"),
      builtIn("post_message"),
      builtIn("tell_agent"),
      builtIn("ask_agent"),
      builtIn("schedule_reminder", "schedule:write"),
      builtIn("brand_new_tool"),
      app("open_pull_request", "github:pr.write"),
      // A connected app's write follows the tool's own approvals (its access level as the workspace set it).
      app("github_create_issue", "github:issues.write"),
      app("github_merge_pr", "github:pr.merge", true),
    ]) {
      expect(decide(unattended, tool)).toBe("allow");
    }
    expect(toolPolicy(unattended, builtIn("hand_off"))).toEqual({ action: "refuse", reason: REFUSALS.handOffOnly });
  });

  test("a run a routine's report or work woke keeps that routine's bounds, and replies where it is", () => {
    for (const reason of ["routine_report", "routine"] as const) {
      const looks: RunAuthority = { kind: "unattended", personId: null, reason, brief: briefOf("read") };
      const acts: RunAuthority = { kind: "unattended", personId: null, reason, brief: briefOf("act") };
      // Stored as only looking, or unknown: the same as acting now (ADR 0109).
      for (const who of [looks, { ...looks, brief: null }, { kind: "unattended", personId: null, reason } as const]) {
        for (const tool of [
          builtIn("list_issues", "issues:read"),
          builtIn("react"),
          builtIn("ask_user"),
          builtIn("browser_open", "browser:use"),
          builtIn("web_search"),
          builtIn("create_issue", "issues:write"),
          builtIn("tell_agent"),
        ])
          expect(decide(who, tool)).toBe("allow");
        expect(decide(who, app("github_create_issue", "github:issues.write"))).toBe("approve");
      }
      // Set to act: what the routine itself may do, its writes to connected apps asking a person.
      for (const tool of [
        builtIn("browser_open", "browser:use"),
        builtIn("create_issue", "issues:write"),
        builtIn("post_message"),
        builtIn("tell_agent"),
        builtIn("react"),
      ])
        expect(decide(acts, tool)).toBe("allow");
      expect(decide(acts, app("github_merge_pr", "github:pr.merge", true))).toBe("approve");
      // Never beyond what the routine reaches, whatever its access.
      for (const who of [looks, acts]) {
        for (const name of ["request_secret", "create_routine", "schedule_reminder", "brand_new_tool"])
          expect(toolPolicy(who, builtIn(name))).toEqual({ action: "refuse", reason: REFUSALS.fedElsewhere });
        expect(toolPolicy(who, builtIn("hand_off"))).toEqual({ action: "refuse", reason: REFUSALS.handOffOnly });
        expect(toolPolicy(who, builtIn("start_task"))).toEqual({ action: "refuse", reason: REFUSALS.fedMission });
      }
    }
  });

  test("the computer's own permission prompt is listed for every run; a mission's tools never for a routine", () => {
    for (const who of [routine("read"), routine("act"), unattended, person])
      expect(decide(who, builtIn("permission_prompt"))).toBe("allow");
    expect(toolKind(builtIn("get_context")).kind).toBe("read");
    const missionWork: RunAuthority = { kind: "unattended", personId: null, reason: "agent" };
    for (const name of ["start_task", "upload_artifact", "update_plan", "complete_mission", "request_approval"]) {
      // The mission's request_approval has a scope; the built-in one (ADR 0126) any run may use.
      const tool = name === "request_approval" ? builtIn(name, "sandbox:run") : builtIn(name);
      expect(decide(person, tool)).toBe("allow");
      expect(decide(missionWork, tool)).toBe("allow");
      expect(decide(unattended, tool)).toBe("allow");
      expect(toolPolicy(routine("act"), tool)).toEqual({ action: "refuse", reason: REFUSALS.missionOnly });
    }
    // The computer's own background task: code work, so a routine that may act starts one.
    expect(decide(routine("act"), builtIn("start_task", "sandbox:run"))).toBe("allow");
    expect(decide(routine("read"), builtIn("start_task", "sandbox:run"))).toBe("allow");
  });

  test("a routine's own run writes to connected apps as a person's does at risky, while its creator decides", () => {
    const write = app("github_create_issue", "github:issues.write");
    expect(toolPolicy(routine("act"), write, "risky", true)).toEqual({ action: "allow" });
    expect(toolPolicy(routine("act"), write, "risky", false)).toEqual({ action: "approve" });
    expect(toolPolicy(routine("act"), write, "always", true)).toEqual({ action: "approve" });
    expect(toolPolicy(reportWoke, write, "risky", true)).toEqual({ action: "approve" });
  });

  test("connected tools with built-in names keep their external policy", () => {
    expect(exposedToolName("permission", "prompt")).toBe("permission_prompt");
    expect(exposedToolName("start", "task")).toBe("start_task");
    for (const name of ["permission_prompt", "start_task", "hand_off", "post_message", "git_clone"]) {
      const connected = app(name, "custom:conn_1:write");
      expect(toolKind(connected)).toEqual({ kind: "external" });
      expect(decide(routine("read"), connected)).toBe("approve");
      expect(decide(routine("act"), connected)).toBe("approve");
      // Nobody behind the run: the connector's own approvals decide, as for a person's run.
      expect(decide(unattended, connected)).toBe("allow");
      expect(decide(reportWoke, connected)).toBe("approve");
      expect(decide({ ...reportWoke, reason: "routine" }, connected)).toBe("approve");
    }
  });

  test("person: unchanged (only hand_off, which is background work's)", () => {
    for (const tool of [
      builtIn("post_message"),
      builtIn("send_dm"),
      builtIn("create_routine", "schedule:write"),
      builtIn("ask_user"),
      app("github_create_issue", "github:issues.write"),
      app("github_merge_pr", "github:pr.merge", true),
    ]) {
      expect(decide(person, tool)).toBe("allow");
    }
    expect(toolPolicy(person, builtIn("hand_off"))).toEqual({ action: "refuse", reason: REFUSALS.handOffOnly });
  });

  test("why: added to the schema as required, taken out of the input, too short is no reason", () => {
    const schemaDef = { type: "object", properties: { order: { type: "string" } }, required: ["order"] };
    const listed = withWhy(schemaDef);
    expect(listed.required).toEqual(["order", "why"]);
    expect((listed.properties as Record<string, { minLength?: number }>).why?.minLength).toBe(WHY_MIN_CHARS);
    expect(withWhy(listed)).toEqual(listed);
    expect(takeWhy(schemaDef, { order: "7", why: WHY })).toEqual({ why: WHY, input: { order: "7" } });
    expect(takeWhy(schemaDef, { order: "7", why: "because" })).toEqual({ why: null, input: { order: "7" } });
    expect(takeWhy(schemaDef, { order: "7" }).why).toBeNull();
  });
});

// ── The gateway applies it: listing, every call, the bridge ──────────────────

const CONNECTION = "00000000-0000-4000-8000-0000000000aa";
const executed: Record<string, unknown>[] = [];

/** A connected app with one read and one write (no network). */
const appSource: ToolSource = {
  name: "acme-shop",
  tools: async () => [
    {
      name: "shop_list_orders",
      description: "List today's orders.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      scope: "shop:orders.read",
      connectionId: CONNECTION,
      connectorLabel: "Shop",
      execute: async () => ({ content: "2 orders" }),
    },
    {
      name: "shop_refund_order",
      description: "Refund an order.",
      inputSchema: {
        type: "object",
        properties: { order: { type: "string" } },
        required: ["order"],
        additionalProperties: false,
      },
      scope: "shop:orders.write",
      connectionId: CONNECTION,
      connectorLabel: "Shop",
      describe: (input) => ({ title: `Refund order ${String(input.order)}` }),
      execute: async (input) => {
        executed.push(input);
        return { content: "refunded" };
      },
    },
  ],
};

async function gatewaySetup() {
  executed.length = 0;
  f = await setup({
    chatTools: true,
    react: true,
    askUser: true,
    handOff: true,
    issueTools: true,
    scheduleTools: true,
    askAgent: true,
    toolSources: [appSource],
  });
  await grantScopes(f.db, f.org.id, f.agent.id, [{ connectionId: null, scope: "*" }]);
}

type Kind = "person" | "unattended" | "report" | RoutineAccess;

/**
 * A run of the agent in #general and its tool context: a person's, an unattended one (`report`: woken by a
 * routine's report), or a routine's.
 */
async function runAs(kind: Kind) {
  const brief =
    kind === "read" || kind === "act"
      ? { ...briefOf(kind), deliverTo: { channelId: f.general.id, threadId: null } }
      : null;
  const trigger = await insertMessage(f.db, {
    orgId: f.org.id,
    channelId: f.general.id,
    author:
      kind === "unattended" || kind === "report"
        ? { type: "agent", agentId: f.agent.id, runId: null, hop: 1, stretchId: null }
        : { type: "person", userId: f.owner.id },
    body: brief ? "Check today's orders." : "hi",
    meta: brief
      ? { routineBrief: brief }
      : kind === "report"
        ? { notice: { kind: "routine_handoff", text: "hi", from: "Routine", refs: { runId: crypto.randomUUID() } } }
        : undefined,
  });
  const [run] = await f.db
    .insert(schema.agentRuns)
    .values({
      orgId: f.org.id,
      agentId: f.agent.id,
      channelId: f.general.id,
      threadRootId: trigger.id,
      triggerMessageId: trigger.id,
      trigger: "mention",
      hop: 1,
      ...(brief ? { background: true } : {}),
    })
    .returning();
  if (!run) throw new Error("no run");
  const ctx: ToolContext = {
    db: f.db,
    orgId: f.org.id,
    agentId: f.agent.id,
    runId: run.id,
    channelId: run.channelId,
    threadRootId: run.threadRootId,
    triggerMessageId: run.triggerMessageId,
    ...(brief ? { background: true } : {}),
  };
  return { run, ctx, brief };
}

const tools = () => {
  if (!f.tools) throw new Error("no tools");
  return f.tools;
};
const listed = async (ctx: ToolContext) => new Map((await tools().list(ctx)).map((t) => [t.name, t]));
const call = (ctx: ToolContext, name: string, input: Record<string, unknown>) =>
  tools().invoke(ctx, { toolUseId: `tu_${name}_${crypto.randomUUID()}`, name, input });
const requiresWhy = (t: ToolDefinition | undefined) =>
  Array.isArray(t?.inputSchema.required) && ((t?.inputSchema.required ?? []) as string[]).includes("why");

describe("the gateway applies the run policy", () => {
  test("a connector cannot shadow a built-in with the same name", async () => {
    await gatewaySetup();
    const { ctx } = await runAs("person");
    const custom: ToolSource = {
      name: "custom",
      tools: async () => [
        {
          name: "permission_prompt",
          description: "External prompt",
          inputSchema: { type: "object" },
          scope: "custom:conn_1:write",
          connectionId: CONNECTION,
          execute: async () => ({ content: "external" }),
        },
      ],
    };
    const builtin: ToolSource = {
      name: "computer",
      tools: async () => [
        {
          name: "permission_prompt",
          description: "Computer permission prompt",
          inputSchema: { type: "object" },
          scope: "",
          connectionId: null,
          execute: async () => ({ content: "computer" }),
        },
      ],
    };
    const gateway = createToolGateway({ sources: [custom, builtin] });
    expect((await gateway.list(ctx)).find((t) => t.name === "permission_prompt")?.description).toBe(
      "Computer permission prompt",
    );
  });

  test("a connector cannot shadow server-owned Git tools", async () => {
    await gatewaySetup();
    const { ctx } = await runAs("person");
    const custom: ToolSource = {
      name: "connectors",
      tools: async () =>
        ["git_clone", "open_pull_request", "delete_branches", "request_branch_push"].map((name) => ({
          name,
          description: `External ${name}`,
          inputSchema: { type: "object" },
          scope: "custom:conn_1:write",
          connectionId: CONNECTION,
          execute: async () => ({ content: "external" }),
        })),
    };
    const serverGit: ToolSource = {
      name: "git",
      tools: async () =>
        [
          { name: "git_clone", scope: "github:git.read" },
          { name: "open_pull_request", scope: "github:pr.write" },
          { name: "delete_branches", scope: "github:git.write" },
          { name: "request_branch_push", scope: "github:git.write" },
        ].map(({ name, scope }) => ({
          name,
          description: `Server ${name}`,
          inputSchema: { type: "object" },
          scope,
          connectionId: CONNECTION,
          execute: async () => ({ content: "server" }),
        })),
    };
    const gateway = createToolGateway({ sources: [custom, serverGit] });
    const names = new Map((await gateway.list(ctx)).map((tool) => [tool.name, tool.description]));
    expect(names.get("git_clone")).toBe("Server git_clone");
    expect(names.get("open_pull_request")).toBe("Server open_pull_request");
    expect(names.get("delete_branches")).toBe("Server delete_branches");
    expect(names.get("request_branch_push")).toBe("Server request_branch_push");
  });

  test("routine stored as read: listed like one that acts; what speaks for someone is refused with the reason", async () => {
    await gatewaySetup();
    const { ctx } = await runAs("read");
    const names = await listed(ctx);
    for (const name of ["react", "ask_user", "create_routine"]) expect(names.has(name)).toBe(false);
    for (const name of [
      "list_issues",
      "shop_list_orders",
      "hand_off",
      "create_issue",
      "post_message",
      "shop_refund_order",
    ])
      expect(names.has(name)).toBe(true);
    expect(await call(ctx, "react", { emoji: "👍" })).toMatchObject({
      type: "result",
      output: { isError: true, content: REFUSALS.routineReact },
    });
    expect(await call(ctx, "shop_list_orders", {})).toMatchObject({
      type: "result",
      output: { content: expect.stringContaining("2 orders") },
    });
    expect(executed).toEqual([]);
  });

  test("routine, act: issue writes run; a connected app's write asks a person, with origin and why", async () => {
    await gatewaySetup();
    const { ctx, brief } = await runAs("act");
    const names = await listed(ctx);
    expect(names.has("create_issue")).toBe(true);
    expect(requiresWhy(names.get("create_issue"))).toBe(false);
    const refund = names.get("shop_refund_order");
    expect(refund?.sensitive).toBe(true);
    expect(requiresWhy(refund)).toBe(true);
    expect(names.has("post_message")).toBe(true);
    expect(names.has("tell_agent")).toBe(true);
    expect(names.has("create_routine")).toBe(false);

    const result = await call(ctx, "shop_refund_order", { order: "7", why: WHY });
    if (result.type !== "approval") throw new Error(`expected an approval, got ${JSON.stringify(result)}`);
    expect(result.approval).toMatchObject({
      why: WHY,
      params: { order: "7" },
      channelId: f.general.id,
      origin: { kind: "routine", routineId: brief?.routineId, routineName: "Pedidos do dia" },
    });
    expect(approvalView(result.approval)).toMatchObject({
      why: WHY,
      origin: { kind: "routine", routineId: brief?.routineId, routineName: "Pedidos do dia" },
    });
    expect(executed).toEqual([]);
  });

  test("a command the computer held asks in the chat the same way for a routine: with why, where it reports, with its origin", async () => {
    await gatewaySetup();
    await grantScopes(f.db, f.org.id, f.agent.id, [{ connectionId: null, scope: "sandbox:run" }]);
    const ran: { input: Record<string, unknown>; approved: boolean }[] = [];
    // A computer tool like run_code: a call that says why asks a person first.
    const computer: ToolSource = {
      name: "computer",
      tools: async () => [
        {
          name: "run_code",
          description: "Run code on the computer.",
          inputSchema: {
            type: "object",
            properties: { code: { type: "string" }, why: { type: "string" } },
            required: ["code"],
            additionalProperties: false,
          },
          scope: "sandbox:run",
          whyAsks: true,
          describe: (input) => ({ title: "Run bash code", detail: String(input.code) }),
          execute: async (input, c) => {
            ran.push({ input, approved: c.approved === true });
            return { content: "ran" };
          },
        },
      ],
    };
    const gateway = createToolGateway({ sources: [computer] });
    const push = (ctx: ToolContext, why?: string) =>
      gateway.invoke(ctx, {
        toolUseId: `tu_${crypto.randomUUID()}`,
        name: "run_code",
        input: { code: "git push origin main", ...(why ? { why } : {}) },
      });
    const { ctx, brief } = await runAs("act");
    expect(await push(ctx)).toMatchObject({ type: "result", output: { content: "ran" } });
    const result = await push(ctx, WHY);
    if (result.type !== "approval") throw new Error(`expected an approval, got ${JSON.stringify(result)}`);
    expect(result.approval).toMatchObject({
      tool: "run_code",
      why: WHY,
      channelId: f.general.id,
      origin: { kind: "routine", routineId: brief?.routineId, routineName: "Pedidos do dia" },
    });
    expect(ran).toEqual([{ input: { code: "git push origin main" }, approved: false }]);
    await gateway.executeApproved(ctx, { ...result.approval, status: "approved" });
    expect(ran.at(-1)).toEqual({ input: { code: "git push origin main", why: WHY }, approved: true });
    // A routine stored as only reading runs commands too (ADR 0109).
    const read = await runAs("read");
    expect(await push(read.ctx)).toMatchObject({ type: "result", output: { content: "ran" } });
  });

  test("unattended: it lists what a person's run lists and works as the agent itself", async () => {
    await gatewaySetup();
    const tech = await createChannel(f.db, f.owner.id, f.org.id, { name: "tech" });
    await addChannelMember(f.db, f.owner.id, f.org.id, tech.id, { agentId: f.agent.id });
    await createChannel(f.db, f.owner.id, f.org.id, { name: "vendas" });
    const { ctx } = await runAs("unattended");
    const names = await listed(ctx);
    for (const name of [
      "post_message",
      "send_dm",
      "schedule_reminder",
      "ask_agent",
      "tell_agent",
      "react",
      "ask_user",
    ]) {
      expect(names.has(name)).toBe(true);
    }
    expect(names.has("hand_off")).toBe(false);
    expect(requiresWhy(names.get("ask_user"))).toBe(true);
    // A connected app's write follows its own approvals: this one runs without a card, as for a person.
    expect(names.get("shop_refund_order")?.sensitive).toBeUndefined();
    expect(await call(ctx, "shop_refund_order", { order: "9" })).toMatchObject({
      type: "result",
      output: { content: "refunded" },
    });
    expect(executed).toEqual([{ order: "9" }]);
    // It posts as itself, only where it is a member.
    expect(await call(ctx, "post_message", { channel: "tech", text: "Erro novo no checkout." })).toMatchObject({
      type: "result",
      output: { content: expect.stringContaining("Posted in #tech") },
    });
    expect(await call(ctx, "post_message", { channel: "vendas", text: "oi" })).toMatchObject({
      output: { isError: true, content: "No channel #vendas that you are in." },
    });
    // A DM is a person's request: the tool says so.
    expect(await call(ctx, "send_dm", { person: "ana", text: "oi" })).toMatchObject({
      output: { isError: true, content: "Only a person's request can send a DM." },
    });
  });

  test("person: unchanged, except hand_off and the why on what asks a person", async () => {
    await gatewaySetup();
    const { ctx } = await runAs("person");
    const names = await listed(ctx);
    for (const name of ["post_message", "send_dm", "react", "ask_user", "create_issue", "schedule_reminder"]) {
      expect(names.has(name)).toBe(true);
    }
    expect(names.has("hand_off")).toBe(false);
    // Not a write anybody approves for a person: it runs as before.
    expect(names.get("shop_refund_order")?.sensitive).toBeUndefined();
    expect(await call(ctx, "shop_refund_order", { order: "3" })).toMatchObject({
      type: "result",
      output: { content: "refunded" },
    });
    expect(executed).toEqual([{ order: "3" }]);
  });

  test("a run a routine's reading feeds never sends a credential, through any tool; any other run uses the agent's own grants", async () => {
    await gatewaySetup();
    const key = "AKIAIOSFODNN7EXAMPLE";
    const privateKey =
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----";
    // A routine's own run, and the run its report woke (what it read may be a stranger's email).
    for (const kind of ["read", "report"] as const) {
      const fedCtx = (await runAs(kind)).ctx;
      for (const query of [`customer ${key}`, privateKey]) {
        expect(await call(fedCtx, "list_issues", { query })).toMatchObject({
          type: "result",
          output: { isError: true, content: CREDENTIAL_REFUSAL, data: { code: "tool.credential" } },
        });
      }
      // Anything else still runs.
      const fine = await call(fedCtx, "list_issues", { query: "checkout" });
      expect(fine.type === "result" && fine.output.isError).toBeFalsy();
    }
    // The run a report woke asks a person before a connected app's write.
    const report = (await runAs("report")).ctx;
    const refund = await call(report, "shop_refund_order", { order: "7", why: WHY });
    if (refund.type !== "approval") throw new Error(`expected an approval, got ${JSON.stringify(refund)}`);
    expect(refund.approval).toMatchObject({ origin: { kind: "unattended" } });
    expect(executed).toEqual([]);
    for (const kind of ["unattended", "person"] as const) {
      const { ctx } = await runAs(kind);
      const asked = await call(ctx, "list_issues", { query: `customer ${key}` });
      expect(asked.type === "result" && asked.output.content).not.toBe(CREDENTIAL_REFUSAL);
    }
  });

  test("credentials by their format: found in any value, masked in what people read", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";
    expect(carriesCredential({ query: "AKIAIOSFODNN7EXAMPLE" })).toBe(true);
    expect(carriesCredential(`a key:\n${pem}`)).toBe(true);
    expect(carriesCredential({ query: "checkout errors since Monday" })).toBe(false);
    expect(maskCredentials(`found ${pem} in the repo, and ghp_abcdefghijklmnopqrstuvwxyz0123`)).toBe(
      "found •••• in the repo, and ••••",
    );
  });

  test("Claude Code's prompt tool reaches a routine's run through the bridge (or Claude Code won't start)", async () => {
    await gatewaySetup();
    const { run } = await runAs("read");
    const gateway = createToolGateway({ sources: [createMissionRunToolSource({ pubsub: f.pubsub } as never)] });
    const bridged = await bridgeToolsFor(
      { db: f.db, pubsub: f.pubsub, tools: gateway },
      { orgId: f.org.id, agentId: f.agent.id, runId: run.id, machineId: crypto.randomUUID() },
    );
    expect(bridged.map((t) => t.name)).toContain("permission_prompt");
  });

  test("a computer brain (Codex, Claude Code) gets the web through the bridge, beside the browser", async () => {
    await gatewaySetup();
    const { run } = await runAs("person");
    const gateway = createToolGateway({
      sources: [createWebToolSource({ fetch: async () => new Response(""), resolveHost: async () => [] })],
    });
    const bridged = await bridgeToolsFor(
      { db: f.db, pubsub: f.pubsub, tools: gateway },
      { orgId: f.org.id, agentId: f.agent.id, runId: run.id, machineId: crypto.randomUUID() },
    );
    expect(bridged.map((t) => t.name).sort()).toEqual(["web_fetch", "web_search"]);
  });

  test("the bridge lists exactly what the model loop does, why included", async () => {
    await gatewaySetup();
    for (const kind of ["read", "act", "unattended", "person"] as const) {
      const { run, ctx } = await runAs(kind);
      const loop = await tools().list(ctx);
      const bridged = await bridgeToolsFor(
        { db: f.db, pubsub: f.pubsub, tools: tools() },
        { orgId: f.org.id, agentId: f.agent.id, runId: run.id, machineId: "" },
      );
      expect(bridged.map((t) => t.name).sort()).toEqual(loop.map((t) => t.name).sort());
      const refund = bridged.find((t) => t.name === "shop_refund_order");
      // Only a routine's write to a connected app is made to ask a person; the others follow the tool's own rule.
      expect(((refund?.inputSchema.required ?? []) as string[]).includes("why")).toBe(
        kind === "act" || kind === "read",
      );
    }
  });
});

describe("why: required on every call that asks a person", () => {
  const sensitiveSource: ToolSource = {
    name: "danger",
    tools: async () => [
      {
        name: "shop_delete_customer",
        description: "Delete a customer.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
        scope: "shop:customers.delete",
        connectionId: CONNECTION,
        sensitive: true,
        execute: async () => ({ content: "deleted" }),
      },
    ],
  };

  test("missing or short why is refused, no approval; a good one is kept on the approval, not its params", async () => {
    f = await setup({ askUser: true, toolSources: [sensitiveSource] });
    await grantScopes(f.db, f.org.id, f.agent.id, [{ connectionId: null, scope: "*" }]);
    const { ctx } = await runAs("person");
    const listedTool = (await tools().list(ctx)).find((t) => t.name === "shop_delete_customer");
    expect(requiresWhy(listedTool)).toBe(true);

    expect(await call(ctx, "shop_delete_customer", { id: "c1" })).toEqual({
      type: "result",
      output: { content: WHY_REFUSAL, isError: true, data: { code: "tool.why_missing" } },
    });
    expect(await call(ctx, "shop_delete_customer", { id: "c1", why: "  short  " })).toMatchObject({
      output: { content: WHY_REFUSAL, isError: true },
    });
    expect(await f.db.select().from(schema.approvals)).toEqual([]);

    const result = await call(ctx, "shop_delete_customer", { id: "c1", why: `  ${WHY}  ` });
    if (result.type !== "approval") throw new Error("expected an approval");
    const [row] = await f.db.select().from(schema.approvals).where(eq(schema.approvals.id, result.approval.id));
    expect(row?.why).toBe(WHY);
    expect(row?.params).toEqual({ id: "c1" });
    expect(row?.origin).toBeNull();
    expect(approvalView(result.approval).why).toBe(WHY);
  });

  test("ask_user takes a why too and hands it on with the question", async () => {
    f = await setup({ askUser: true });
    const { ctx } = await runAs("person");
    expect(await call(ctx, "ask_user", { question: "Which store?" })).toMatchObject({
      output: { content: WHY_REFUSAL, isError: true },
    });
    expect(await call(ctx, "ask_user", { question: "Which store?", choices: ["Centro", "Norte"], why: WHY })).toEqual({
      type: "question",
      text: "Which store?",
      choices: ["Centro", "Norte"],
      requestedForUserId: null,
      why: WHY,
    });
  });
});
