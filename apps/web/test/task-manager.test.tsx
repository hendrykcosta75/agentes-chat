import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import type {
  AiAccounts,
  CanceledReturn,
  ComputerQueue,
  EndedTask,
  ManagedTask,
  Message,
  PendingReturn,
  RunStep,
  TaskManagerView,
  TaskSteps,
  TaskWait,
  WorkingRun,
} from "@agenteschat/client";
import { keys, TASK_MANAGER_POLL_MS } from "@agenteschat/client";
import { formatTime } from "@agenteschat/client/lib/format";
import { usageWhenShort } from "@agenteschat/client/lib/plan-usage";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { ADA_ID, ATLAS_ID, createFakeApi, ENG_ID, type FakeState, fakeMachinesOf, ORG_ID, seedState } from "./fake-api";
import { renderApp, screen, settle, showIn } from "./render";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const DM_ADA = "dm-ada";
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const in_ = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
const click = async (el: Element) => {
  await act(async () => fireEvent.click(el));
  await settle(3);
};
const type = (el: Element, value: string) => act(async () => fireEvent.change(el, { target: { value } }));

const using = (tool: string, detail: string | null, connector: string | null = null) => ({
  tool,
  detail,
  connector,
  service: connector,
  serviceIcon: null,
  at: ago(0),
});

const task = (over: Partial<ManagedTask> & Pick<ManagedTask, "runId" | "agentId">): ManagedTask => ({
  channelId: ENG_ID,
  channelKind: "channel",
  channelName: "eng",
  threadId: null,
  status: "running",
  startedAt: ago(5),
  createdAt: ago(5),
  label: null,
  background: false,
  routine: null,
  plan: null,
  requester: { userId: "u-walter", name: "Walter" },
  brain: "model",
  machine: null,
  now: null,
  steps: 1,
  pendingMessageIds: [],
  canStop: true,
  ...over,
});

const ended = (over: Partial<EndedTask> & Pick<EndedTask, "runId" | "agentId" | "status">): EndedTask => ({
  channelId: ENG_ID,
  channelKind: "channel",
  channelName: "eng",
  threadId: null,
  label: null,
  background: false,
  routine: null,
  startedAt: ago(90),
  finishedAt: ago(84),
  stoppedBy: null,
  ...over,
});

/**
 * Ada fixes a link in her DM with me (Claude Code, in her browser, on the MacBook), waits for an ok on a PR in #eng
 * and runs her backups routine; Atlas looks into a slow API on our servers, for 41 minutes now.
 */
function busy(): TaskManagerView {
  const line = (peak: number) => Array.from({ length: 60 }, (_, i) => (i % 7 === 0 ? peak : 1));
  return {
    tasks: [
      task({
        runId: "r-link",
        agentId: ADA_ID,
        channelId: DM_ADA,
        channelKind: "dm",
        channelName: null,
        label: "Corrigir o link de cancelar",
        brain: "claude_code",
        machine: { id: "machine_1", name: "MacBook" },
        now: using("browser_do", "página de cancelar"),
        startedAt: ago(6),
        createdAt: ago(6),
      }),
      task({
        runId: "r-pr",
        agentId: ADA_ID,
        status: "waiting_approval",
        label: "Revisar o PR #231",
        requester: { userId: "u-joao", name: "João" },
        now: using("github_merge_pull_request", "PR #231", "github"),
        startedAt: ago(18),
        createdAt: ago(18),
      }),
      task({
        runId: "r-api",
        agentId: ATLAS_ID,
        label: "Investigar a lentidão da API",
        now: using("run_code", "consultas lentas"),
        startedAt: ago(41),
        createdAt: ago(41),
      }),
      task({
        runId: "r-backup",
        agentId: ADA_ID,
        background: true,
        routine: { id: "rt-backup", name: "Backups" },
        channelName: null,
        requester: null,
        now: using("run_code", "conferindo arquivos"),
        startedAt: ago(10),
        createdAt: ago(10),
      }),
    ],
    ended: [
      ended({ runId: "r-week", agentId: ATLAS_ID, status: "done", label: "Resumo da semana" }),
      ended({
        runId: "r-tickets",
        agentId: ADA_ID,
        status: "canceled",
        label: "Responder os tickets",
        stoppedBy: { userId: "u-joao", name: "João" },
        // A minute before the summary: two `ago(84)` read on either side of a millisecond would swap the rows.
        startedAt: ago(91),
        finishedAt: ago(85),
      }),
    ],
    activity: { [ADA_ID]: line(4), [ATLAS_ID]: line(2) },
  };
}

/** Ada's steps on the link so far: her browser, done; the issues she reads now (no result yet). */
function linkSteps(): TaskSteps {
  const step = (seq: number, kind: string, data: Record<string, unknown>): RunStep => ({
    seq,
    kind,
    data,
    createdAt: ago(6 - seq),
  });
  return {
    run: { createdAt: ago(6), finishedAt: null },
    steps: [
      step(1, "tool_call", { name: "browser_do", toolUseId: "u1", detail: "página de cancelar" }),
      step(2, "tool_result", { toolUseId: "u1", content: "Abriu a página." }),
      step(3, "tool_call", { name: "list_issues", toolUseId: "u2" }),
    ],
  };
}

/**
 * Busy, plus Ada's checkout waiting for room on the MacBook (1º of 3, mine, due in about 3 min) and Atlas's report
 * waiting on a full computer whose line isn't known; the MacBook's line as the server says it: Ada's link working,
 * then my checkout, João's request and a turn Ada asked Atlas for.
 */
function withLine() {
  const view = busy();
  view.tasks.push(
    task({
      runId: "r-checkout",
      agentId: ADA_ID,
      status: "waiting_input",
      held: "computer_busy",
      line: { machineId: "machine_1", position: 1, of: 3, people: true, estimatedStartAt: in_(3) },
      label: "Ajustar o texto do checkout",
      machine: { id: "machine_1", name: "MacBook" },
      startedAt: ago(4),
      createdAt: ago(4),
    }),
    task({
      runId: "r-report",
      agentId: ATLAS_ID,
      status: "waiting_input",
      held: "computer_busy",
      label: "Gerar o relatório",
      machine: { id: "machine_2", name: "Servidor" },
      startedAt: ago(2),
      createdAt: ago(2),
    }),
  );
  view.computers = [
    { id: "machine_1", name: "MacBook", working: 1, inLine: 3 },
    { id: "machine_2", name: "Servidor", working: 0, inLine: 0 },
  ];
  const where = { channelId: ENG_ID, threadId: null };
  const me = { kind: "person" as const, userId: "u-walter" };
  const queue: ComputerQueue = {
    machineId: "machine_1",
    name: "MacBook",
    working: [
      {
        runId: "r-link",
        agentId: ADA_ID,
        purpose: me,
        where: { channelId: DM_ADA, threadId: null },
        startedAt: ago(6),
        estimatedEndAt: in_(3),
      },
    ],
    waiting: [
      {
        runId: "r-checkout",
        agentId: ADA_ID,
        purpose: me,
        where,
        people: true,
        position: 1,
        estimatedStartAt: in_(3),
        after: [ADA_ID],
      },
      {
        runId: "r-other",
        agentId: ATLAS_ID,
        purpose: { kind: "person", userId: "u-joao" },
        where,
        people: true,
        position: 2,
        estimatedStartAt: null,
        after: [ADA_ID],
      },
      {
        runId: "r-asked",
        agentId: ATLAS_ID,
        purpose: { kind: "agent", agentId: ADA_ID },
        where,
        people: false,
        position: 3,
        estimatedStartAt: null,
        after: [ADA_ID, ATLAS_ID],
      },
    ],
  };
  return { view, queue };
}

const NOVA_ID = "00000000-0000-4000-8000-0000000000a9";
const NOVA_NAME = "Assistente de Atendimento Internacional";
const LONG_TITLE = "Levantar as cobranças duplicadas do último trimestre e preparar um resumo ao time";
const LONG_NAME = "Maria Eduarda Albuquerque";

/**
 * Busy, with everything long: an agent with a long name, a title of 80 characters asked in a long channel by someone
 * with a long name, with its plan and helpers; work it asked of Atlas; a routine and a computer with long names; one
 * that ended, stopped by that person.
 */
function worstCase() {
  const view = busy();
  view.tasks.push(
    task({
      runId: "r-long",
      agentId: NOVA_ID,
      label: LONG_TITLE,
      channelName: "atendimento-internacional-e-cobrancas",
      requester: { userId: "u-maria", name: LONG_NAME },
      plan: { done: 9, total: 14 },
      helpers: 3,
      brain: "claude_code",
      now: using("run_code", "bun scripts/cobrancas-duplicadas.ts --desde 2026-07-01 --formato csv --saida rel"),
      startedAt: ago(73),
      createdAt: ago(73),
    }),
    task({
      runId: "r-asked-long",
      agentId: ATLAS_ID,
      label: "Conferir as notas fiscais emitidas para clientes do exterior neste mês",
      requester: null,
      delegation: { agentId: NOVA_ID, origin: { kind: "person", userId: "u-maria", name: LONG_NAME } },
      status: "waiting_input",
      held: "plan",
      wait: {
        code: "usage_pause",
        key: "plan:atlas",
        plan: "Claude",
        model: null,
        scope: null,
        percent: 95,
        window: "seven_day",
        resetsAt: in_(3 * 24 * 60),
        since: ago(30),
        canContinue: false,
      },
      startedAt: ago(30),
      createdAt: ago(30),
    }),
    task({
      runId: "r-routine-long",
      agentId: NOVA_ID,
      background: true,
      routine: { id: "rt-long", name: "Conciliação diária das cobranças internacionais" },
      channelName: null,
      requester: null,
      now: using("browser_do", "loja.example/checkout/pedidos/2026/11/confirmacao-de-pagamento-pendente-de-revisao"),
      startedAt: ago(12),
      createdAt: ago(12),
    }),
    task({
      runId: "r-routine-ok",
      agentId: ADA_ID,
      status: "waiting_approval",
      background: true,
      routine: { id: "rt-refunds", name: "Revisão semanal das devoluções internacionais pendentes de aprovação" },
      channelName: null,
      requester: null,
      now: using("send_email", "clientes do exterior com devolução pendente"),
      startedAt: ago(26),
      createdAt: ago(26),
    }),
  );
  view.ended.push(
    ended({
      runId: "r-ended-long",
      agentId: NOVA_ID,
      status: "canceled",
      label: "Responder os clientes que pediram reembolso em dobro no último fim de semana",
      channelName: "atendimento-internacional-e-cobrancas",
      stoppedBy: { userId: "u-maria", name: LONG_NAME },
    }),
  );
  view.computers = [
    { id: "machine_1", name: "MacBook Pro da equipe de atendimento internacional", working: 2, inLine: 3 },
  ];
  const state = seedState({ taskManager: view });
  const base = state.agents[0];
  if (base) state.agents.push({ ...base, id: NOVA_ID, name: NOVA_NAME, handle: "atendimento" });
  return { state, view };
}

/** Me with a DM with Ada (`dm-ada`), and the task manager when given. */
function withDm(over: Partial<FakeState> = {}) {
  const state = seedState(over);
  state.dms.push({ channelId: DM_ADA, with: { type: "agent", id: ADA_ID, name: "Ada", handle: "ada" } });
  state.channelMembers[DM_ADA] = [
    { type: "person", id: "u-walter" },
    { type: "agent", id: ADA_ID },
  ];
  return state;
}

/** The page at `path`; `queue`: a computer's line, as its dialog reads it. */
const open = async (state: FakeState, path: string, queue?: ComputerQueue) => {
  const api = createFakeApi(state);
  if (queue) fakeMachinesOf.get(api)?.setQueue(queue);
  const r = await renderApp(`/org/${ORG_ID}/${path}`, { api });
  await settle(6);
  return r;
};
/** A task's row on the page, by its title (the button that picks it). */
const rowOf = (title: string) => screen().getByRole("button", { name: title }).closest(".tm-row") as HTMLElement;
/** An agent's row in the table (in `inside`, when two sections both have it), and the press that opens its tasks. */
const agentToggle = (name: string, inside: HTMLElement = document.body) =>
  within(inside).getByRole("button", { name: `Mostrar ou esconder as tarefas de ${name}` });
const agentRowOf = (name: string, inside?: HTMLElement) => agentToggle(name, inside).closest(".tm-row") as HTMLElement;
/** Its tasks start folded: opens them. */
const openAgent = (name: string, inside?: HTMLElement) => click(agentToggle(name, inside));
function cardOf(name: string) {
  const cards = [...document.querySelectorAll<HTMLElement>(".tm-card")];
  return cards.find((c) => c.querySelector(".tm-card__text b")?.textContent === name) as HTMLElement;
}
const cardPress = (name: string) => cardOf(name).querySelector(".tm-card__text") as HTMLElement;
/** What a row's one line leaves to its tip, as a screen reader hears it: its button's description, a fact a sentence. */
const tipOf = (row: HTMLElement) => row.querySelector(".tm-hit")?.getAttribute("aria-description") ?? "";
/** A waiting row's state: what holds it, on its line, then what comes next, in its tip. */
const stateOf = (row: HTMLElement) => {
  const state = [...row.querySelectorAll(".tm-cell--state .tm-state__text > *")].map((el) => el.textContent ?? "");
  const next = tipOf(row)
    .split(". ")
    .find((fact) => fact.startsWith(`${state[0]} · `))
    ?.slice(`${state[0]} · `.length);
  return next ? [...state, next] : state;
};
const stopCalls = (state: FakeState) =>
  state.calls.filter((c) => c.method === "agents.cancelRun").map((c) => c.args.slice(1));

describe("the task manager page", () => {
  test("the agents as cards, then the tasks by agent with what each uses and how long; no money", async () => {
    const state = seedState({ taskManager: busy() });
    await open(state, "task-manager");
    expect(screen().getByRole("heading", { level: 1 }).textContent).toBe("Gerenciador de tarefas");
    expect(document.querySelector(".tm-sum")?.textContent).toBe("3 trabalhando1 espera você");
    const calls = state.calls.filter((c) => c.method === "working.taskManager");
    expect(calls.length).toBeGreaterThan(0);
    // The page shows today's count, so every call of it asks for one.
    expect(calls.every((c) => c.args[0] === ORG_ID && c.args[2] === true)).toBe(true);

    // Todos first and chosen, then each agent with its tasks and who waits on it, each with its line.
    const cards = [...document.querySelectorAll<HTMLElement>(".tm-card")];
    expect(cards.map((c) => c.querySelector(".tm-card__text")?.textContent)).toEqual([
      "Todos4 tarefas",
      "Atlas1 tarefa",
      "Ada3 tarefas",
    ]);
    expect(cards[0]?.querySelector(".tm-card__text")?.getAttribute("aria-pressed")).toBe("true");
    expect(cardOf("Ada").querySelector(".tm-card__wait")?.getAttribute("aria-label")).toBe("1 espera você");
    expect(cardOf("Ada").querySelector(".chart-spark")?.getAttribute("aria-label")).toBe(
      "O que Ada fez nos últimos 30 min",
    );

    // Asked by people, by agent; the routines apart. Four columns: where a task runs is no column.
    const columns = [...document.querySelectorAll(".tm-row--head > span")].map((s) => s.textContent);
    expect(columns).toEqual(["Tarefa", "Estado", "Usando agora", "Tempo"]);
    expect(document.querySelector(".tm-cell--where")).toBeNull();
    const asked = screen().getByRole("region", { name: "Pedidas por pessoas" });
    expect(asked.querySelector(".tm-sec")?.textContent).toBe("Pedidas por pessoas3");
    const background = screen().getByRole("region", { name: "Rotinas em segundo plano" });
    expect(within(background).getByRole("button", { name: "Backups" })).toBeTruthy();
    expect(rowOf("Backups").textContent).toContain("Ada · Rotina «Backups»");

    // Each agent folded: its count, how it stands and the time of the task that says it.
    const ada = agentRowOf("Ada", asked);
    expect(agentToggle("Ada").getAttribute("aria-expanded")).toBe("false");
    expect(ada.querySelector(".ac-countchip")?.getAttribute("aria-label")).toBe("2 tarefas");
    expect(ada.querySelector(".tm-cell--state")?.textContent).toBe("Trabalhando");
    expect(ada.querySelector(".tm-cell--time")?.textContent).toMatch(/^6:0\d$/);
    expect(agentRowOf("Atlas").querySelector(".tm-cell--time")?.textContent).toMatch(/^41:0\d$/);
    expect(screen().queryByRole("button", { name: "Corrigir o link de cancelar" })).toBeNull();
    await openAgent("Ada");
    await openAgent("Atlas");

    // Claude Code in Ada's browser, on her computer; the wait for my ok; Atlas in a terminal on our servers. A row is
    // one line: the program on it, what it does in it in the row's tip.
    const link = rowOf("Corrigir o link de cancelar");
    expect(link.textContent).toContain("Trabalhando");
    expect(link.querySelector(".tm-cell--use")?.textContent).toBe("Claude Code");
    expect(tipOf(link)).toBe("Conversa direta · Você pediu. Trabalhando. Claude Code · Navegador · página de cancelar");
    expect(link.textContent).not.toContain("MacBook");
    expect(link.querySelector(".tm-cell--time")?.textContent).toMatch(/^6:0\d$/);
    expect(rowOf("Revisar o PR #231").textContent).toContain("Esperando você");
    expect(rowOf("Revisar o PR #231").textContent).toContain("#eng · João pediu");
    // A wait says how long it has waited, as people say it: no clock.
    expect(rowOf("Revisar o PR #231").querySelector(".tm-cell--time")?.textContent).toBe("18 min");
    const api = rowOf("Investigar a lentidão da API");
    expect(api.querySelector(".tm-cell--use")?.textContent).toBe("Terminal");
    expect(tipOf(api)).toContain("Terminal · consultas lentas");
    expect(api.textContent).not.toContain("Nossos servidores");
    // "Tempo" warms with the time: full past 40 minutes, a little at 6.
    const warmth = (row: HTMLElement) =>
      (row.querySelector(".tm-cell--time") as HTMLElement).style.getPropertyValue("--h");
    expect(warmth(api)).toBe("1");
    expect(Number(warmth(link))).toBeLessThan(0.2);

    // People stop work here; spend stays in Usage.
    expect(document.querySelector(".tm")?.textContent).not.toMatch(/US\$|R\$|\$/);
  });

  test("an agent's picture on its card goes to its page, no conversation beside it; the card's press still filters", async () => {
    const state = seedState({ taskManager: busy() });
    const { router } = await open(state, "task-manager");
    await click(cardPress("Ada"));
    expect(cardPress("Ada").getAttribute("aria-pressed")).toBe("true");
    await click(within(cardOf("Ada")).getByRole("button", { name: "Perfil de Ada" }));
    await settle(6);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/agents/${ADA_ID}`);
  });

  test("a row picked: Parar tarefa stops it at once, and it ends today", async () => {
    const state = seedState({ taskManager: busy() });
    await open(state, "task-manager");
    expect((screen().getByRole("button", { name: "Ver passos" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen().getByRole("button", { name: "Parar tarefa" }) as HTMLButtonElement).disabled).toBe(true);

    await openAgent("Atlas");
    const slow = () => screen().getByRole("button", { name: "Investigar a lentidão da API" });
    await click(slow());
    expect(slow().getAttribute("aria-pressed")).toBe("true");
    expect(rowOf("Investigar a lentidão da API").hasAttribute("data-selected")).toBe(true);
    await click(screen().getByRole("button", { name: "Parar tarefa" }));
    await settle(4);
    // No question for one task, no reason sent: Atlas is told that I stopped it.
    expect(stopCalls(state)).toEqual([["r-api"]]);
    expect(screen().queryByRole("button", { name: "Investigar a lentidão da API" })).toBeNull();
    expect(screen().getByRole("button", { name: /Terminadas hoje/ }).textContent).toBe("Terminadas hoje3");
  });

  test("Ver passos opens the task's panel: what it does now, its facts, its steps; Abrir na conversa", async () => {
    const state = seedState({ taskManager: busy(), taskSteps: { "r-link": linkSteps() } });
    const { router, services } = await open(state, "task-manager");
    await openAgent("Ada");
    await click(screen().getByRole("button", { name: "Corrigir o link de cancelar" }));
    await click(screen().getByRole("button", { name: "Ver passos" }));
    await settle(4);
    const panel = screen().getByRole("complementary", { name: "Corrigir o link de cancelar" });
    expect(panel.querySelector(".thread-head__meta")?.textContent).toBe("Ada · Conversa direta · Você pediu");
    // Estado, Tempo, Usando agora; where it runs is nowhere, and no cost.
    const facts = [...panel.querySelectorAll(".tm-panel__facts dt")].map((d) => d.textContent);
    expect(facts).toEqual(["Estado", "Tempo", "Usando agora"]);
    expect(panel.textContent).toContain("Trabalhando");
    expect(panel.textContent).toContain("Claude Code");
    expect(panel.textContent).not.toContain("MacBook");
    expect(panel.textContent).not.toContain("Onde roda");
    expect(panel.textContent).not.toMatch(/US\$|R\$|\$/);
    // Its steps as a reply's block lists them: the one done, the one it is on.
    expect(state.calls.find((c) => c.method === "working.taskSteps")?.args).toEqual([ORG_ID, "r-link"]);
    const lines = [...panel.querySelectorAll(".ac-tools__line")].map((l) => l.getAttribute("data-s"));
    expect(lines).toEqual(["done", "run"]);
    // Asked again while it works.
    const every = services.queryClient
      .getQueryCache()
      .find({ queryKey: keys.taskSteps(ORG_ID, "r-link") })
      ?.observers.map((o) => o.options.refetchInterval);
    expect(every).toContain(TASK_MANAGER_POLL_MS);

    await click(within(panel).getByRole("button", { name: "Abrir na conversa" }));
    await settle(4);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/dm/agent/${ADA_ID}`);
  });

  test("the panel's Parar tarefa: the stopped state, then Add a reason; Esc closes it", async () => {
    const state = seedState({ taskManager: busy() });
    await open(state, "task-manager");
    // Each row opens its own panel too.
    await openAgent("Atlas");
    await click(screen().getByRole("button", { name: "Ver passos: Investigar a lentidão da API" }));
    await settle(4);
    const panel = () => screen().getByRole("complementary", { name: "Investigar a lentidão da API" });
    expect(panel().textContent).toContain("Nenhum passo ainda.");
    await click(within(panel()).getByRole("button", { name: "Parar tarefa" }));
    await settle(4);
    expect(stopCalls(state)).toEqual([["r-api"]]);
    // Still open once it stopped: who stopped it, the agent told, and the reason's field for me.
    expect(panel().textContent).toContain("Parada");
    expect(panel().textContent).toContain("Você parou o Atlas");
    expect(within(panel()).queryByRole("button", { name: "Parar tarefa" })).toBeNull();
    const why = "Mudou a prioridade";
    await type(within(panel()).getByRole("textbox", { name: "Quer dizer por quê? (opcional)" }), why);
    await click(within(panel()).getByRole("button", { name: "Mandar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "agents.stopReason")?.args).toEqual([ORG_ID, "r-api", why]);
    expect(panel().textContent).toContain(`Motivo: «${why}»`);
    expect(within(panel()).queryByRole("textbox")).toBeNull();

    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen().queryByRole("complementary", { name: "Investigar a lentidão da API" })).toBeNull();
  });

  test("stopped with a reason from Parar tudo: the open panel says that reason and asks for none", async () => {
    const state = seedState({ taskManager: busy() });
    await open(state, "task-manager");
    await openAgent("Ada");
    await click(screen().getByRole("button", { name: "Ver passos: Revisar o PR #231" }));
    const panel = () => screen().getByRole("complementary", { name: "Revisar o PR #231" });
    // Ada's row's own stop, behind the panel.
    await click(within(agentRowOf("Ada")).getByRole("button", { name: "Parar tudo de Ada" }));
    const ask = screen().getByRole("dialog", { name: "Parar as 2 tarefas de Ada?" });
    await type(within(ask).getByRole("textbox", { name: "Por quê? (opcional)" }), "Vou fazer eu mesmo");
    await click(within(ask).getByRole("button", { name: "Parar 2" }));
    await settle(4);
    expect(panel().textContent).toContain("Você parou a Ada");
    expect(panel().textContent).toContain("Motivo: «Vou fazer eu mesmo»");
    expect(within(panel()).queryByRole("textbox")).toBeNull();
  });

  test("an agent's card shows only its tasks; Parar tudo asks first, with the reason the agent reads", async () => {
    const state = seedState({ taskManager: busy() });
    await open(state, "task-manager");
    await click(cardPress("Ada"));
    expect(cardPress("Ada").getAttribute("aria-pressed")).toBe("true");
    expect(screen().getByRole("heading", { level: 2, name: "Tarefas de Ada" })).toBeTruthy();
    expect(screen().getByRole("button", { name: "Corrigir o link de cancelar" })).toBeTruthy();
    expect(screen().getByRole("button", { name: "Backups" })).toBeTruthy();
    expect(screen().queryByRole("button", { name: "Investigar a lentidão da API" })).toBeNull();

    await click(screen().getByRole("button", { name: "Parar tudo de Ada" }));
    const ask = screen().getByRole("dialog", { name: "Parar as 3 tarefas de Ada?" });
    expect(ask.textContent).toContain("O que já foi feito fica guardado, e Ada fica sabendo que você parou.");
    // Nothing stops before the confirmation.
    expect(stopCalls(state)).toEqual([]);
    const why = "Já resolvi por outro caminho";
    await type(within(ask).getByRole("textbox", { name: "Por quê? (opcional)" }), why);
    await click(within(ask).getByRole("button", { name: "Parar 3" }));
    await settle(4);
    expect(stopCalls(state).sort()).toEqual([
      ["r-backup", why],
      ["r-link", why],
      ["r-pr", why],
    ]);
    expect(screen().queryByRole("dialog", { name: "Parar as 3 tarefas de Ada?" })).toBeNull();
  });

  test("Cancelar leaves every task as it was", async () => {
    const state = seedState({ taskManager: busy() });
    await open(state, "task-manager");
    await click(within(agentRowOf("Ada")).getByRole("button", { name: "Parar tudo de Ada" }));
    await click(within(screen().getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(stopCalls(state)).toEqual([]);
    await openAgent("Ada");
    expect(screen().getByRole("button", { name: "Corrigir o link de cancelar" })).toBeTruthy();
  });

  test("an agent's row: folded at first, the whole row opens and folds it; its own Parar stops them all", async () => {
    const state = seedState({ taskManager: busy() });
    await open(state, "task-manager");
    const fold = agentToggle("Ada");
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(agentRowOf("Ada").hasAttribute("data-open")).toBe(false);
    expect(screen().queryByRole("button", { name: "Corrigir o link de cancelar" })).toBeNull();
    // Its press covers the row (its name's button reaches every edge), and no second button does the same.
    await click(fold);
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    expect(agentRowOf("Ada").hasAttribute("data-open")).toBe(true);
    expect(screen().getByRole("button", { name: "Corrigir o link de cancelar" })).toBeTruthy();
    expect(agentRowOf("Ada").querySelectorAll(".tm-cell--name button")).toHaveLength(2);
    await click(fold);
    expect(screen().queryByRole("button", { name: "Corrigir o link de cancelar" })).toBeNull();
    // The routines' run stays in its own section.
    expect(screen().getByRole("button", { name: "Backups" })).toBeTruthy();

    // The stop, a square named for screen readers and on hover, asks first.
    const stopAll = within(agentRowOf("Ada")).getByRole("button", { name: "Parar tudo de Ada" });
    expect(stopAll.getAttribute("title")).toBe("Parar tudo de Ada");
    expect(stopAll.textContent).toBe("");
    await click(stopAll);
    const ask = screen().getByRole("dialog", { name: "Parar as 2 tarefas de Ada?" });
    await click(within(ask).getByRole("button", { name: "Parar 2" }));
    await settle(4);
    expect(stopCalls(state).sort()).toEqual([["r-link"], ["r-pr"]]);
  });

  test("an agent with one task to stop has its stop on its row too, folded or not", async () => {
    const state = seedState({ taskManager: busy() });
    await open(state, "task-manager");
    await click(within(agentRowOf("Atlas")).getByRole("button", { name: "Parar tudo de Atlas" }));
    const ask = screen().getByRole("dialog", { name: "Parar a tarefa de Atlas?" });
    await click(within(ask).getByRole("button", { name: "Parar" }));
    await settle(4);
    expect(stopCalls(state)).toEqual([["r-api"]]);
  });

  test("Terminadas hoje, folded at the end: how each ended and who stopped it", async () => {
    await open(seedState({ taskManager: busy() }), "task-manager");
    const more = screen().getByRole("button", { name: /Terminadas hoje/ });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(screen().queryByText("Resumo da semana")).toBeNull();
    await click(more);
    const rows = [...document.querySelectorAll(".tm-row--ended")].map((r) => r.textContent ?? "");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Resumo da semana");
    expect(rows[0]).toContain("Atlas · #eng");
    expect(rows[0]).toContain("Terminou");
    expect(rows[1]).toContain("Responder os tickets");
    expect(rows[1]).toContain("João parou");
  });

  test("a finished row opens its panel like one still on: how it ended, how long as people say it, its message", async () => {
    const view = busy();
    view.ended = [
      ended({
        runId: "r-night",
        agentId: ATLAS_ID,
        status: "done",
        label: "Relatório das lojas",
        startedAt: ago(1315 + 5),
        finishedAt: ago(5),
      }),
      // No title of its own (never the message's words): its place names it, said once.
      ended({ runId: "r-hi", agentId: ADA_ID, status: "done" }),
    ];
    const { router } = await open(seedState({ taskManager: view }), "task-manager");
    await click(screen().getByRole("button", { name: /Terminadas hoje/ }));
    const [row, untitled] = [...document.querySelectorAll<HTMLElement>(".tm-row--ended")];
    if (!row || !untitled) throw new Error("no rows");
    expect(row.querySelector(".tm-cell--time")?.textContent).toBe("21 h 55 min");
    expect(untitled.querySelector(".tm-hit")?.textContent).toBe("#engAda");
    await click(within(row).getByRole("button", { name: "Relatório das lojas" }));
    await settle(4);
    const panel = screen().getByRole("complementary", { name: "Relatório das lojas" });
    expect(panel.textContent).toContain("Terminou");
    await click(within(panel).getByRole("button", { name: "Abrir na conversa" }));
    await settle(4);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/c/${ENG_ID}`);
  });

  test("the search finds a task by its title, its agent or the program it uses, its agent opened", async () => {
    await open(seedState({ taskManager: busy() }), "task-manager");
    const search = screen().getByRole("searchbox", { name: "Buscar tarefa, agente ou programa" });
    await type(search, "terminal");
    expect(screen().getByRole("button", { name: "Investigar a lentidão da API" })).toBeTruthy();
    expect(screen().queryByRole("button", { name: "Corrigir o link de cancelar" })).toBeNull();
    // Folded while searching, it stays folded until the search ends; then every agent is as it was before.
    await click(agentToggle("Atlas"));
    expect(screen().queryByRole("button", { name: "Investigar a lentidão da API" })).toBeNull();
    await type(search, "");
    expect(agentToggle("Atlas").getAttribute("aria-expanded")).toBe("false");
    await type(search, "nada disso");
    expect(document.body.textContent).toContain("Nenhuma tarefa com essa busca.");
  });

  test("nothing at work: the calm state, and what ended today stays under it", async () => {
    await open(seedState({ taskManager: { tasks: [], ended: [], activity: {} } }), "task-manager");
    expect(document.body.textContent).toContain("Nenhum agente trabalhando agora");
    expect(document.querySelector(".tm-card")).toBeNull();
    await click(screen().getByRole("button", { name: /Terminadas hoje/ }));
    expect(document.body.textContent).toContain("Nada terminou hoje ainda.");
  });

  test("Início's agents at work open it", async () => {
    const api = createFakeApi(seedState({ taskManager: busy() }));
    const run: WorkingRun = {
      runId: "r-api",
      agentId: ATLAS_ID,
      status: "running",
      channelId: ENG_ID,
      channelKind: "channel",
      channelName: "eng",
      threadId: null,
      startedAt: ago(3),
      createdAt: ago(3),
      label: null,
    };
    api.working = { list: async () => [run], taskManager: api.working?.taskManager };
    await renderApp(`/org/${ORG_ID}/home`, { api });
    await settle(6);
    const working = screen().getByRole("region", { name: "Trabalhando agora" });
    const link = within(working).getByRole("link", { name: "Abrir no gerenciador" });
    expect(link.getAttribute("href")).toBe(`/org/${ORG_ID}/task-manager`);
  });

  test("the worst case: a long name, a long title, a long command, a pause of days, whole in its tip in Portuguese and German", async () => {
    const NOVA = "00000000-0000-4000-8000-0000000000a9";
    const name = "Assistente de Atendimento Internacional";
    const title = "Levantar as cobranças duplicadas do último trimestre e preparar um resumo ao time";
    const command = "bun scripts/cobrancas-duplicadas.ts --desde 2026-07-01 --formato csv --saida rel";
    // A page's address, with nowhere to wrap: it breaks where it must.
    const site = "loja.example/checkout/pedidos/2026/11/confirmacao-de-pagamento-pendente-de-revisao";
    const view = busy();
    view.tasks.push(
      task({
        runId: "r-site",
        agentId: ATLAS_ID,
        label: "Ver o checkout",
        brain: "claude_code",
        now: using("browser_do", site),
      }),
      task({
        runId: "r-long",
        agentId: NOVA,
        label: title,
        brain: "claude_code",
        now: using("run_code", command),
        startedAt: ago(73),
        createdAt: ago(73),
      }),
      task({
        runId: "r-paused",
        agentId: NOVA,
        channelId: "dm-nova",
        channelKind: "dm",
        channelName: null,
        status: "waiting_input",
        held: "plan",
        wait: {
          code: "usage_pause",
          key: "plan:nova",
          plan: "Claude",
          model: null,
          scope: null,
          percent: 95,
          window: "seven_day",
          resetsAt: in_(3 * 24 * 60),
          since: ago(50 * 60),
          canContinue: true,
        },
        startedAt: ago(82 * 60 + 8),
        createdAt: ago(82 * 60 + 8),
      }),
    );
    const state = seedState({ taskManager: view });
    const base = state.agents[0];
    if (base) state.agents.push({ ...base, id: NOVA, name, handle: "atendimento" });
    const { services } = await open(state, "task-manager");
    for (const agent of ["Ada", "Atlas", name]) await openAgent(agent);
    const row = rowOf(title);
    // The program on the row's one line; what it does in it whole in the row's tip, the long command and the address too.
    expect(row.querySelector(".tm-use__text b")?.textContent).toBe("Claude Code");
    expect(row.querySelector(".tm-use__text small")).toBeNull();
    expect(tipOf(row)).toContain(`Claude Code · Terminal · ${command}`);
    expect(tipOf(rowOf("Ver o checkout"))).toContain(`Claude Code · Navegador · ${site}`);
    expect(rowOf("Conversa direta").querySelector(".tm-cell--time")?.textContent).toBe("2 dias");
    // Its row speaks for the task at work: its clock.
    expect(agentRowOf(name).querySelector(".tm-cell--time")?.textContent).toMatch(/^1:13:0\d$/);
    // Longer words in German, measured by the geometry check too.
    await showIn(services, "de");
    expect(rowOf("Direkte Unterhaltung").querySelector(".tm-cell--time")?.textContent).toBe("2 Tage");
    expect(tipOf(row)).toContain(`Claude Code · Terminal · ${command}`);
  });

  test("the worst case on one line a row: a long title, a long context, a long name; the rest in its tip", async () => {
    const { state } = worstCase();
    await open(state, "task-manager");
    const asked = () => screen().getByRole("region", { name: "Pedidas por pessoas" });
    for (const agent of ["Ada", "Atlas", NOVA_NAME]) await openAgent(agent, asked());
    await openAgent(NOVA_NAME, screen().getByRole("region", { name: "Pedidas por agentes" }));
    await click(screen().getByRole("button", { name: /Terminadas hoje/ }));
    // Every row says its words in one button: the title, then what it is about in quiet type, nothing under them.
    const rows = [...document.querySelectorAll<HTMLElement>(".tm-row:not(.tm-row--head)")];
    expect(rows).toHaveLength(15);
    for (const row of rows) {
      expect(row.querySelectorAll(".tm-hit")).toHaveLength(1);
      expect([...row.querySelectorAll("small")].every((s) => s.parentElement?.classList.contains("tm-hit"))).toBe(true);
    }
    const long = rowOf(LONG_TITLE);
    expect(long.querySelector(".tm-hit")?.firstChild?.textContent).toBe(LONG_TITLE);
    expect(long.querySelector(".tm-hit > small")?.textContent).toBe(
      `#atendimento-internacional-e-cobrancas · ${LONG_NAME} pediu · 9 de 14 feitos · 3 ajudantes`,
    );
    // Its state and its program on the line; what it runs, whole, only in its tip.
    expect(long.querySelector(".tm-cell--state")?.textContent).toBe("Trabalhando");
    expect(long.querySelector(".tm-cell--use")?.textContent).toBe("Claude Code");
    expect(tipOf(long)).toBe(
      `#atendimento-internacional-e-cobrancas · ${LONG_NAME} pediu · 9 de 14 feitos · 3 ajudantes. Trabalhando. ` +
        "Claude Code · Terminal · bun scripts/cobrancas-duplicadas.ts --desde 2026-07-01 --formato csv --saida rel",
    );
    // What it asked of Atlas: who asked and what started it on the line; when its pause ends in its tip.
    const asked2 = rowOf("Conferir as notas fiscais emitidas para clientes do exterior neste mês");
    expect(asked2.querySelector(".tm-hit > small")?.textContent).toContain(`começou com ${LONG_NAME}`);
    expect(stateOf(asked2)[0]).toBe("Pausada: plano a 95% da semana");
    expect(stateOf(asked2)[1]).toMatch(/^Volta /);
    expect(tipOf(rowOf("Conciliação diária das cobranças internacionais"))).toContain(
      "Navegador · loja.example/checkout/pedidos/2026/11/confirmacao-de-pagamento-pendente-de-revisao",
    );
    // A routine's run waiting for your ok, its agent's face first: its state keeps a mark for no room (the square).
    const routineOk = rowOf("Revisão semanal das devoluções internacionais pendentes de aprovação");
    expect(routineOk.querySelector(".tm-cell--state > .tm-mark .rq-wait")).not.toBeNull();
    // The agent's long name on its row, how it stands in its tip.
    expect(tipOf(agentRowOf(NOVA_NAME, asked()))).toMatch(/^1 tarefa\. Trabalhando\. Claude Code · Terminal · bun/);
    const refund = rows.find((r) => r.textContent?.includes("reembolso em dobro")) as HTMLElement;
    expect(tipOf(refund)).toBe(`${NOVA_NAME} · #atendimento-internacional-e-cobrancas. ${LONG_NAME} parou · 6 min`);
    expect(document.querySelector(".tm-computers .tm-computer__text")?.textContent).toBe(
      "MacBook Pro da equipe de atendimento internacionalCheio · 3 na fila · 2 trabalhando",
    );
    // The keys' focus on the long row: its words whole in the tip, the command it runs too.
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Tab" });
      screen().getByRole("button", { name: LONG_TITLE }).focus();
    });
    const tip = document.querySelector(".ac-tip.tm-tip") as HTMLElement;
    expect(tip.firstElementChild?.textContent).toBe(LONG_TITLE);
    expect(tip.textContent).toContain("--formato csv --saida rel");
  });

  test("More in the sidebar opens it", async () => {
    await open(seedState({ taskManager: busy() }), `c/${ENG_ID}`);
    const nav = document.getElementById("app-nav") as HTMLElement;
    await click(within(nav).getByRole("button", { name: "Mais" }));
    const more = screen().getByRole("dialog", { name: "Mais" });
    const link = within(more).getByRole("link", { name: /Gerenciador de tarefas/ });
    expect(link.getAttribute("href")).toBe(`/org/${ORG_ID}/task-manager`);
  });
});

describe("returns agents set (Retornos)", () => {
  const ret = (over: Partial<PendingReturn> & Pick<PendingReturn, "messageId">): PendingReturn => ({
    agentId: ATLAS_ID,
    channelId: ENG_ID,
    channelKind: "channel",
    channelName: "eng",
    threadId: null,
    at: in_(33),
    about: "rever o deploy de hoje",
    runId: "r-1",
    replyMessageId: "m-reply",
    held: false,
    canCancel: true,
    ...over,
  });
  const canceled = (over: Partial<CanceledReturn> & Pick<CanceledReturn, "messageId">): CanceledReturn => ({
    agentId: ATLAS_ID,
    channelId: ENG_ID,
    channelKind: "channel",
    channelName: "eng",
    threadId: null,
    at: in_(20),
    about: "ver o deploy",
    canceledAt: ago(1),
    canceledBy: null,
    ...over,
  });
  const menuOf = async (row: HTMLElement) => {
    await act(async () =>
      fireEvent.pointerDown(within(row).getByRole("button", { name: /^Retornos: / }), { button: 0, ctrlKey: false }),
    );
    await settle(2);
    return screen().getByRole("menu");
  };

  test("after the routines, one line a return: her words and where, when it comes, how soon; ⋯ opens or cancels", async () => {
    const view = busy();
    // More than 12 h away and on the next day at any hour the suite runs: at 00:44, 23 h ahead is still today.
    const tomorrow = new Date(Math.max(Date.now() + 13 * 3600_000, new Date().setHours(24, 30, 0, 0))).toISOString();
    // Its own time, read back: one taken again later can fall in the next minute.
    const soon = ret({ messageId: "f-1" });
    view.followUps = [
      soon,
      ret({
        messageId: "f-2",
        agentId: ADA_ID,
        channelKind: "dm",
        channelName: null,
        about: "rever a fila do suporte",
        at: tomorrow,
        canCancel: false,
      }),
    ];
    const state = seedState({ taskManager: view });
    const r = await open(state, "task-manager");
    const sections = [...document.querySelectorAll(".tm-section")].map((el) => el.getAttribute("aria-label"));
    expect(sections.at(-1)).toBe("Retornos");
    const row = rowOf("rever o deploy de hoje");
    expect(row.querySelector(".tm-hit small")?.textContent).toBe("Atlas · #eng");
    expect(row.querySelector(".tm-cell--state")?.textContent).toBe(`Às ${formatTime("pt-BR", soon.at)}`);
    expect(row.querySelector(".tm-cell--time")?.textContent).toBe("em 33 min");
    expect(row.querySelector(".tm-cell--use")?.textContent).toBe("—");
    // One line: what it leaves out is in its tip.
    expect(tipOf(row)).toContain("Atlas · #eng");
    const other = rowOf("rever a fila do suporte");
    expect(other.querySelector(".tm-hit small")?.textContent).toBe("Ada · Conversa direta");
    expect(other.querySelector(".tm-cell--state")?.textContent).toBe(`Amanhã às ${formatTime("pt-BR", tomorrow)}`);

    // Who may cancel gets the item; everyone gets the way to the conversation.
    let menu = await menuOf(other);
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Abrir na conversa"]);
    await act(async () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }));
    await settle(2);
    menu = await menuOf(row);
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Abrir na conversa", "Cancelar retorno"]);
    await click(within(menu).getByRole("menuitem", { name: "Cancelar retorno" }));
    expect(state.calls.filter((c) => c.method === "chat.cancelFollowUp").map((c) => c.args)).toEqual([[ORG_ID, "f-1"]]);

    // The row opens the conversation at the reply that set it.
    await click(screen().getByRole("button", { name: "rever o deploy de hoje" }));
    expect(r.router.state.location.pathname).toBe(`/org/${ORG_ID}/c/${ENG_ID}`);
    expect((r.router.state.location.search as Record<string, unknown>).m).toBe("m-reply");
  });

  test("with no task on, the returns still list; canceled ones end today, by whom", async () => {
    const view: TaskManagerView = {
      tasks: [],
      ended: [],
      activity: {},
      followUps: [ret({ messageId: "f-1", held: true, at: ago(20) })],
      canceledFollowUps: [
        canceled({ messageId: "c-1", canceledBy: { kind: "person", userId: "u-joao", name: "João" } }),
        canceled({ messageId: "c-2", about: "ver o CI", canceledAt: ago(5) }),
        // The worst case (break-ui, measured by CI's geometry step): a long name, and her 80 characters.
        canceled({
          messageId: "c-4",
          about: "rever os pedidos de reembolso de outubro e responder quem pediu o valor em dobro",
          canceledAt: ago(7),
          canceledBy: { kind: "person", userId: "u-maria", name: LONG_NAME },
        }),
        canceled({
          messageId: "c-3",
          about: "ver o build",
          canceledAt: ago(3),
          canceledBy: { kind: "agent", agentId: ATLAS_ID },
        }),
      ],
    };
    await open(seedState({ taskManager: view }), "task-manager");
    const row = rowOf("rever o deploy de hoje");
    // Its time passed waiting on an answer: that is its state, and no time to wait for.
    expect(row.querySelector(".tm-cell--state")?.textContent).toBe("Esperando uma resposta");
    expect(row.querySelector(".tm-cell--time")?.textContent).toBe("");
    await click(screen().getByRole("button", { name: /Terminadas hoje/ }));
    const ends = [...document.querySelectorAll(".tm-row--ended")].map(
      (el) => el.querySelector(".tm-cell--state .ac-chip, .tm-cell--state > :first-child")?.textContent,
    );
    expect(ends).toEqual([
      "Retorno cancelado por João",
      "Retorno cancelado por Atlas",
      "Retorno cancelado",
      `Retorno cancelado por ${LONG_NAME}`,
    ]);
  });
});

describe("an agent's tasks beside its DM", () => {
  const PILL = "3 tarefas · 1 espera você";

  test("the header's pill says her tasks and who waits; it opens them in the thread's side panel", async () => {
    const view = busy();
    view.ended.push(ended({ runId: "r-price", agentId: ADA_ID, status: "done", label: "Atualizar o preço" }));
    const state = withDm({ taskManager: view });
    await open(state, `dm/agent/${ADA_ID}`);
    const pill = screen().getByRole("button", { name: PILL });
    // The pill and its panel count what ended themselves: the conversation never asks for today's count.
    const calls = state.calls.filter((c) => c.method === "working.taskManager");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.args[2] === false)).toBe(true);
    expect(pill.closest(".channel__header")).toBeTruthy();
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    // The words on a computer; on a phone (tasks.css) the counts alone, so her name keeps the header's room.
    expect(pill.querySelector(".tm-pill__words")?.textContent).toBe(PILL);
    expect(pill.querySelector(".tm-pill__count")?.textContent).toBe("31");
    await click(pill);
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    const panel = screen().getByRole("complementary", { name: "Tarefas de Ada" });
    expect(panel.classList.contains("thread-panel")).toBe(true);
    expect(panel.querySelector(".thread-head__meta")?.textContent).toBe("3 agora · 1 espera você");
    const wells = [...panel.querySelectorAll(".tm-agentpanel__wells > div")].map((w) => w.textContent);
    expect(wells).toEqual(["Agora3", "Esperam você1", "Feitas hoje1"]);
    // People's tasks first, oldest first, then her routine's; this conversation's is marked.
    const cards = [...panel.querySelectorAll(".tm-taskcard")];
    expect(cards.map((c) => c.querySelector(".tm-taskcard__title b")?.textContent)).toEqual([
      "Revisar o PR #231",
      "Corrigir o link de cancelar",
      "Backups",
    ]);
    // A wait on a person is its mark's job: the line under the title stays quiet (where, the program, how long).
    const sub = (i: number) => cards[i]?.querySelector(".tm-taskcard__label small")?.textContent ?? "";
    expect(sub(0)).toMatch(/^#eng · /);
    expect(sub(0)).not.toContain("Esperando você");
    expect(cards[0]?.querySelector(".tm-taskcard__label small[data-wait]")).toBeNull();
    // This conversation's says so on its line, with no chip beside the title.
    expect(cards[1]?.querySelector(".tm-here")).toBeNull();
    expect(sub(1)).toMatch(/^Nesta conversa · Claude Code · /);
    expect(sub(2)).toMatch(/^Rotina «Backups» · /);
    // Parar is the square alone, named for screen readers.
    expect(within(cards[0] as HTMLElement).getByRole("button", { name: "Parar: Revisar o PR #231" }).textContent).toBe(
      "",
    );
    // Esc closes it, and stops nothing.
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen().queryByRole("complementary", { name: "Tarefas de Ada" })).toBeNull();
    expect(stopCalls(state)).toEqual([]);
  });

  test("a card: Passos opens its steps in place, Parar stops it; Parar todas confirms in the foot", async () => {
    const state = withDm({ taskManager: busy(), taskSteps: { "r-link": linkSteps() } });
    await open(state, `dm/agent/${ADA_ID}`);
    await click(screen().getByRole("button", { name: PILL }));
    const panel = screen().getByRole("complementary", { name: "Tarefas de Ada" });
    const card = (title: string) => {
      const cards = [...panel.querySelectorAll<HTMLElement>(".tm-taskcard")];
      return cards.find((c) => c.textContent?.includes(title)) as HTMLElement;
    };
    // Passos only while it works: not on the one waiting for my ok.
    expect(within(card("Revisar o PR #231")).queryByRole("button", { name: "Passos" })).toBeNull();
    await click(within(card("Corrigir o link de cancelar")).getByRole("button", { name: "Passos" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "working.taskSteps")?.args).toEqual([ORG_ID, "r-link"]);
    const lines = [...card("Corrigir o link de cancelar").querySelectorAll(".ac-tools__line")];
    expect(lines.map((l) => l.getAttribute("data-s"))).toEqual(["done", "run"]);
    await click(within(card("Corrigir o link de cancelar")).getByRole("button", { name: /^Parar: / }));
    await settle(4);
    expect(stopCalls(state)).toEqual([["r-link"]]);

    await click(within(panel).getByRole("button", { name: "Parar todas" }));
    const ask = within(panel).getByRole("alertdialog", { name: "Parar as 2 tarefas de Ada?" });
    // In place of the foot, not a card over the panel.
    expect(ask.closest(".tm-panel__foot")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Abrir no gerenciador" })).toBeNull();
    const why = "Vou fazer eu mesmo";
    await type(within(ask).getByRole("textbox", { name: "Por quê? (opcional)" }), why);
    await click(within(ask).getByRole("button", { name: "Parar 2" }));
    await settle(4);
    expect(stopCalls(state).sort()).toEqual([["r-backup", why], ["r-link"], ["r-pr", why]]);
  });

  test("Abrir no gerenciador opens the page with her card chosen", async () => {
    const { router } = await open(withDm({ taskManager: busy() }), `dm/agent/${ADA_ID}`);
    await click(screen().getByRole("button", { name: PILL }));
    await click(screen().getByRole("button", { name: "Abrir no gerenciador" }));
    await settle(6);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/task-manager`);
    expect(router.state.location.search).toEqual({ agent: ADA_ID });
    expect(screen().getByRole("heading", { level: 2, name: "Tarefas de Ada" })).toBeTruthy();
  });

  test("the panel floats over the DM, its scrim closes it; no pill in a channel, nor for an agent with nothing on", async () => {
    await open(withDm({ taskManager: busy() }), `dm/agent/${ADA_ID}`);
    await click(screen().getByRole("button", { name: PILL }));
    const panel = screen().getByRole("complementary", { name: "Tarefas de Ada" });
    await click(panel.previousElementSibling as HTMLElement);
    expect(screen().queryByRole("complementary", { name: "Tarefas de Ada" })).toBeNull();
    cleanup();
    await open(seedState({ taskManager: busy() }), `c/${ENG_ID}`);
    expect(document.querySelector(".tm-pill")).toBeNull();
    cleanup();
    await open(withDm({ taskManager: { tasks: [], ended: [], activity: {} } }), `dm/agent/${ADA_ID}`);
    expect(document.querySelector(".tm-pill")).toBeNull();
  });
});

describe("a computer's line", () => {
  test("a task waiting for room says its place in the line and when it should start; unknown, Computador cheio", async () => {
    const { view } = withLine();
    await open(seedState({ taskManager: view }), "task-manager");
    await openAgent("Ada");
    await openAgent("Atlas");
    const checkout = rowOf("Ajustar o texto do checkout");
    expect(stateOf(checkout)).toEqual(["Na fila · 1º", "começa em ~3 min"]);
    // Grey with the clock: it waits on its computer, not on me.
    expect(checkout.querySelector(".tm-state[data-wait]")).toBeNull();
    expect(checkout.querySelector(".tm-cell--use")?.textContent).toBe("—");
    const report = rowOf("Gerar o relatório");
    expect(stateOf(report)).toEqual(["Computador cheio", "Começa quando tiver memória livre"]);
    expect(report.querySelector(".tm-cell--use")?.textContent).toBe("—");
    expect(document.querySelector(".tm-sum")?.textContent).toBe("3 trabalhando1 espera você");
  });

  test("with no estimate, a task in line says no time rather than a made-up one", async () => {
    const { view } = withLine();
    const checkout = view.tasks.find((x) => x.runId === "r-checkout");
    if (checkout?.line) checkout.line.estimatedStartAt = null;
    await open(seedState({ taskManager: view }), "task-manager");
    await openAgent("Ada");
    const row = rowOf("Ajustar o texto do checkout");
    expect(stateOf(row)).toEqual(["Na fila · 1º", "Começa quando tiver memória livre"]);
    expect(row.querySelector(".tm-cell--use")?.textContent).toBe("—");
  });

  test("Computadores: room or a line for each; Ver fila opens the computer's line in its dialog", async () => {
    const { view, queue } = withLine();
    // Others' work fills it: nothing of mine waits there, so the strip doesn't show it.
    view.tasks = view.tasks.filter((x) => x.runId !== "r-checkout" && x.runId !== "r-report");
    await open(seedState({ taskManager: view }), "task-manager", queue);
    const list = screen().getByRole("region", { name: "Computadores" });
    const rows = [...list.querySelectorAll(".tm-computer__text")].map((r) => r.textContent);
    expect(rows).toEqual(["MacBookCheio · 3 na fila · 1 trabalhando", "ServidorTem espaço"]);
    // Nothing on it: nothing to see.
    expect(within(list).queryByRole("button", { name: "Ver fila: Servidor" })).toBeNull();
    // The words take no focus: the keys' focus on Ver fila opens them whole in the kit's tip.
    const see = within(list).getByRole("button", { name: "Ver fila: MacBook" });
    expect(see.getAttribute("title")).toBeNull();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Tab" });
      see.focus();
    });
    const tip = document.querySelector(".ac-tip.tm-tip") as HTMLElement;
    expect([...tip.children].map((line) => line.textContent)).toEqual(["MacBook", "Cheio · 3 na fila · 1 trabalhando"]);
    await act(async () => see.blur());
    expect(document.querySelector(".ac-tip")).toBeNull();
    await click(see);
    await settle(4);
    const dialog = screen().getByRole("dialog", { name: "Fila de MacBook" });
    const text = dialog.textContent ?? "";
    expect(text).toContain("Cheio · o próximo começa em cerca de 3 min");
    expect(text).toContain("Trabalhando agora · 1");
    expect(text).toContain("faltam ~3 min");
    expect(text).toContain("Na fila · 3");
    expect(text).toContain("respondendo você · #eng");
    expect(text).toContain("Você vai primeiro");
    // The rule says what the line waits for (free memory), never sizes or costs.
    expect(text).toContain("quando o computador tem memória livre");
    expect(text).not.toMatch(/US\$|GB/i);
  });

  test("a task's row says nothing of where it runs: its computer's line opens from the strip", async () => {
    const { view, queue } = withLine();
    await open(seedState({ taskManager: view }), "task-manager", queue);
    await openAgent("Ada");
    const link = rowOf("Corrigir o link de cancelar");
    expect(within(link).queryByRole("button", { name: /^Ver fila/ })).toBeNull();
    expect(link.textContent).not.toContain("MacBook");
    expect(
      within(screen().getByRole("region", { name: "O que segura as tarefas" })).getByRole("button", {
        name: "Ver fila: MacBook",
      }),
    ).toBeTruthy();
  });

  test("in her DM's panel a task in line says its place; Ver fila opens the line over the tasks", async () => {
    const { view, queue } = withLine();
    await open(withDm({ taskManager: view }), `dm/agent/${ADA_ID}`, queue);
    await click(screen().getByRole("button", { name: "4 tarefas · 1 espera você" }));
    const checkout = () => {
      const cards = [...document.querySelectorAll<HTMLElement>(".tm-agentpanel .tm-taskcard")];
      return cards.find((c) => c.textContent?.includes("Ajustar o texto do checkout")) as HTMLElement;
    };
    const sub = checkout().querySelector(".tm-taskcard__label small");
    expect(sub?.textContent).toBe("Na fila · 1º · começa em ~3 min · #eng");
    expect(sub?.hasAttribute("data-wait")).toBe(false);
    await click(within(checkout()).getByRole("button", { name: "Ver fila" }));
    await settle(4);
    const dialog = screen().getByRole("dialog", { name: "Fila de MacBook" });
    expect(dialog.textContent).toContain("respondendo você · sua DM");
    // The tasks stay beside the conversation, under the dialog.
    expect(document.querySelectorAll(".tm-agentpanel .tm-taskcard")).toHaveLength(4);
  });
});

/** Atlas asked Ada in their private conversation, for me; Atlas's own run is on with one helper. */
function chain(): TaskManagerView {
  const view = busy();
  view.tasks = [
    task({ runId: "r-boss", agentId: ATLAS_ID, label: "Olhar os bugs", helpers: 1, requester: null }),
    task({
      runId: "r-helper",
      agentId: ADA_ID,
      channelId: "dm-agents",
      channelKind: "dm",
      channelName: null,
      betweenAgents: true,
      label: "Vê o log de ontem",
      requester: null,
      delegation: { agentId: ATLAS_ID, origin: { kind: "routine", name: "Triagem" } },
    }),
  ];
  return view;
}

describe("work agents asked of each other", () => {
  test("its own section: who asked, what started it, stopped from its row; no way into their conversation", async () => {
    await open(seedState({ taskManager: chain() }), "task-manager");
    const section = screen().getByRole("region", { name: "Pedidas por agentes" });
    await openAgent("Atlas", section);
    expect(section.textContent).toContain("Vê o log de ontem");
    expect(section.textContent).toContain("a pedido de Atlas · começou na rotina Triagem");
    expect(section.textContent).not.toContain("Conversa direta");
    await click(within(rowOf("Vê o log de ontem")).getByRole("button", { name: "Ver passos: Vê o log de ontem" }));
    await settle(4);
    const panel = document.querySelector(".tm-panel") as HTMLElement;
    expect(panel.textContent).toContain("Se parar, Atlas fica sabendo que você parou");
    expect(within(panel).queryByRole("button", { name: "Abrir na conversa" })).toBeNull();
  });

  test("the row of a run with helpers stops it and them in one action, after a confirmation", async () => {
    const state = seedState({ taskManager: chain() });
    await open(state, "task-manager");
    await openAgent("Atlas", screen().getByRole("region", { name: "Pedidas por pessoas" }));
    const row = rowOf("Olhar os bugs");
    expect(row.textContent).toContain("1 ajudante");
    await click(within(row).getByRole("button", { name: "Parar todas: Olhar os bugs" }));
    const ask = screen().getByRole("dialog", { name: "Parar Atlas e 1 ajudante?" });
    await click(within(ask).getByRole("button", { name: "Parar 2" }));
    await settle(4);
    expect(stopCalls(state)).toEqual([["r-boss", undefined, "chain"]]);
  });

  test("an agent's Parar 2 takes what its tasks asked of others with them", async () => {
    const view = chain();
    view.tasks.push(task({ runId: "r-boss2", agentId: ATLAS_ID, label: "Ver o deploy", requester: null }));
    const state = seedState({ taskManager: view });
    await open(state, "task-manager");
    const asked = screen().getByRole("region", { name: "Pedidas por pessoas" });
    await click(within(agentRowOf("Atlas", asked)).getByRole("button", { name: "Parar tudo de Atlas" }));
    const ask = screen().getByRole("dialog", { name: "Parar Atlas e 1 ajudante?" });
    await click(within(ask).getByRole("button", { name: "Parar 3" }));
    await settle(4);
    expect(stopCalls(state).sort()).toEqual([
      ["r-boss", undefined, "chain"],
      ["r-boss2", undefined, "chain"],
    ]);
  });

  test("work out of sight: the page counts it, the agent's card isn't free, and nothing says what it is", async () => {
    const view = chain();
    view.tasks = view.tasks.filter((x) => x.runId === "r-boss");
    view.hidden = { total: 2, working: 2, byAgent: { [ADA_ID]: 2 } };
    view.computers = [{ id: "machine_1", name: "MacBook", working: 3, inLine: 0 }];
    await open(seedState({ taskManager: view }), "task-manager");
    expect(document.querySelector(".tm-sum")?.textContent).toContain("3 trabalhando");
    expect(cardOf("Ada").textContent).toContain("2 tarefas que você não vê");
    expect(cardOf("Ada").textContent).not.toContain("Livre");
    expect(screen().getByText("Mais 2 tarefas em conversas que você não vê.")).toBeTruthy();
  });
});

describe("the line's dialog", () => {
  const seeLine = async () => {
    await click(screen().getByRole("button", { name: "Ver fila: MacBook" }));
    await settle(4);
  };
  const line = () => {
    const { view, queue } = withLine();
    const [first] = queue.working;
    if (first)
      queue.working = [
        {
          ...first,
          where: { ...first.where, agents: true },
          purpose: { kind: "agent", agentId: ATLAS_ID },
          estimatedEndAt: null,
          overdue: true,
          canOpen: true,
          canStop: true,
        },
      ];
    return { view, queue };
  };

  test("says what fills the computer, and a turn past its usual time gives no estimate", async () => {
    const { view, queue } = line();
    await open(seedState({ taskManager: view }), "task-manager", queue);
    await seeLine();
    const text = screen().getByRole("dialog", { name: "Fila de MacBook" }).textContent ?? "";
    expect(text).toContain("1 pedida por agente");
    expect(text).toContain("passou do normal");
    expect(text).toContain("uma conversa entre agentes");
    expect(text).not.toContain("uma conversa privada");
  });

  test("a row opens its task and stops it, for who may; the others are plain", async () => {
    const { view, queue } = line();
    const state = seedState({ taskManager: view });
    const { router } = await open(state, "task-manager", queue);
    await seeLine();
    const dialog = screen().getByRole("dialog", { name: "Fila de MacBook" });
    // The rows of the line without access say nothing more than who waits.
    expect(within(dialog).getAllByRole("button", { name: /^Abrir tarefa/ })).toHaveLength(1);
    await click(within(dialog).getByRole("button", { name: "Parar: Ada" }));
    await settle(4);
    // A row doesn't know what its run asked of others: that stops with it.
    expect(stopCalls(state)).toEqual([["r-link", undefined, "chain"]]);
    await click(within(dialog).getByRole("button", { name: "Abrir tarefa: Ada" }));
    await settle(6);
    expect(router.state.location.search).toEqual({ task: "r-link" });
    expect(screen().queryByRole("dialog", { name: "Fila de MacBook" })).toBeNull();

    // Closed, the address forgets it: the same row opens it again.
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    await settle(4);
    expect(document.querySelector(".tm-panel")).toBeNull();
    expect(router.state.location.search).toEqual({});
    await seeLine();
    await click(screen().getByRole("button", { name: "Abrir tarefa: Ada" }));
    await settle(6);
    expect(document.querySelector(".tm-panel")).toBeTruthy();
  });
});

describe("what holds the waiting work", () => {
  /** Two of my tasks wait on Walter's Claude Team, at its limit until later today. */
  const onClaude = (runId: string, label: string) =>
    task({
      runId,
      agentId: ATLAS_ID,
      status: "waiting_input",
      held: "plan",
      brain: "claude_code",
      label,
      wait: {
        code: "plan_limit",
        key: "plan:machine_1:claude_code:acct_team",
        plan: "Claude",
        model: null,
        scope: null,
        percent: null,
        window: null,
        resetsAt: in_(600),
        since: ago(20),
        canContinue: false,
      },
    });
  const TEAM_FULL: AiAccounts["accounts"][number] = {
    id: "acct_team",
    kind: "claude_code",
    label: "Claude Team",
    email: "walter@example.com",
    plan: "team",
    status: "active",
    ownerId: "u-walter",
    ownerName: "Walter",
    mine: true,
    usedBy: ["Atlas"],
    usage: {
      windows: [{ kind: "seven_day", usedPercent: 100, resetsAt: in_(600) }],
      source: "turn",
      at: ago(1),
    },
    provider: null,
    keyHint: null,
    machineId: "machine_1",
    computer: "MacBook",
  };
  /** The line's view, two tasks on the full plan, 142 done today; Walter's accounts when given. */
  const openStrip = async (view: TaskManagerView, accounts = [TEAM_FULL]) => {
    const { queue } = withLine();
    const api = createFakeApi(seedState({ taskManager: view }));
    fakeMachinesOf.get(api)?.setQueue(queue);
    fakeMachinesOf.get(api)?.setAiAccounts({ accounts, computers: [] });
    const r = await renderApp(`/org/${ORG_ID}/task-manager`, { api });
    await settle(6);
    return r;
  };
  const strip = () => screen().queryByRole("region", { name: "O que segura as tarefas" });
  const causes = () =>
    [...(strip()?.querySelectorAll(".tm-cause") ?? [])].map((row) => [
      row.querySelector("b")?.textContent,
      row.querySelector("small")?.textContent,
      row.querySelector("button")?.textContent,
    ]);
  const full = () => {
    const { view } = withLine();
    view.tasks.push(onClaude("r-c1", "Roteiro do vídeo 1"), onClaude("r-c2", "Roteiro do vídeo 2"));
    view.doneToday = 142;
    return view;
  };

  test("today's count, then up to three causes, the most held first, each with its count and one way out", async () => {
    await openStrip(full());
    expect(strip()?.querySelector(".tm-causes__today")?.textContent).toBe("Hoje: 142 tarefas concluídas · 5 esperando");
    const rows = causes();
    expect(rows).toHaveLength(3);
    // My own full plan in its tasks' words, as their rows and the phone say it: never the usage meter's.
    expect(rows[0]?.[0]).toBe("Plano do Claude no limite");
    expect(rows[0]?.[1]).toMatch(/^Volta .+ · 2 tarefas$/);
    expect(rows[0]?.[2]).toBe("Ver uso");
    // A full computer with Computadores' whole facts, and not again under Computadores.
    expect(rows[1]).toEqual(["MacBook", "Cheio · 3 na fila · 1 trabalhando", "Ver fila"]);
    expect(rows[2]).toEqual(["Servidor", "Cheio · 1 na fila", "Ver fila"]);
    expect(screen().queryByRole("region", { name: "Computadores" })).toBeNull();
    // The plan's official mark, never a generic icon.
    expect(strip()?.querySelector(".tm-cause .ac-brand")).not.toBeNull();
  });

  test("a plan's return is its wait's, when the work goes on, even where my usage meter reads another time", async () => {
    const later: typeof TEAM_FULL = {
      ...TEAM_FULL,
      usage: { source: "turn", at: ago(1), windows: [{ kind: "seven_day", usedPercent: 100, resetsAt: in_(2000) }] },
    };
    await openStrip(full(), [later]);
    await openAgent("Atlas");
    const [, back] = stateOf(rowOf("Roteiro do vídeo 1"));
    expect(causes()[0]?.[1]).toBe(`${back} · 2 tarefas`);
  });

  test("two computers, one full in the strip: the other still lists under Computadores, alone", async () => {
    const view = full();
    view.tasks = view.tasks.filter((x) => x.runId !== "r-report");
    view.computers = [
      { id: "machine_1", name: "MacBook", working: 1, inLine: 3 },
      { id: "machine_2", name: "Servidor", working: 1, inLine: 0 },
    ];
    await openStrip(view);
    expect(causes().map((r) => r[0])).toEqual(["Plano do Claude no limite", "MacBook", "1 espera você"]);
    const list = screen().getByRole("region", { name: "Computadores" });
    expect(list.querySelector(".ac-grouphead__count")?.textContent).toBe("1");
    expect([...list.querySelectorAll(".tm-computer__text")].map((r) => r.textContent)).toEqual([
      "ServidorTem espaço · 1 trabalhando",
    ]);
    expect(screen().getAllByRole("button", { name: "Ver fila: MacBook" })).toHaveLength(1);
  });

  test("Ver uso opens Uso; Ver fila opens the computer's line in place", async () => {
    const { router } = await openStrip(full());
    const region = strip() as HTMLElement;
    await click(within(region).getByRole("button", { name: "Ver fila: MacBook" }));
    expect(screen().getByRole("dialog", { name: "Fila de MacBook" })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/task-manager`);
    await act(async () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }));
    await settle(3);
    await click(within(region).getByRole("button", { name: "Ver uso: Plano do Claude no limite" }));
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/usage`);
  });

  test("a plan that isn't mine says the same words; a person's ok opens its conversation", async () => {
    await openStrip(full(), []);
    const rows = causes();
    expect(rows[0]?.[0]).toBe("Plano do Claude no limite");
    expect(rows[0]?.[1]).toMatch(/^Volta .+ · 2 tarefas$/);
    cleanup();
    const { router } = await openStrip(busy());
    expect(strip()?.querySelector(".tm-causes__today")?.textContent).toBe("Hoje: 1 tarefa concluída · 1 esperando");
    expect(causes()).toEqual([["1 espera você", "Segue quando alguém aprovar", "Abrir na conversa"]]);
    await click(within(strip() as HTMLElement).getByRole("button", { name: "Abrir na conversa: 1 espera você" }));
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/c/${ENG_ID}`);
  });

  test("nothing waits: no strip", async () => {
    const view = busy();
    view.tasks = view.tasks.filter((x) => x.status === "running");
    await openStrip(view);
    expect(strip()).toBeNull();
  });
});

describe("why a task waits", () => {
  const SATURDAY = new Date(Date.now() + 2.5 * 24 * 3600_000).toISOString();
  const wait = (over: Partial<TaskWait> = {}): TaskWait => ({
    code: "usage_pause",
    key: "plan:m1:claude_code:a1",
    plan: "Claude",
    model: null,
    scope: null,
    percent: 95,
    window: "seven_day",
    resetsAt: SATURDAY,
    canContinue: true,
    ...over,
  });
  const waiting = (runId: string, label: string, held: ManagedTask["held"], w: TaskWait | null, over = {}) =>
    task({
      runId,
      agentId: ADA_ID,
      label,
      status: "waiting_input",
      held,
      wait: w,
      background: true,
      requester: null,
      startedAt: ago(90),
      createdAt: ago(90),
      machine: { id: "machine_1", name: "Computador da Ada" },
      ...over,
    });
  const view = (tasks: ManagedTask[]): TaskManagerView => ({ tasks, ended: [], computers: [], activity: {} });
  const heat = (row: HTMLElement) => (row.querySelector(".tm-cell--time") as HTMLElement).style.getPropertyValue("--h");

  test("each wait says what holds it and what comes next, whole", async () => {
    const when = usageWhenShort(
      ((_key: string, v: Record<string, string>) => `${v.day} às ${v.time}`) as never,
      "pt-BR",
      SATURDAY,
    );
    await open(
      seedState({
        taskManager: view([
          waiting("r1", "Pausa do plano", "plan", wait()),
          waiting(
            "r2",
            "Pausa do orçamento",
            "budget",
            wait({ plan: null, window: null, percent: 96, key: "budget:a" }),
          ),
          waiting(
            "r3",
            "Limite do plano",
            "plan",
            wait({ code: "plan_limit", percent: null, window: null, key: "k3" }),
          ),
          waiting(
            "r4",
            "Limite do modelo",
            "plan",
            wait({ code: "plan_limit", scope: "model", model: "GLM-5.3", percent: null, resetsAt: null, key: "k4" }),
          ),
          waiting(
            "r5",
            "Região",
            "plan",
            wait({ code: "plan_limit", scope: "region", model: "DeepSeek V4 Pro", key: "k5" }),
          ),
          waiting("r6", "Orçamento no fim", "budget", wait({ code: "budget", percent: null, key: "k6" })),
          waiting("r7", "Fila de trabalhos", "computer_offline", wait({ code: "work_queue", key: null })),
          waiting("r8", "Computador longe", "computer_offline", wait({ code: "machine_offline", key: null })),
          waiting("r9", "Sem login", "computer_offline", wait({ code: "not_logged_in", key: null })),
          waiting("r10", "Falta o ok", null, null, { status: "waiting_approval" }),
          waiting("r11", "Falta a resposta", null, null),
        ]),
      }),
      "task-manager",
    );
    const back = `Volta ${when}`;
    expect(stateOf(rowOf("Pausa do plano"))).toEqual(["Pausada: plano a 95% da semana", back]);
    expect(stateOf(rowOf("Pausa do orçamento"))).toEqual(["Pausada: orçamento a 96% do mês", back]);
    expect(stateOf(rowOf("Limite do plano"))).toEqual(["Plano do Claude no limite", back]);
    expect(stateOf(rowOf("Limite do modelo"))).toEqual(["GLM-5.3 no limite", "Volta quando renovar"]);
    expect(stateOf(rowOf("Região"))).toEqual([
      "DeepSeek V4 Pro precisa da região Global",
      "Ligue no OpenCode (Settings\u00a0›\u00a0Privacy)",
    ]);
    expect(stateOf(rowOf("Orçamento no fim"))).toEqual(["Orçamento do mês acabou", back]);
    expect(stateOf(rowOf("Fila de trabalhos"))).toEqual([
      "Na fila de trabalhos do agente",
      "Começa quando outro trabalho terminar",
    ]);
    expect(stateOf(rowOf("Computador longe"))).toEqual(["Computador desligado", "Volta quando ele ligar"]);
    expect(stateOf(rowOf("Sem login"))).toEqual(["Esperando o computador", "Volta quando ele estiver pronto"]);
    expect(stateOf(rowOf("Falta o ok"))).toEqual(["Esperando você", "Segue quando alguém aprovar"]);
    expect(stateOf(rowOf("Falta a resposta"))).toEqual(["Espera resposta", "Segue quando alguém responder"]);
  });

  test("a row is one line that ends in …; its words whole in the kit's tip on the keys' focus and a resting pointer", async () => {
    await open(seedState({ taskManager: view([waiting("r1", "Pausa do plano", "plan", wait())]) }), "task-manager");
    const row = rowOf("Pausa do plano");
    const state = row.querySelector(".tm-cell--state") as HTMLElement;
    expect(state.querySelector(".ac-chip")).toBeNull();
    // The title, its place and the state on the row cut at their end; the rest of the wait only in the tip.
    const read = (file: string) => readFileSync(join(import.meta.dir, "../src", file), "utf8");
    const css = read("pages/task-manager.css");
    // The row's words and press are the shared pieces' (Agora's rows are the same).
    expect(read("components/tasks/tasks.css")).toMatch(
      /\.tm-hit \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/,
    );
    expect(css).toMatch(/\.tm-cell--state \.tm-state__text b,\s*\.tm-cell--use \.tm-use__text b \{[^}]*ellipsis/);
    // No row stacks its cells, not even with no room for the columns.
    expect(/line-clamp|grid-row/.test(css)).toBe(false);
    // A task's panel keeps them whole: the shared pieces never cut.
    expect(read("components/tasks/tasks.css")).not.toMatch(/\.tm-(use|state)[^{]*\{[^}]*(nowrap|text-overflow)/);
    expect(state.textContent).toBe("Pausada: plano a 95% da semana");
    const button = screen().getByRole("button", { name: "Pausa do plano" });
    // Never the browser's own tooltip.
    expect(button.getAttribute("title")).toBeNull();
    expect(document.querySelector(".ac-tip")).toBeNull();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: "Tab" });
      button.focus();
    });
    const tip = document.querySelector(".ac-tip.tm-tip") as HTMLElement;
    expect([...tip.children].map((line) => line.textContent)).toEqual([
      "Pausa do plano",
      "Ada · Em segundo plano",
      `Pausada: plano a 95% da semana · ${stateOf(row)[1]}`,
    ]);
    await act(async () => button.blur());
    expect(document.querySelector(".ac-tip")).toBeNull();
    await act(async () => {
      fireEvent.pointerEnter(button, { pointerType: "mouse" });
      await Bun.sleep(300);
    });
    expect(document.querySelector(".ac-tip.tm-tip")?.textContent).toContain("Pausa do plano");
  });

  test("a row its agent's face leads keeps how it stands as a mark when the columns don't fit", async () => {
    const routine = { id: "rt-send", name: "Envio semanal" };
    await open(
      seedState({
        taskManager: view([
          waiting("r1", "Aprovar o envio do relatório", undefined, null, { status: "waiting_approval", routine }),
          waiting("r2", "Montar o relatório da semana", undefined, null, { status: "running", routine }),
        ]),
      }),
      "task-manager",
    );
    const asks = rowOf("Aprovar o envio do relatório");
    const works = rowOf("Montar o relatório da semana");
    for (const row of [asks, works]) {
      expect(row.dataset.look).toBe("flat");
      expect(row.querySelector(".tm-cell--name .tm-mark")).toBeNull();
    }
    // A wait on you and work under way read apart: the waiting square, the orbit.
    expect(asks.querySelector(".tm-cell--state > .tm-mark .rq-wait")).not.toBeNull();
    expect(works.querySelector(".tm-cell--state > .tm-mark .ac-pixspin")).not.toBeNull();
    const css = readFileSync(join(import.meta.dir, "../src/pages/task-manager.css"), "utf8");
    const narrow = css.slice(css.indexOf("@container tm (max-width: 760px)"));
    expect(narrow).toContain('.tm-row:not(.tm-row--agent, .tm-row--ended, [data-look="flat"]) > .tm-cell--state,');
    expect(narrow).toMatch(/\.tm-row\[data-look="flat"\] \{\s*grid-template-columns: minmax\(0, 1fr\) auto auto 40px;/);
  });

  test("a paused conversation says how long it has been paused, never a clock of days", async () => {
    const dm = waiting("r-dm", "", "plan", wait({ since: ago(50 * 60) }), {
      background: false,
      channelKind: "dm",
      channelName: null,
      startedAt: ago(82 * 60 + 8),
      createdAt: ago(82 * 60 + 8),
    });
    await open(seedState({ taskManager: view([dm]) }), "task-manager");
    const ada = agentRowOf("Ada");
    expect(ada.querySelector(".tm-cell--time")?.textContent).toBe("2 dias");
    await openAgent("Ada");
    const row = rowOf("Conversa direta");
    expect(row.querySelector(".tm-cell--time")?.textContent).toBe("2 dias");
    expect(document.querySelector(".tm")?.textContent).not.toMatch(/\d+:\d\d:\d\d/);
    // An older server says no since when: from when it started.
    cleanup();
    await open(seedState({ taskManager: view([{ ...dm, wait: wait() }]) }), "task-manager");
    expect(agentRowOf("Ada").querySelector(".tm-cell--time")?.textContent).toBe("3 dias");
  });

  test("Tempo warms for work taking long, not for a wait", async () => {
    const running = task({
      runId: "r2",
      agentId: ADA_ID,
      label: "Trabalho longo",
      background: true,
      startedAt: ago(40),
    });
    const stuck = task({
      runId: "r3",
      agentId: ADA_ID,
      label: "Nunca começou",
      background: true,
      status: "queued",
      startedAt: null,
      createdAt: ago(40),
    });
    await open(
      seedState({ taskManager: view([waiting("r1", "Pausa do plano", "plan", wait()), running, stuck]) }),
      "task-manager",
    );
    expect(heat(rowOf("Pausa do plano"))).toBe("0");
    expect(heat(rowOf("Trabalho longo"))).toBe("1");
    expect(heat(rowOf("Nunca começou"))).toBe("1");
  });

  test("an agent whose tasks are all paused says why, not Na fila", async () => {
    const asked = waiting("r1", "Pedido longo", "plan", wait(), { background: false });
    await open(seedState({ taskManager: view([asked]) }), "task-manager");
    const row = document.querySelector(".tm-row--agent") as HTMLElement;
    expect(stateOf(row)[0]).toBe("Pausada: plano a 95% da semana");
  });

  const paused = (canContinue: boolean) =>
    view([
      waiting("r1", "Resumo diário", "plan", wait({ canContinue })),
      waiting("r2", "Backups", "plan", wait({ canContinue, percent: 96 })),
      waiting("r3", "Fora do grupo", "budget", wait({ plan: null, key: "budget:b", window: null })),
    ]);

  test("rows on the same limit: one line says why; Continuar agora goes on with them", async () => {
    const state = seedState({ taskManager: paused(true) });
    await open(state, "task-manager");
    const lines = [...document.querySelectorAll(".tm-waitline")];
    expect(lines).toHaveLength(1);
    const line = lines[0] as HTMLElement;
    expect(line.textContent).toContain("2 rotinas pausadas: o plano do Claude está em 96% da semana e volta ");
    expect(line.textContent).toContain("O restante fica para as conversas.");
    await click(within(line).getByRole("button", { name: "Continuar agora" }));
    expect(state.calls.find((c) => c.method === "working.continueTasks")?.args).toEqual([ORG_ID, ["r1", "r2"]]);
    expect(document.querySelector(".tm-waitline")).toBeNull();
  });

  test("who may not continue reads the line, with no button", async () => {
    await open(seedState({ taskManager: paused(false) }), "task-manager");
    const line = document.querySelector(".tm-waitline") as HTMLElement;
    expect(line.textContent).toContain("2 rotinas pausadas");
    expect(within(line).queryByRole("button")).toBeNull();
  });
});

describe("the stopped notice in the conversation", () => {
  const notice = (refs: Record<string, string>): Message => ({
    id: "m-stopped",
    channelId: DM_ADA,
    threadId: null,
    author: { type: "agent", id: ADA_ID },
    body: "Walter stopped your task.",
    mentionedAgentIds: [],
    agentRunId: null,
    meta: {
      notice: {
        kind: "run_stopped",
        text: "Walter stopped your task.",
        refs: { runId: "r-old", label: "Corrigir o link", was: "working", ...refs },
      },
    },
    createdAt: ago(2),
  });

  test("one calm line; who stopped it can still say why, and Ada reads it", async () => {
    const state = withDm();
    state.messages.push(notice({ byUserId: "u-walter", byName: "Walter" }));
    await open(state, `dm/agent/${ADA_ID}`);
    const line = document.querySelector(".cn-stopped") as HTMLElement;
    expect(line.textContent).toContain("Você parou a Ada");
    expect(line.textContent).not.toContain("Motivo");
    await click(within(line).getByRole("button", { name: "Dizer o motivo" }));
    const field = within(line).getByRole("textbox", { name: "Quer dizer por quê? (opcional)" });
    expect((within(line).getByRole("button", { name: "Mandar" }) as HTMLButtonElement).disabled).toBe(true);
    await type(field, "Já resolvi por outro caminho");
    await click(within(line).getByRole("button", { name: "Mandar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "agents.stopReason")?.args).toEqual([
      ORG_ID,
      "r-old",
      "Já resolvi por outro caminho",
    ]);
    const after = document.querySelector(".cn-stopped") as HTMLElement;
    expect(after.textContent).toContain("Motivo: «Já resolvi por outro caminho»");
    expect(within(after).queryByRole("button", { name: "Dizer o motivo" })).toBeNull();
  });

  test("someone else stopped it: their name, the reason they gave, and no Add a reason for me", async () => {
    const state = withDm();
    state.messages.push(notice({ byUserId: "u-joao", byName: "João", reason: "Mudou o plano" }));
    await open(state, `dm/agent/${ADA_ID}`);
    const line = document.querySelector(".cn-stopped") as HTMLElement;
    expect(line.textContent).toContain("João parou a Ada");
    expect(line.textContent).toContain("Motivo: «Mudou o plano»");
    expect(within(line).queryByRole("button", { name: "Dizer o motivo" })).toBeNull();
  });
});
