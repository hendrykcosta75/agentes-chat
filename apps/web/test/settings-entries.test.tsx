import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { createFakeApi, LODI_ID, ORG_ID, seedState, withRightHand } from "./fake-api";
import { renderApp, screen, settle } from "./render";

/* A team's settings: a short list of entries, each a page whose tabs are the sections it holds, the rest under
   Advanced. Every section keeps its address, which opens its entry on that tab. */

afterEach(() => cleanup());

type State = ReturnType<typeof seedState>;
const go = async (path: string, state: State = seedState()) => {
  const r = await renderApp(`/org/${ORG_ID}/${path}`, { api: createFakeApi(state) });
  await settle(6);
  return { ...r, state };
};
const nav = () => screen().getByRole("navigation", { name: "Seções das configurações" });
const rows = () => [...nav().querySelectorAll(".settings__link")].map((l) => l.lastChild?.textContent);
const marked = () => nav().querySelector('[aria-current="page"]')?.lastChild?.textContent;
/** The entry's own tab strip (IA e uso has tabs of its own inside, which are not sections). */
const STRIP = '.settings__body [role="tablist"]:not([aria-label="IA e uso"])';
const tabs = () => [...document.querySelectorAll(`${STRIP} [role="tab"]`)].map((t) => t.textContent);
const chosen = () => document.querySelector(`${STRIP} [role="tab"][aria-selected="true"]`)?.textContent;

describe("the list", () => {
  test("a self-hosted team's: six entries with no group names, then Advanced, closed, with Devices under it", async () => {
    await go("settings", seedState({ authConfig: { cloud: false } }));
    expect(rows()).toEqual(["Sua conta", "Workspace", "Pessoas", "Cargos", "IA e uso", "Conectores", "Avançado"]);
    expect(marked()).toBe("Workspace");
    const advanced = within(nav()).getByRole("button", { name: "Avançado" });
    expect(advanced.getAttribute("aria-expanded")).toBe("false");
    await act(async () => fireEvent.click(advanced));
    expect(rows().slice(7)).toEqual([
      "Dispositivos",
      "Armazenamento",
      "Importar e exportar",
      "Auditoria",
      "Sobre o agentes.chat",
    ]);
  });

  test("on agentes.chat Cloud Devices is the seventh entry, and Advanced holds the rest", async () => {
    await go("settings", seedState({ authConfig: { cloud: true } }));
    expect(rows()).toEqual([
      "Sua conta",
      "Workspace",
      "Pessoas",
      "Cargos",
      "IA e uso",
      "Conectores",
      "Dispositivos",
      "Avançado",
    ]);
    await act(async () => fireEvent.click(within(nav()).getByRole("button", { name: "Avançado" })));
    expect(rows().slice(8)).toEqual(["Armazenamento", "Importar e exportar", "Auditoria"]);
  });

  test("a member keeps the entries they open, each with only their tabs", async () => {
    const state = seedState({ authConfig: { cloud: true } });
    if (state.me?.organizations[0]) state.me.organizations[0].role = "member";
    await go("settings/connectors", state);
    expect(rows()).toEqual(["Sua conta", "Pessoas", "IA e uso", "Conectores", "Dispositivos"]);
    expect(tabs()).toEqual(["Conectores e MCPs", "Cofre"]);
  });

  test("the tile grid is gone from Geral", async () => {
    await go("settings/general");
    expect(document.querySelector(".settings-tiles, .settings-tile")).toBeNull();
    expect(screen().queryByText("Tudo do workspace")).toBeNull();
  });
});

describe("every old address opens its new home", () => {
  const homes: [section: string, entry: string, tab: string | undefined][] = [
    ["account", "Sua conta", "Perfil"],
    ["notifications", "Sua conta", "Notificações"],
    ["approvals", "Sua conta", "Aprovações"],
    ["apps", "Sua conta", "Apps de IA"],
    ["general", "Workspace", "Geral"],
    ["media", "Workspace", "GIFs e figurinhas"],
    ["voice", "Workspace", "Voz"],
    ["members", "Pessoas", "Membros"],
    ["invites", "Pessoas", "Convites"],
    ["roles", "Cargos", undefined],
    ["usage", "IA e uso", undefined],
    ["connectors", "Conectores", "Conectores e MCPs"],
    ["skills", "Conectores", "Skills"],
    ["vault", "Conectores", "Cofre"],
    ["access", "Conectores", "Agentes e acesso"],
    ["devices", "Dispositivos", undefined],
    ["storage", "Armazenamento", undefined],
    ["import", "Importar e exportar", undefined],
    ["audit", "Auditoria", undefined],
    ["about", "Sobre o agentes.chat", undefined],
  ];
  for (const [section, entry, tab] of homes)
    test(`/settings/${section} → ${entry}${tab ? ` › ${tab}` : ""}`, async () => {
      const { router } = await go(`settings/${section}`, seedState({ authConfig: { cloud: false } }));
      expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/${section}`);
      expect(marked()).toBe(entry);
      expect(chosen()).toBe(tab);
    });

  test("the tabs of an entry are its sections, and a tab opens that section's address", async () => {
    const { router } = await go("settings/account");
    expect(tabs()).toEqual(["Perfil", "Notificações", "Aprovações", "Apps de IA"]);
    await act(async () => fireEvent.mouseDown(screen().getByRole("tab", { name: "Notificações" }), { button: 0 }));
    await settle(6);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/notifications`);
    expect(marked()).toBe("Sua conta");
    expect(screen().getByRole("heading", { level: 2, name: "Notificações" })).toBeTruthy();
  });

  test("billing stands under IA e uso, and its own address marks that entry", async () => {
    const state = seedState({ authConfig: { cloud: true, billingUrl: "https://billing.example.com" } });
    await go("settings/usage", state);
    expect(screen().getByRole("heading", { level: 2, name: "Plano e cobrança" })).toBeTruthy();
    cleanup();
    await go("settings/billing", state);
    expect(marked()).toBe("IA e uso");
  });

  test("AI accounts and Computers still open where they moved", async () => {
    for (const [old, now] of [
      ["keys", "usage"],
      ["computers", "devices"],
    ]) {
      const { router } = await go(`settings/${old}`);
      expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/${now}`);
      cleanup();
    }
  });

  test("the right hand left the settings: its old address opens its own page, and no entry or tab names it", async () => {
    const { router } = await go("settings/right_hand", withRightHand(seedState()));
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/agents/${LODI_ID}`);
    cleanup();
    await go("settings/general", withRightHand(seedState()));
    await act(async () => fireEvent.click(within(nav()).getByRole("button", { name: "Avançado" })));
    expect(rows().join(" ")).not.toMatch(/Lodi|Braço direito/);
    expect(tabs().join(" ")).not.toMatch(/Lodi|Braço direito/);
  });
});
