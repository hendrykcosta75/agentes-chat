import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { createFakeApi, ORG_ID, seedState } from "./fake-api";
import { hintOf, shownText } from "./hint";
import { renderApp, screen, settle } from "./render";

afterEach(() => cleanup());

const click = (el: Element) => act(async () => fireEvent.click(el));
const type = (el: Element, value: string) => act(async () => fireEvent.change(el, { target: { value } }));
const key = async (el: Element, k: string) => {
  await act(async () => {
    fireEvent.keyDown(el, { key: k });
    fireEvent.keyUp(el, { key: k });
  });
  await settle(1);
};
const open = async (prepare?: (api: ReturnType<typeof createFakeApi>) => Promise<unknown>) => {
  const state = seedState();
  const api = createFakeApi(state);
  await prepare?.(api);
  await renderApp(`/org/${ORG_ID}/routines`, { api });
  await settle(8);
  return { state, api };
};
const card = (name: string) => screen().getByRole("article", { name });
/** The strip's "Quando": the creation form's schedule and triggers, in a dialog of their own. */
const quando = async (page: HTMLElement) => {
  await click(within(page).getByRole("button", { name: /^Quando: / }));
  await settle(4);
};
const pick = async (combobox: HTMLElement, option: string | RegExp) => {
  combobox.focus();
  await key(combobox, "Enter");
  await click(within(screen().getByRole("listbox")).getByRole("option", { name: option }));
  await settle(3);
};
const menu = async (name: string, item: string) => {
  const trigger = within(card(name)).getByRole("button", { name: `Mais ações: ${name}` });
  trigger.focus();
  await key(trigger, "Enter");
  await click(within(screen().getByRole("menu")).getByRole("menuitem", { name: item }));
  await settle(4);
};

describe("Rotinas: editar, duplicar, apagar", () => {
  test("Faz sozinha: taking an action away from the routine's page undoes Sempre nesta rotina", async () => {
    const { state } = await open();
    await menu("Resumo da semana", "Editar");
    const page = screen().getByRole("dialog", { name: "Resumo da semana" });
    const remove = within(page).getByRole("button", { name: /^Voltar a pedir antes de: / });
    await click(remove);
    await settle(4);
    const update = state.calls.find((c) => c.method === "routines.update");
    expect(update?.args[1]).toEqual({ ownActions: [] });
    expect(within(page).queryByRole("button", { name: /^Voltar a pedir antes de: / })).toBeNull();
  });

  test("Editar opens the routine's page; Quando opens its schedule and Salvar sends only what changed", async () => {
    const { state } = await open();
    await menu("Resumo da semana", "Editar");
    const page = screen().getByRole("dialog", { name: "Resumo da semana" });
    expect(screen().queryByRole("dialog", { name: "Editar rotina" })).toBeNull();
    await quando(page);
    const dialog = screen().getByRole("dialog", { name: "Quando" });
    // Only the schedule: what it does, its name and its agent stay on the page.
    expect(within(dialog).queryByLabelText("O que fazer")).toBeNull();
    expect(within(dialog).queryByLabelText("Título")).toBeNull();
    expect((within(dialog).getByLabelText("Frequência") as HTMLInputElement).value).toBe("toda segunda às 9h");
    expect(dialog.textContent).toContain("Toda semana, seg, às 09:00");
    await type(within(dialog).getByLabelText("Frequência"), "dias úteis às 8h30");
    await settle(4);
    await click(within(dialog).getByRole("button", { name: "Salvar" }));
    await settle(6);
    const call = state.calls.find((c) => c.method === "routines.update");
    const patch = call?.args[1] as { trigger?: { type: string; rule?: unknown } };
    expect(Object.keys(patch)).toEqual(["trigger"]);
    // The phrase filled the picker; the rule is what's sent.
    expect(patch.trigger).toMatchObject({
      type: "schedule",
      rule: {
        freq: "daily",
        byWeekday: ["MO", "TU", "WE", "TH", "FR"],
        times: ["08:30"],
        timezone: "America/Sao_Paulo",
      },
    });
    expect(screen().getByText(/Rotina salva\. Próxima: /)).toBeTruthy();
    expect(screen().queryByRole("dialog", { name: "Quando" })).toBeNull();
    // The page under it says the new schedule, beside the agent and in the strip.
    expect(page.textContent).toContain("De segunda a sexta, às 08:30");
  });

  test("what it does on its own in connected apps: on its page, and in the new-routine form", async () => {
    await open();
    // "Editar" opens the routine's page, where everything edits in place; Faz sozinha is under what it does.
    await menu("Resumo da semana", "Editar");
    const page = screen().getByRole("dialog", { name: "Resumo da semana" });
    expect(within(page).getByRole("list", { name: "Faz sozinha" }).textContent).toBe("Enviar mensagem (Slack)");
    expect(shownText(page)).toContain("Cada execução faz isso sem pedir.");
    expect(hintOf("Faz sozinha", page).text).toContain(
      "Outros envios, exclusões, pagamentos e convites pedem aprovação antes",
    );
    await click(within(page).getByRole("button", { name: "Fechar detalhes" }));
    await settle(3);
    await click(screen().getByRole("button", { name: "Nova rotina" }));
    await settle(3);
    const fresh = screen().getByRole("dialog", { name: "Nova rotina" });
    expect(shownText(fresh)).toContain("Só pede aprovação antes de apagar, enviar ou pagar.");
    expect(hintOf("Faz sozinha", fresh).text).toContain("Nos apps conectados, ela faz as mudanças comuns sem pedir");
  });

  test("nothing changed: Salvar just closes", async () => {
    const { state } = await open();
    await menu("Resumo da semana", "Editar");
    await quando(screen().getByRole("dialog", { name: "Resumo da semana" }));
    await click(within(screen().getByRole("dialog", { name: "Quando" })).getByRole("button", { name: "Salvar" }));
    await settle(3);
    expect(state.calls.some((c) => c.method === "routines.update")).toBe(false);
    expect(screen().queryByRole("dialog", { name: "Quando" })).toBeNull();
  });

  test("a routine in UTC starts in my zone, with a hint to keep UTC", async () => {
    const { state } = await open((api) =>
      api.routines.create(ORG_ID, {
        name: "Antiga em UTC",
        agentId: seedState().agents[0]?.id ?? "",
        prompt: "Faça algo.",
        target: { type: "dm" },
        trigger: { type: "schedule", phrase: "toda segunda às 9h", timezone: "UTC" },
      }),
    );
    expect(card("Antiga em UTC").textContent).toContain("(UTC)");
    await menu("Antiga em UTC", "Editar");
    await quando(screen().getByRole("dialog", { name: "Antiga em UTC" }));
    const dialog = screen().getByRole("dialog", { name: "Quando" });
    expect(dialog.textContent).toContain("Esta rotina está em UTC. Quer usar o horário de Brasília?");
    expect(within(dialog).getByRole("combobox", { name: "Fuso horário" }).textContent).toContain(
      "Horário de Brasília · UTC−3",
    );
    await click(within(dialog).getByRole("button", { name: "Salvar" }));
    await settle(6);
    const patch = state.calls.find((c) => c.method === "routines.update")?.args[1] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(["trigger"]);
    expect(patch.trigger).toMatchObject({
      type: "schedule",
      rule: { freq: "weekly", byWeekday: ["MO"], times: ["09:00"], timezone: "America/Sao_Paulo" },
    });
  });

  test("Manter em UTC hides the hint and keeps the zone", async () => {
    const { state } = await open((api) =>
      api.routines.create(ORG_ID, {
        name: "Antiga em UTC",
        agentId: seedState().agents[0]?.id ?? "",
        prompt: "Faça algo.",
        target: { type: "dm" },
        trigger: { type: "schedule", phrase: "toda segunda às 9h", timezone: "UTC" },
      }),
    );
    await menu("Antiga em UTC", "Editar");
    await quando(screen().getByRole("dialog", { name: "Antiga em UTC" }));
    const dialog = screen().getByRole("dialog", { name: "Quando" });
    await click(within(dialog).getByRole("button", { name: "Manter em UTC" }));
    await settle(3);
    expect(dialog.textContent).not.toContain("Esta rotina está em UTC");
    await click(within(dialog).getByRole("button", { name: "Salvar" }));
    await settle(4);
    expect(state.calls.some((c) => c.method === "routines.update")).toBe(false);
  });

  test("Duplicar adds a paused copy; Apagar asks, naming it, then removes it", async () => {
    const { state } = await open();
    await menu("Resumo da semana", "Duplicar");
    expect(state.calls.some((c) => c.method === "routines.duplicate")).toBe(true);
    expect(card("Resumo da semana (cópia)").textContent).toContain("Pausada");
    await menu("Resumo da semana", "Apagar");
    const confirm = screen().getByRole("dialog", { name: "Apagar a rotina “Resumo da semana”?" });
    await click(within(confirm).getByRole("button", { name: "Apagar rotina" }));
    await settle(6);
    expect(state.calls.some((c) => c.method === "routines.remove")).toBe(true);
    expect(screen().queryByRole("article", { name: "Resumo da semana" })).toBeNull();
    expect(screen().getByText("Rotina apagada.")).toBeTruthy();
  });

  test("the card's agent is the living symbol with its look", async () => {
    const state = seedState();
    // "Resumo da semana" belongs to the 4th agent of the seed, round-robin.
    const agent = state.agents[3 % state.agents.length];
    if (agent) (agent as { appearance?: unknown }).appearance = { color: "amber", accessory: "hat" };
    await renderApp(`/org/${ORG_ID}/routines`, { api: createFakeApi(state) });
    await settle(8);
    const avatar = card("Resumo da semana").querySelector(".ac-avatar--agent") as HTMLElement;
    expect(avatar.getAttribute("data-accessory")).toBe("hat");
    expect(avatar.style.getPropertyValue("--av-top")).toBeTruthy();
  });
});

describe("Rotinas: the routine's page, edited where it is", () => {
  const page = async () => {
    await click(within(card("Resumo da semana")).getByRole("button", { name: "Resumo da semana" }));
    await settle(4);
    return screen().getByRole("dialog", { name: "Resumo da semana" });
  };
  /** Its fields as one strip under its head, no side column. */
  const aside = (dialog: HTMLElement) => within(dialog).getByRole("group", { name: /^Detalhes: / });
  const lastPatch = (state: ReturnType<typeof seedState>) =>
    state.calls.filter((c) => c.method === "routines.update").at(-1)?.args[1];

  test("full height: Rodar agora on the bar, Detalhes and Execuções, the strip; no Editar or Pausar", async () => {
    await open();
    const dialog = await page();
    expect(dialog.className).toContain("ac-details--fill");
    expect(within(dialog).getByRole("heading", { level: 1, name: "Resumo da semana" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Rodar agora" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Editar" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Pausar" })).toBeNull();
    expect(within(dialog).getByRole("tab", { name: "Detalhes" }).getAttribute("aria-selected")).toBe("true");
    expect(within(dialog).getByRole("tab", { name: /^Execuções/ })).toBeTruthy();
    expect(within(aside(dialog)).getByRole("combobox", { name: "Quem faz" })).toBeTruthy();
    expect(within(dialog).queryByRole("complementary", { name: /^Detalhes: / })).toBeNull();
    // Its controls in the order of the old side column, under the head and over the tabs.
    const strip = aside(dialog);
    expect(strip.classList.contains("ac-props")).toBe(true);
    expect(strip.parentElement?.previousElementSibling?.classList.contains("issue-details__head")).toBe(true);
    // Its next run and this week's use on a quiet line under it.
    expect(strip.nextElementSibling?.classList.contains("routine-props__line")).toBe(true);
    expect(
      [...strip.querySelectorAll('[role="switch"], [role="combobox"], button[aria-haspopup="dialog"]')].map((c) =>
        c.getAttribute("aria-label")?.replace(/:.*$/, ""),
      ),
    ).toEqual(["No ar", "Quem faz", "Quando", "Onde entrega", "Quando posta"]);
  });

  test("renaming in place: Enter saves it and Salvo shows by Rotina", async () => {
    const { state } = await open();
    const dialog = await page();
    await click(within(dialog).getByRole("heading", { level: 1, name: "Resumo da semana" }));
    const field = within(dialog).getByRole("textbox", { name: "Nome da rotina" }) as HTMLInputElement;
    expect(field.value).toBe("Resumo da semana");
    await type(field, "Resumo de segunda");
    await key(field, "Enter");
    await settle(4);
    expect(lastPatch(state)).toEqual({ name: "Resumo de segunda" });
    expect(within(dialog).getByRole("heading", { level: 1, name: "Resumo de segunda" })).toBeTruthy();
    expect(within(dialog).getByText("Salvo")).toBeTruthy();
  });

  test("an empty name keeps the old one and sends nothing", async () => {
    const { state } = await open();
    const dialog = await page();
    await click(within(dialog).getByRole("button", { name: "Editar o nome" }));
    const field = within(dialog).getByRole("textbox", { name: "Nome da rotina" });
    await type(field, "   ");
    await act(async () => fireEvent.blur(field));
    await settle(3);
    expect(state.calls.some((c) => c.method === "routines.update")).toBe(false);
    expect(within(dialog).getByRole("heading", { level: 1, name: "Resumo da semana" })).toBeTruthy();
  });

  test("what it does, edited in place: leaving the box saves it", async () => {
    const { state } = await open();
    const dialog = await page();
    expect(dialog.textContent).toContain("Resuma o que aconteceu na semana");
    await click(within(dialog).getByRole("button", { name: "Editar o que ela faz" }));
    const box = within(dialog).getByRole("textbox", { name: "O que fazer" }) as HTMLTextAreaElement;
    expect(box.value).toContain("Resuma o que aconteceu na semana");
    await type(box, "Resuma a semana em cinco linhas.");
    await act(async () => fireEvent.blur(box));
    await settle(4);
    expect(lastPatch(state)).toEqual({ prompt: "Resuma a semana em cinco linhas." });
    expect(within(dialog).queryByRole("textbox", { name: "O que fazer" })).toBeNull();
    expect(dialog.textContent).toContain("Resuma a semana em cinco linhas.");
  });

  test("No ar is a switch in the strip: off pauses it and says what that means", async () => {
    const { state } = await open();
    const dialog = await page();
    expect(aside(dialog).textContent).toContain("Roda sozinha quando chega a hora");
    await click(within(aside(dialog)).getByRole("switch", { name: "No ar" }));
    await settle(5);
    expect(state.calls.some((c) => c.method === "routines.setActive" && c.args[1] === false)).toBe(true);
    expect(within(aside(dialog)).getByRole("switch", { name: "No ar" }).getAttribute("aria-checked")).toBe("false");
    expect(aside(dialog).textContent).toContain("Não roda até você ligar");
    expect(screen().getByText(/Rotina pausada\./)).toBeTruthy();
  });

  test("Onde entrega changes at once from the strip, with who sees it as its meaning", async () => {
    const { state } = await open();
    const dialog = await page();
    expect(aside(dialog).textContent).toContain("Todo mundo do canal vê");
    await pick(within(aside(dialog)).getByRole("combobox", { name: "Onde entrega" }), /^Minha DM com o agente/);
    await settle(3);
    expect(lastPatch(state)).toEqual({ target: { type: "dm" } });
    expect(aside(dialog).textContent).toContain("Só você vê");
    expect(aside(dialog).textContent).not.toContain("Todo mundo do canal vê");
  });

  test("Quando posta changes at once, its meaning behind the ⓘ", async () => {
    const { state } = await open();
    const dialog = await page();
    expect(within(aside(dialog)).getByRole("button", { name: "Sobre Quando posta" })).toBeTruthy();
    await pick(within(aside(dialog)).getByRole("combobox", { name: "Quando posta" }), /^Toda vez/);
    expect(lastPatch(state)).toEqual({ report: "always" });
  });
});

describe("routine titles", () => {
  test("a name that is the whole prompt becomes a short title from its first line", async () => {
    const { routineTitle } = await import("@/pages/RoutinesPage");
    expect(routineTitle({ name: "Resumo da semana", prompt: "Resuma a semana." })).toBe("Resumo da semana");
    const prompt =
      "Relatório de visitantes do site com origem, páginas mais vistas e conversões da semana passada\nDetalhes: …";
    const title = routineTitle({ name: prompt, prompt });
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
    expect(prompt.startsWith(title.slice(0, -1))).toBe(true);
  });
});
