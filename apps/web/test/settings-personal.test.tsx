import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import type { OrgRole } from "@agenteschat/client";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { ADMIN_ROLE_ID, createFakeApi, ORG_ID, seedRoles, seedState } from "./fake-api";
import { shownText } from "./hint";
import { renderApp, screen, settle } from "./render";

/* Settings in a personal workspace (ADR 0159 §3, §4): one short list and Advanced, About you with the Mode row, the
   switch both ways, and the question inviting asks. Only the view changes: every section still opens. */

afterEach(() => cleanup());

type State = ReturnType<typeof seedState>;
/** Acme as a personal workspace (Walter, its owner, and João). */
const personal = () => {
  const state = seedState();
  const org = state.me?.organizations[0];
  if (org) org.mode = "personal";
  return state;
};
/** The same, with Walter its only member. */
const alone = () => {
  const state = personal();
  state.members = state.members.filter((m) => m.userId === state.me?.user.id);
  return state;
};
const go = async (state: State, path = "settings") => {
  await renderApp(`/org/${ORG_ID}/${path}`, { api: createFakeApi(state) });
  await settle(6);
  return state;
};
const click = async (el: Element) => {
  await act(async () => fireEvent.click(el));
  await settle(4);
};
const type = (el: Element, value: string) => act(async () => fireEvent.change(el, { target: { value } }));
const nav = () => screen().getByRole("navigation", { name: "Seções das configurações" });
/** The list's rows by their words (the account's face left out), the Advanced row included. */
const rows = () => [...nav().querySelectorAll(".settings__link")].map((l) => l.lastChild?.textContent);
const marked = () => nav().querySelector('[aria-current="page"]')?.lastChild?.textContent;
const settingsCalls = (state: State) =>
  state.calls.filter((c) => c.method === "orgs.updateSettings").map((c) => c.args[1]);

describe("a personal workspace's settings list", () => {
  test("one list without groups: the six sections, then Advanced, closed; About you opens first", async () => {
    await go(alone());
    expect(nav().querySelector(".settings__group-label")).toBeNull();
    expect(rows()).toEqual([
      "Sua conta",
      "Sobre você",
      "IA e uso",
      "Conectores e MCPs",
      "Cofre",
      "Dispositivos",
      "Avançado",
    ]);
    expect(within(nav()).getByRole("button", { name: "Avançado" }).getAttribute("aria-expanded")).toBe("false");
    expect(marked()).toBe("Sobre você");
    expect(screen().getByRole("heading", { level: 2, name: "Sobre você" })).toBeTruthy();
  });

  test("with someone else here, People joins the list after About you", async () => {
    await go(personal());
    expect(rows()).toEqual([
      "Sua conta",
      "Sobre você",
      "Pessoas",
      "IA e uso",
      "Conectores e MCPs",
      "Cofre",
      "Dispositivos",
      "Avançado",
    ]);
  });

  test("Advanced shows every other section no entry holds; what an entry holds is a tab of its page", async () => {
    await go(alone());
    await click(within(nav()).getByRole("button", { name: "Avançado" }));
    expect(within(nav()).getByRole("button", { name: "Avançado" }).getAttribute("aria-expanded")).toBe("true");
    const all = rows();
    for (const name of ["Pessoas", "Cargos", "Auditoria", "Armazenamento"]) {
      expect(all).toContain(name);
      expect(all.indexOf(name)).toBeGreaterThan(all.indexOf("Avançado"));
    }
    expect(all.filter((name) => name === "Conectores e MCPs")).toHaveLength(1);
    expect(all.indexOf("Conectores e MCPs")).toBeLessThan(all.indexOf("Avançado"));
    // Notifications are a tab of Your account, Skills of Connectors: not listed again.
    for (const name of ["Notificações", "Skills"]) expect(all).not.toContain(name);
    cleanup();
    await go(alone(), "settings/skills");
    expect(marked()).toBe("Conectores e MCPs");
    expect(screen().getByRole("tab", { name: "Skills" }).getAttribute("aria-selected")).toBe("true");
    // The Vault has its own line in a personal workspace's list, so it is no tab here.
    expect(screen().queryByRole("tab", { name: "Cofre" })).toBeNull();
  });

  test("a section of Advanced opened by its address shows open in the list, marked", async () => {
    await go(personal(), "settings/audit");
    expect(within(nav()).getByRole("button", { name: "Avançado" }).getAttribute("aria-expanded")).toBe("true");
    expect(marked()).toBe("Auditoria");
    cleanup();
    // Cargos is a section of its own (ADR 0085 addendum of 2026-11-13), under Advanced in a personal workspace.
    await go(personal(), "settings/roles");
    expect(marked()).toBe("Cargos");
  });

  test("the old address of AI accounts opens AI and usage, where the accounts and the keys are", async () => {
    await go(personal(), "settings/keys");
    expect(marked()).toBe("IA e uso");
    expect(screen().getByRole("region", { name: "Contas" })).toBeTruthy();
    expect(screen().getByRole("region", { name: "Chaves de provedor" })).toBeTruthy();
    // Connectors and Skills are sections of their own: not on this page.
    expect(screen().queryByRole("heading", { level: 2, name: "Conectores e MCPs" })).toBeNull();
    expect(screen().queryByRole("heading", { level: 2, name: "Skills" })).toBeNull();
  });

  test("AI and usage holds Plan and billing where a billing service runs", async () => {
    const state = personal();
    state.authConfig = { ...state.authConfig, billingUrl: "https://billing.example.com" };
    await go(state, "settings/usage");
    expect(marked()).toBe("IA e uso");
    expect(screen().getAllByRole("heading", { level: 2, name: "IA e uso" }).length).toBeGreaterThan(0);
    expect(screen().getByRole("heading", { level: 2, name: "Plano e cobrança" })).toBeTruthy();
    expect(rows()).not.toContain("Plano e cobrança");
  });

  test("a team's settings are a short list too, in a team's words", async () => {
    await go(seedState());
    expect(nav().querySelector(".settings__group-label")).toBeNull();
    expect(within(nav()).getByRole("button", { name: "Avançado" })).toBeTruthy();
    expect(rows()).toContain("Workspace");
    expect(rows()).not.toContain("Sobre você");
  });

  test("⌘K lists About you, found by General too", async () => {
    await go(personal(), "settings/account");
    await act(async () => fireEvent.keyDown(window, { key: "k", metaKey: true }));
    await type(screen().getByRole("combobox", { name: "Ir para, ou pedir a um agente" }), "geral");
    expect(screen().queryByRole("option", { name: /Sobre você/ })).not.toBeNull();
  });
});

describe("About you", () => {
  test("the context first, in the person's words; then zone, name, checks and mode; no tiles or logo", async () => {
    await go(personal(), "settings/general");
    const context = screen().getByRole("region", { name: "O que os seus agentes sabem de você" });
    const workspace = screen().getByRole("region", { name: "Este workspace" });
    expect(context.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(context).getByLabelText("Sobre você").getAttribute("placeholder")).toContain("Sou professor");
    expect(within(context).getByRole("button", { name: "Quem mora com você" })).toBeTruthy();
    expect(within(workspace).getByLabelText("Nome do workspace")).toBeTruthy();
    expect(within(workspace).getByRole("switch", { name: "Agentes conferem o que já foi feito" })).toBeTruthy();
    expect(within(workspace).getByText("Pessoal")).toBeTruthy();
    expect(within(workspace).getByRole("button", { name: "Mudar para time" })).toBeTruthy();
    expect(screen().queryByRole("region", { name: "Tudo do workspace" })).toBeNull();
    expect(within(workspace).queryByRole("button", { name: "Enviar logo" })).toBeNull();
  });

  test("Switch to team asks the workspace's name and switches it, with that name", async () => {
    const state = await go(personal(), "settings/general");
    await click(screen().getByRole("button", { name: "Mudar para time" }));
    const dialog = screen().getByRole("dialog", { name: "Mudar para um workspace de time" });
    expect(dialog.querySelectorAll(".deletion-lines > li")).toHaveLength(3);
    expect(dialog.textContent).toContain("Seus agentes, conversas, rotinas e arquivos continuam como estão.");
    const name = within(dialog).getByLabelText("Nome do workspace") as HTMLInputElement;
    expect(name.value).toBe("Acme");
    await type(name, "Oficina");
    await click(within(dialog).getByRole("button", { name: "Mudar para time" }));
    await settle(6);
    expect(settingsCalls(state)).toContainEqual({ mode: "team", name: "Oficina" });
    // The shell reshapes from `me`: Settings are a team's again.
    expect(screen().getByRole("heading", { level: 2, name: "Geral" })).toBeTruthy();
  });

  test("an empty name can't switch to team", async () => {
    await go(personal(), "settings/general");
    await click(screen().getByRole("button", { name: "Mudar para time" }));
    const dialog = screen().getByRole("dialog", { name: "Mudar para um workspace de time" });
    await type(within(dialog).getByLabelText("Nome do workspace"), "  ");
    expect(within(dialog).getByRole("button", { name: "Mudar para time" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("a team's General", () => {
  test("its Mode row switches to personal, saying the other member sees it too", async () => {
    const state = await go(seedState(), "settings/general");
    const workspace = screen().getByRole("region", { name: "Workspace" });
    expect(within(workspace).getByText("Time")).toBeTruthy();
    await click(within(workspace).getByRole("button", { name: "Mudar para pessoal" }));
    const dialog = screen().getByRole("dialog", { name: "Mudar para um workspace pessoal" });
    expect(dialog.textContent).toContain("A outra pessoa daqui também vê assim");
    expect(within(dialog).queryByLabelText("Nome do workspace")).toBeNull();
    await click(within(dialog).getByRole("button", { name: "Mudar para pessoal" }));
    await settle(6);
    expect(settingsCalls(state)).toContainEqual({ mode: "personal" });
    expect(screen().getByRole("heading", { level: 2, name: "Sobre você" })).toBeTruthy();
  });

  test("alone in it, the switch says nothing about others", async () => {
    const state = seedState();
    state.members = state.members.filter((m) => m.userId === state.me?.user.id);
    await go(state, "settings/general");
    await click(screen().getByRole("button", { name: "Mudar para pessoal" }));
    const dialog = screen().getByRole("dialog", { name: "Mudar para um workspace pessoal" });
    expect(dialog.textContent).not.toContain("também vê");
    expect(dialog.querySelectorAll(".deletion-lines > li")).toHaveLength(4);
  });
});

describe("inviting in a personal workspace", () => {
  const question = () => screen().getByRole("dialog", { name: "Quem você vai convidar?" });

  test("asks who first; family keeps it personal and opens the invite dialog in its words", async () => {
    const state = await go(personal(), "settings/members");
    await click(screen().getAllByRole("button", { name: "Convidar pessoas" })[0] as HTMLElement);
    expect(screen().queryByRole("dialog", { name: "Convidar alguém para o seu workspace" })).toBeNull();
    const family = within(question()).getByRole("radio", { name: /^Família ou amigos/ });
    expect(family.getAttribute("aria-checked")).toBe("true");
    await click(within(question()).getByRole("button", { name: "Continuar" }));
    expect(screen().getByRole("dialog", { name: "Convidar alguém para o seu workspace" })).toBeTruthy();
    expect(screen().queryByRole("dialog", { name: "Quem você vai convidar?" })).toBeNull();
    expect(settingsCalls(state)).toEqual([]);
  });

  test("work switches it to a team's first, then the invite dialog opens", async () => {
    const state = await go(personal(), "settings/members");
    await click(screen().getAllByRole("button", { name: "Convidar pessoas" })[0] as HTMLElement);
    await click(within(question()).getByRole("radio", { name: /^Pessoas com quem você trabalha/ }));
    await click(within(question()).getByRole("button", { name: "Continuar" }));
    const dialog = screen().getByRole("dialog", { name: "Mudar para um workspace de time" });
    await click(within(dialog).getByRole("button", { name: "Mudar para time" }));
    await settle(6);
    expect(settingsCalls(state)).toEqual([{ mode: "team" }]);
    expect(screen().getByRole("dialog", { name: /^Convidar / })).toBeTruthy();
  });

  test("Copy invitation link asks too, and copies only once answered", async () => {
    const state = await go(personal(), "settings/members");
    await click(screen().getByRole("button", { name: "Copiar link de convite" }));
    expect(question()).toBeTruthy();
    expect(state.calls.some((c) => c.method === "invites.createLink")).toBe(false);
    await click(within(question()).getByRole("button", { name: "Cancelar" }));
    expect(screen().queryByRole("dialog", { name: "Quem você vai convidar?" })).toBeNull();
  });

  test("a family member joins with a plain choice, Pode: uses the agents, or helps run it (Admin), each said behind ⓘ", async () => {
    await go(personal(), "settings/members");
    await click(screen().getAllByRole("button", { name: "Convidar pessoas" })[0] as HTMLElement);
    await click(within(question()).getByRole("button", { name: "Continuar" }));
    const dialog = screen().getByRole("dialog", { name: "Convidar alguém para o seu workspace" });
    expect([...dialog.querySelectorAll(".ac-field__label")].map((l) => l.textContent)).toEqual([
      "Para",
      "Pode",
      "Conversas",
      "Agentes",
    ]);
    const can = within(dialog).getByRole("combobox", { name: "Pode" });
    expect(can.textContent).toBe("Usa os agentes");
    can.focus();
    await act(async () => fireEvent.keyDown(can, { key: "Enter" }));
    const options = screen().getAllByRole("option");
    expect(options.map((o) => shownText(o).trim())).toEqual(["Usa os agentes", "Ajuda a cuidar daqui"]);
    // What the helper sees is said, DMs left out.
    expect(document.body.textContent).toContain("menos as suas conversas diretas");
  });

  test("another role comes after the two by its name; Admin is sent", async () => {
    const state = personal();
    const [admin, everyone] = seedRoles() as [OrgRole, OrgRole];
    state.roles = [
      admin,
      { ...admin, id: "role-kids", name: "Crianças", permissions: ["post"], position: 1 },
      everyone,
    ];
    await go(state, "settings/members");
    await click(screen().getAllByRole("button", { name: "Convidar pessoas" })[0] as HTMLElement);
    await click(within(question()).getByRole("button", { name: "Continuar" }));
    const dialog = screen().getByRole("dialog", { name: "Convidar alguém para o seu workspace" });
    const to = within(dialog).getByLabelText("Para");
    await type(to, "nova@exemplo.com.br");
    await act(async () => fireEvent.keyDown(to, { key: "Enter" }));
    const can = within(dialog).getByRole("combobox", { name: "Pode" });
    can.focus();
    await act(async () => fireEvent.keyDown(can, { key: "Enter" }));
    expect(
      screen()
        .getAllByRole("option")
        .map((o) => shownText(o).trim()),
    ).toEqual(["Usa os agentes", "Ajuda a cuidar daqui", "Crianças"]);
    await click(screen().getByRole("option", { name: /Ajuda a cuidar daqui/ }));
    await settle(2);
    await click(within(dialog).getByRole("button", { name: "Convidar 1 pessoa" }));
    await settle(6);
    expect(state.calls.find((c) => c.method === "orgs.inviteMany")?.args[1]).toMatchObject({
      emails: ["nova@exemplo.com.br"],
      roleIds: [ADMIN_ROLE_ID],
    });
  });
});

describe("inviting in a team's workspace", () => {
  test("opens the invite dialog at once, no question", async () => {
    await go(seedState(), "settings/members");
    await click(screen().getAllByRole("button", { name: "Convidar pessoas" })[0] as HTMLElement);
    expect(screen().queryByRole("dialog", { name: "Quem você vai convidar?" })).toBeNull();
    expect(screen().getByRole("dialog", { name: "Convidar para a Acme" })).toBeTruthy();
  });
});
