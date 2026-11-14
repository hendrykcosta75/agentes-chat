import { afterEach, describe, expect, test } from "bun:test";
import { domWindow, setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { createFakeApi, ORG_ID, seedState } from "./fake-api";
import { renderApp, screen, settle } from "./render";

afterEach(() => cleanup());

const click = (el: Element) => act(async () => fireEvent.click(el));
const type = (el: Element, value: string) => act(async () => fireEvent.change(el, { target: { value } }));
// The workspace card opens a full-screen menu (MenuOverlay): a dialog with our menu items.
const openMenu = async (trigger: HTMLElement) => {
  await act(async () => fireEvent.click(trigger));
  await act(() => new Promise((r) => setTimeout(r, 0)));
  return screen().getAllByRole("menu")[0] as HTMLElement;
};
/** An item's name without its count chip, shortcut or description. */
const itemName = (el: Element) => el.querySelector(".ac-mo__name")?.firstChild?.textContent ?? "";
const go = async (path: string, state = seedState()) => {
  const r = await renderApp(`/org/${ORG_ID}/${path}`, { api: createFakeApi(state) });
  await settle(6);
  return { ...r, state };
};

describe("finding the settings", () => {
  test("the workspace header opens its full-screen menu: invite, members, settings sections", async () => {
    const { router } = await go("issues");
    const menu = await openMenu(screen().getByRole("button", { name: "Menu do workspace Acme" }));
    expect(within(menu).getAllByRole("menuitem").map(itemName)).toEqual([
      "Convidar pessoas",
      "Membros",
      "Conectores e MCPs",
      "Agentes e acesso",
      "Skills",
      "Configurações do workspace",
    ]);
    await click(within(menu).getByRole("menuitem", { name: /^Conectores/ }));
    await settle(6);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/connectors`);
    // The section's own title (the connectors card has a "Conectores" heading too).
    expect(document.querySelector(".settings__body .ac-pagehead h2")?.textContent).toBe("Conectores e MCPs");
  });

  test("the workspace menu lists my workspaces (this one marked) and a digit opens an option", async () => {
    const { router } = await go("issues");
    await openMenu(screen().getByRole("button", { name: "Menu do workspace Acme" }));
    const dialog = screen().getByRole("dialog", { name: "Acme" });
    const mine = within(dialog).getByRole("menu", { name: "Seus workspaces" });
    const current = within(mine)
      .getAllByRole("menuitem")
      .find((i) => i.getAttribute("aria-current"));
    expect(current?.textContent).toContain("Você está aqui");
    await act(async () => fireEvent.keyDown(dialog, { key: "3" }));
    await settle(6);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/connectors`);
    expect(document.documentElement.hasAttribute("data-menu-overlay")).toBe(false);
  });

  test("New workspace only for whoever can make one (on agentes.chat Cloud, by invitation for now)", async () => {
    for (const [can, offered] of [
      [undefined, true],
      [false, false],
    ] as const) {
      const state = seedState();
      if (state.me && can === false) state.me.user.canCreateWorkspace = false;
      await go("issues", state);
      await openMenu(screen().getByRole("button", { name: "Menu do workspace Acme" }));
      const mine = within(screen().getByRole("dialog", { name: "Acme" })).getByRole("menu", {
        name: "Seus workspaces",
      });
      expect(within(mine).queryByRole("menuitem", { name: /Novo workspace/ }) !== null).toBe(offered);
      cleanup();
    }
  });

  test("members see only what they can open", async () => {
    const state = seedState();
    if (state.me?.organizations[0]) state.me.organizations[0].role = "member";
    await go("issues", state);
    const menu = await openMenu(screen().getByRole("button", { name: "Menu do workspace Acme" }));
    expect(within(menu).getAllByRole("menuitem").map(itemName)).toEqual([
      "Membros",
      "Conectores e MCPs",
      "Configurações do workspace",
    ]);
  });

  test("the account card is one button, no gear beside it (settings open from its menu and the workspace's)", async () => {
    await go("issues");
    const nav = screen().getByRole("navigation", { name: "Navegação do workspace" });
    expect(within(nav).queryByRole("link", { name: "Configurações" })).toBeNull();
  });

  test("every section has its own URL, with the sub-nav marking it", async () => {
    // Each with the entry of the list that holds it.
    const sections: [string, string, string][] = [
      ["account", "Sua conta", "account"],
      ["general", "Geral", "general"],
      ["members", "Membros", "members"],
      ["invites", "Convites", "members"],
      ["access", "Agentes e acesso", "connectors"],
      ["connectors", "Conectores e MCPs", "connectors"],
      ["skills", "Skills", "connectors"],
      ["storage", "Armazenamento", "storage"],
      ["devices", "Dispositivos", "devices"],
      ["usage", "IA e uso", "usage"],
      ["import", "Importar e exportar", "import"],
    ];
    for (const [id, heading, entry] of sections) {
      await go(`settings/${id}`);
      expect(screen().getAllByRole("heading", { level: 2, name: heading }).length).toBeGreaterThan(0);
      const nav = screen().getByRole("navigation", { name: "Seções das configurações" });
      const current = within(nav)
        .getAllByRole("link")
        .find((l) => l.getAttribute("aria-current") === "page");
      expect(current?.getAttribute("href")).toBe(`/org/${ORG_ID}/settings/${entry}`);
      cleanup();
    }
  });

  test("a long workspace name wraps under the nav's title beside its mark, whole, never widening the nav", async () => {
    const state = seedState();
    const name = "Cooperativa Agroindustrial dos Produtores Rurais do Vale do Jequitinhonha";
    if (state.me?.organizations[0]) state.me.organizations[0].name = name;
    await go("settings/general", state);
    const org = document.querySelector(".settings__org") as HTMLElement;
    expect(org.classList.contains("ac-iconline")).toBe(true);
    expect(org.textContent).toBe(name);
  });

  test("Sobre o agentes.chat: for a member too, with the license's attribution, the version and the source", async () => {
    const state = seedState();
    if (state.me?.organizations[0]) state.me.organizations[0].role = "member";
    state.instance = { version: "2026.11.06.1", sourceUrl: "https://git.example.com/fork" };
    await go("settings/about", state);
    expect(screen().getAllByRole("heading", { level: 2, name: "Sobre o agentes.chat" }).length).toBeGreaterThan(0);
    const site = screen().getByRole("link", { name: "agentes.chat" });
    expect(site.closest("h2")?.textContent).toBe("Baseado no agentes.chat da Codari Global, LLC");
    expect(site.getAttribute("href")).toBe("https://agentes.chat");
    expect(screen().getByText("2026.11.06.1")).toBeTruthy();
    expect(screen().getByRole("link", { name: "GNU Affero General Public License v3" }).getAttribute("href")).toBe(
      "https://www.gnu.org/licenses/agpl-3.0.html",
    );
    expect(
      screen()
        .getByRole("link", { name: /git\.example\.com\/fork/ })
        .getAttribute("href"),
    ).toBe("https://git.example.com/fork");
    expect(screen().getByText("Copyright © 2026 Codari Global, LLC e colaboradores")).toBeTruthy();
  });

  test("Sobre o agentes.chat only on a self-hosted server: agentes.chat Cloud lists it nowhere, its link opens Sua conta", async () => {
    const nav = () => within(screen().getByRole("navigation", { name: "Seções das configurações" }));
    const license = () => screen().queryByRole("link", { name: "GNU Affero General Public License v3" });
    const inPalette = async () => {
      await act(async () => fireEvent.keyDown(window, { key: "k", metaKey: true }));
      await type(screen().getByRole("combobox", { name: "Ir para, ou pedir a um agente" }), "sobre");
      return screen().queryByRole("option", { name: /Sobre o agentes\.chat/ }) !== null;
    };
    await go("settings/about", seedState({ authConfig: { cloud: false } }));
    expect(nav().getByRole("link", { name: "Sobre o agentes.chat" }).getAttribute("aria-current")).toBe("page");
    expect(license()).not.toBeNull();
    expect(await inPalette()).toBe(true);
    cleanup();

    await go("settings/about", seedState({ authConfig: { cloud: true } }));
    expect(nav().queryByRole("link", { name: "Sobre o agentes.chat" })).toBeNull();
    expect(screen().getByRole("heading", { level: 2, name: "Sua conta" })).toBeTruthy();
    // The Cloud has no Sobre for anyone: nothing to say about the person's role.
    expect(screen().queryByText(/não abre com o seu cargo/)).toBeNull();
    expect(license()).toBeNull();
    expect(await inPalette()).toBe(false);
  });

  test("a section the person's role doesn't open says so where it lands, never silently on Sua conta", async () => {
    const state = seedState();
    if (state.me?.organizations[0]) state.me.organizations[0].role = "member";
    await go("settings/skills", state);
    expect(screen().getByText(/não abre com o seu cargo/).textContent).toBe(
      "Skills não abre com o seu cargo neste workspace. Quem gerencia os cargos pode liberar para você.",
    );
    cleanup();
    // Opened from its own nav, the section says nothing more.
    await go("settings/account", state);
    expect(screen().queryByText(/não abre com o seu cargo/)).toBeNull();
  });

  test("Configurações with no section named, opened by a member, lands on their first section with nothing to explain", async () => {
    const state = seedState();
    if (state.me?.organizations[0]) state.me.organizations[0].role = "member";
    await go("settings", state);
    const nav = screen().getByRole("navigation", { name: "Seções das configurações" });
    expect(nav.querySelector('[aria-current="page"]')).toBeTruthy();
    expect(screen().queryByText(/não abre com o seu cargo/)).toBeNull();
  });

  test("an unknown section goes back to Geral", async () => {
    const { router } = await go("settings/nada");
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings`);
  });

  test("Sua conta: Perfil and Fuso horário edit my handle and time zone", async () => {
    const { state } = await go("settings/account");
    const nav = screen().getByRole("navigation", { name: "Seções das configurações" });
    // Mine, in the "Você" group: my own face, not an icon.
    const link = within(nav).getByRole("link", { name: "Sua conta" });
    expect(link.querySelector(".ac-avatar")?.textContent).toBe("W");
    expect(link.querySelector(".ac-icon")).toBeNull();
    await click(screen().getByRole("button", { name: /^Perfil/ }));
    await settle(2);
    const dialog = screen().getByRole("dialog", { name: "Seu perfil neste workspace" });
    await type(within(dialog).getByLabelText("Seu @"), "walt");
    // Our zone selector: search by city, Enter picks.
    const zoneBox = within(dialog).getByRole("combobox", { name: "Fuso horário" });
    expect(zoneBox.textContent).toContain("UTC");
    await click(zoneBox);
    await settle(2);
    const search = screen().getByRole("combobox", { name: "Buscar fuso" });
    await type(search, "lisboa");
    await act(async () => fireEvent.keyDown(search, { key: "Enter" }));
    await settle(2);
    expect(within(dialog).getByRole("combobox", { name: "Fuso horário" }).textContent).toContain("Lisboa");
    await click(within(dialog).getByRole("button", { name: "Salvar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "orgs.updateMe")?.args).toEqual([
      ORG_ID,
      { handle: "walt", timezone: "Europe/Lisbon" },
    ]);
    expect(screen().getByText("Perfil salvo.")).toBeTruthy();
  });

  test("Fuso horário in Sua conta says my zone in words under its name, as the selector does, never its id", async () => {
    for (const [zone, words] of [
      ["Europe/Lisbon", "Lisboa"],
      ["Asia/Kathmandu", "Horário do Nepal"],
    ] as const) {
      const state = seedState();
      const me = state.members.find((m) => m.userId === state.me?.user.id);
      if (me) me.timezone = zone;
      await go("settings/account", state);
      const item = screen().getByRole("button", { name: /^Fuso horário/ });
      // On a line of its own, as Perfil's: a long name ("Los Angeles (Pacífico dos EUA)") has the row's width.
      const line = item.querySelector(".settings-row__status")?.textContent;
      expect({ zone, line }).toEqual({ zone, line: words });
      cleanup();
    }
  });
});

describe("the current section in the nav", () => {
  test("is the agent page's current tab, a raised key with its edge, so light shows it as dark does", async () => {
    const css = (await Bun.file(new URL("../src/layout.css", import.meta.url).pathname).text()).replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const body = (selector: string) => css.split(`\n${selector} {`)[1]?.split("}")[0] ?? "";
    const of = (selector: string, prop: string) => new RegExp(`\\s${prop}: ([^;]+);`).exec(body(selector))?.[1];
    const current = '.settings__link[aria-current="page"]';
    const tab = '.agp-subnav__item[aria-current="true"]';
    for (const prop of ["background", "box-shadow"]) expect(of(current, prop)).toBe(of(tab, prop));
    expect(of(current, "box-shadow")).toContain("var(--e1)");
  });
});

describe("the sections' strip on a phone", () => {
  /**
   * A 390px strip (`across`) of 120px keys (`wide`) 4px apart from x = 16, moved by its own sideways scroll; each
   * scroll it's asked for is kept. Patched on Element.prototype, where the methods live, and put back there.
   */
  const real = { rect: Element.prototype.getBoundingClientRect, scrollTo: Element.prototype.scrollTo };
  const asked: (ScrollBehavior | undefined)[] = [];
  const box = (left: number, width: number) => ({ left, right: left + width, top: 0, bottom: 40, width, height: 40 });
  let wide = 120;
  let across = 390;
  function phone() {
    asked.length = 0;
    wide = 120;
    across = 390;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains("settings__groups")) return box(0, across) as DOMRect;
      const strip = this.closest(".settings__groups");
      if (!strip || !this.classList.contains("settings__link")) return real.rect.call(this);
      const i = [...strip.querySelectorAll(".settings__link")].indexOf(this);
      return box(16 + i * (wide + 4) - strip.scrollLeft, wide) as DOMRect;
    };
    // The strip is only ever asked with options. happy-dom's own scroll lands a smooth one on the next timer tick.
    Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions) {
      asked.push(options?.behavior);
      Reflect.apply(real.scrollTo, this, [options]);
    } as typeof Element.prototype.scrollTo;
  }
  afterEach(() => {
    Element.prototype.getBoundingClientRect = real.rect;
    Element.prototype.scrollTo = real.scrollTo;
    domWindow().happyDOM.settings.device.prefersReducedMotion = "reduce";
    delete (document as { fonts?: unknown }).fonts;
  });
  /** Where the current section's key has its middle. */
  const middle = () => {
    const r = document.querySelector('.settings__link[aria-current="page"]')?.getBoundingClientRect();
    return r ? r.left + r.width / 2 : null;
  };

  test("opens with the current section's key in its middle, at once: Armazenamento, under Advanced", async () => {
    phone();
    await go("settings/storage");
    expect(middle()).toBe(195);
    expect(asked).toEqual(["instant"]);
  });

  test("a web font that arrives after it opened, changing every key's width, puts the key back in the middle", async () => {
    phone();
    let arrive = () => {};
    const ready = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    // As WebKit does: `ready` settles, and no `loadingdone` comes.
    const fonts = Object.assign(new EventTarget(), { status: "loading", ready });
    Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
    await go("settings/storage");
    expect(middle()).toBe(195);
    wide = 108;
    expect(middle()).not.toBe(195);
    await act(async () => arrive());
    expect(middle()).toBe(195);
    expect(asked).toEqual(["instant", "instant"]);
  });

  test("the strip's width changing (a phone turned, a window narrowed to a strip) puts the key back in the middle", async () => {
    phone();
    const g = globalThis as unknown as { ResizeObserver: unknown };
    const saved = g.ResizeObserver;
    const reports: (() => void)[] = [];
    g.ResizeObserver = class {
      report: () => void;
      constructor(report: () => void) {
        this.report = report;
      }
      observe(target: Element) {
        if (target.classList.contains("settings__groups")) reports.push(this.report);
      }
      unobserve() {}
      disconnect() {}
    };
    const report = () =>
      act(async () => {
        for (const r of reports) r();
      });
    try {
      across = 844;
      await go("settings/storage");
      expect(middle()).toBe(422);
      // The first report, at the width it opened with, moves nothing: a glide under way goes on.
      await report();
      expect(asked).toEqual(["instant"]);
      across = 390;
      await report();
      expect(middle()).toBe(195);
      expect(asked).toEqual(["instant", "instant"]);
    } finally {
      g.ResizeObserver = saved;
    }
  });

  test("another section glides its key to the middle; with reduced motion it moves at once", async () => {
    phone();
    domWindow().happyDOM.settings.device.prefersReducedMotion = "no-preference";
    const { router } = await go("settings/connectors");
    expect(middle()).toBe(195);
    await act(() =>
      router.navigate({ to: "/org/$orgId/settings/$section", params: { orgId: ORG_ID, section: "storage" } }),
    );
    await settle(2);
    expect(asked).toEqual(["instant", "smooth"]);
    expect(middle()).toBe(195);
    domWindow().happyDOM.settings.device.prefersReducedMotion = "reduce";
    await act(() =>
      router.navigate({ to: "/org/$orgId/settings/$section", params: { orgId: ORG_ID, section: "import" } }),
    );
    expect(asked.at(-1)).toBe("instant");
    expect(middle()).toBe(195);
  });
});
