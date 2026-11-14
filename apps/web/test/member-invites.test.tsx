import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import type { Agent, InvitationWithStatus, InviteLink, OrgRole } from "@agenteschat/client";
import { ApiError, NetworkError } from "@agenteschat/client";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { createI18n } from "@/i18n";
import { undoWindow } from "@/pages/InvitesPage";
import {
  ADA_ID,
  ATLAS_ID,
  createFakeApi,
  ENG_ID,
  GENERAL_ID,
  ORG_ID,
  seedRoles,
  seedState,
  withRightHand,
} from "./fake-api";
import { hintOf } from "./hint";
import { renderApp, screen, settle } from "./render";

/*
 * Bringing a teammate in (ADR 0090, 0184): the one invite dialog (E-mail or Link, then Para, Cargo, Canais and
 * Agentes) and where it opens from, People › Convites (the requests, the links and the e-mail invitations, Editar link
 * and Editar convite), a member's suggestions, and a newcomer's first #general.
 */

const UNDO_MS = undoWindow.ms;
afterEach(() => {
  undoWindow.ms = UNDO_MS;
  localStorage.clear();
  cleanup();
});

const click = (el: Element) => act(async () => fireEvent.click(el));
const type = (el: Element, value: string) => act(async () => fireEvent.change(el, { target: { value } }));
const key = (el: Element, k: string, extra: Partial<KeyboardEventInit> = {}) =>
  act(async () => fireEvent.keyDown(el, { key: k, ...extra }));
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
const text = () => document.body.textContent ?? "";
const dialog = () => screen().getByRole("dialog", { name: "Convidar para a Acme" });
/** The words of a chip field's tokens. */
const tokensOf = (field: string) =>
  [...(dialog().querySelector(`#${field}`)?.closest(".ac-chipfield")?.querySelectorAll(".ac-token__label") ?? [])].map(
    (l) => l.textContent,
  );

const SUPORTE = "role-suporte";
const SUPORTE_CH = "00000000-0000-4000-8000-0000000000c3";
const MAX_ID = "00000000-0000-4000-8000-0000000000a3";

/** Acme with a "Suporte" cargo: a private #suporte limited to it, and Max, who answers only Suporte; and Lodi. */
function withSupport(state = seedState()) {
  const [admin, everyone] = seedRoles() as [OrgRole, OrgRole];
  state.roles = [
    admin,
    {
      ...admin,
      id: SUPORTE,
      name: "Suporte",
      icon: "headset",
      color: "teal",
      position: 1,
      permissions: ["approve_actions"],
      hoist: false,
    },
    { ...everyone, position: 2 },
  ];
  state.channels.push({
    id: SUPORTE_CH,
    name: "suporte",
    topic: "",
    visibility: "private",
    audienceRoleIds: [SUPORTE],
    isMember: true,
    createdAt: new Date().toISOString(),
  });
  state.channelMembers[SUPORTE_CH] = [{ type: "person", id: "u-walter" }];
  const ada = state.agents.find((a) => a.id === ADA_ID) as Agent;
  state.agents.push({
    ...ada,
    id: MAX_ID,
    name: "Max",
    handle: "max",
    role: "Atendimento",
    audienceMode: "people",
    audience: { mode: "people", userIds: [], roleIds: [SUPORTE] },
  });
  return withRightHand(state);
}

/** People › Membros (as Acme's owner, who may invite, unless the state says otherwise). */
async function members(state = seedState(), path = "members", api = createFakeApi(state)) {
  const r = await renderApp(`/org/${ORG_ID}/settings/${path}`, { api });
  await settle(6);
  return { ...r, state };
}
/** `run`, each call held until `release`: it stays pending meanwhile. */
function hold<A extends unknown[], R>(run: (...args: A) => Promise<R>) {
  let open = () => {};
  return {
    run: async (...args: A) => {
      await new Promise<void>((r) => {
        open = r;
      });
      return run(...args);
    },
    release: async () => {
      await act(async () => open());
      await settle(6);
    },
  };
}
/** Off: its own `disabled`, or inside a `Locked` that runs. */
const off = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.closest("fieldset[disabled]") !== null;
/** The page's own "Convidar pessoas" (the first of that name). */
async function openInvite() {
  const [open] = screen().getAllByRole("button", { name: "Convidar pessoas" });
  await click(open as HTMLElement);
  await settle(4);
  return dialog();
}
/** Opens a select or a menu from its trigger, by keyboard. */
async function openFrom(trigger: HTMLElement) {
  trigger.focus();
  await act(async () => fireEvent.keyDown(trigger, { key: "Enter" }));
}
/** Ticks cargos in the dialog's Cargo menu, then closes it. */
async function pickRoles(...names: string[]) {
  await openFrom(within(dialog()).getByRole("button", { name: /^Cargo/ }));
  for (const name of names) await click(screen().getByRole("menuitemcheckbox", { name }));
  await act(async () => fireEvent.keyDown(screen().getByRole("menu"), { key: "Escape" }));
  await settle(2);
}
/** Types addresses into Para, then Enter. */
async function address(...emails: string[]) {
  const to = within(dialog()).getByLabelText("Para");
  await type(to, emails.join(", "));
  await key(to, "Enter");
}
/** Swaps the clipboard for one that keeps what's written, while `run` runs. */
async function withClipboard(run: () => Promise<unknown>) {
  const writes: string[] = [];
  const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (s: string) => void writes.push(s) },
  });
  try {
    await run();
  } finally {
    if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
  return writes;
}
const invitation = (
  over: Partial<InvitationWithStatus> & Pick<InvitationWithStatus, "id" | "email">,
): InvitationWithStatus => ({
  role: "member",
  roleIds: [],
  status: "pending",
  expiresAt: new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString(),
  createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  invitedBy: "Walter",
  url: `http://localhost:3000/invite/tok-${over.id}`,
  ...over,
});
const link = (over: Partial<InviteLink> & Pick<InviteLink, "id">): InviteLink => ({
  url: `http://localhost:3000/invite/${over.id}`,
  expiresAt: new Date(Date.now() + 6 * 86_400_000 + 60_000).toISOString(),
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  createdBy: "Walter",
  createdByUserId: "u-walter",
  waiting: 0,
  plain: true,
  roleIds: [],
  channelIds: [],
  agentIds: [],
  maxUses: null,
  uses: 0,
  ...over,
});

describe("the invite dialog, one screen", () => {
  test("E-mail or Link on top, then Para, Cargo, Canais and Agentes: each label and its ⓘ over its field", async () => {
    await members(withSupport());
    const invite = await openInvite();
    // No steps, no host asking.
    expect(invite.querySelector(".ac-steps")).toBeNull();
    expect(invite.querySelector(".auth__ask")).toBeNull();
    const how = within(invite).getByRole("radiogroup", { name: "Como convidar" });
    expect(within(how).getByRole("radio", { name: "E-mail" }).getAttribute("aria-checked")).toBe("true");
    // Every field the app's way: its label (and ⓘ) first, the control under it at the form's width.
    const fields = [...invite.querySelectorAll(".ac-field")] as HTMLElement[];
    expect(fields.map((f) => f.querySelector(".ac-field__label")?.textContent)).toEqual([
      "Para",
      "Cargo",
      "Canais",
      "Agentes",
    ]);
    for (const f of fields) {
      expect(f.firstElementChild?.classList.contains("ac-hintline")).toBe(true);
      expect(f.firstElementChild?.querySelector(".ac-hint")).toBeTruthy();
    }
    expect(hintOf("Para", invite).text).toBe("Cole uma lista, se quiser: vírgula, espaço ou uma por linha.");
    expect(hintOf("Cargo", invite).text).toBe(
      "O que a pessoa pode fazer. Cargos somam ao que Todos podem. Vale só para pessoas.",
    );
    expect(hintOf("Canais", invite).text).toBe("Onde a pessoa já entra. Os canais do cargo vêm marcados.");
    expect(hintOf("Agentes", invite).text).toBe(
      "Com quem a pessoa trabalha. Ficam no topo da lista dela. Um agente restrito passa a responder a ela.",
    );
    // Todos' "Membro" with no cargo; #general and Lodi stay, each saying why.
    expect(within(invite).getByRole("button", { name: /^Cargo/ }).textContent).toBe("Membro");
    expect(tokensOf("invite-channels")).toEqual(["general"]);
    expect(tokensOf("invite-agents")).toEqual(["Lodi"]);
    expect(within(invite).queryByRole("button", { name: "Remover #general" })).toBeNull();
    expect(within(invite).queryByRole("button", { name: "Remover Lodi" })).toBeNull();
    expect(invite.textContent).toContain("Todo mundo entra no #general.");
    expect(invite.textContent).toContain("Todo mundo tem o Lodi.");
    // Nothing to send yet; Para has the focus.
    expect(within(invite).getByRole("button", { name: "Convidar" }).hasAttribute("disabled")).toBe(true);
    expect(document.activeElement === within(invite).getByLabelText("Para")).toBe(true);
  });

  test("a cargo brings its channels and agents, taken out stays out; the send carries them and closes on a toast", async () => {
    const { state } = await members(withSupport());
    await openInvite();
    await address("marina@example.com");
    expect(within(dialog()).getByRole("button", { name: "Convidar 1 pessoa" })).toBeTruthy();
    await pickRoles("Suporte");
    expect(within(dialog()).getByRole("button", { name: /^Cargo/ }).textContent).toBe("Suporte");
    // Its channel and its agent come in, fading in, each saying where it came from.
    expect(tokensOf("invite-channels")).toEqual(["general", "suporte"]);
    expect(tokensOf("invite-agents")).toEqual(["Lodi", "Max"]);
    const suporte = within(dialog()).getByText("suporte").closest(".ac-token") as HTMLElement;
    expect(suporte.hasAttribute("data-fresh")).toBe(true);
    expect(suporte.textContent).toContain("Vem com o cargo Suporte.");
    await click(within(dialog()).getByRole("button", { name: "Remover Max" }));
    expect(tokensOf("invite-agents")).toEqual(["Lodi"]);
    // ⌘↵ sends.
    await key(within(dialog()).getByLabelText("Para"), "Enter", { metaKey: true });
    await settle(6);
    expect(state.calls.find((c) => c.method === "orgs.inviteMany")?.args).toEqual([
      ORG_ID,
      { emails: ["marina@example.com"], roleIds: [SUPORTE], channelIds: [SUPORTE_CH], agentIds: [] },
    ]);
    expect(screen().queryByRole("dialog", { name: "Convidar para a Acme" })).toBeNull();
    const toast = screen().getByText("Convite enviado para marina@example.com.").closest(".ac-toast") as HTMLElement;
    // Inviting more opens with the same choices: the cargo, its channel, and Max still out.
    await click(within(toast).getByRole("button", { name: "Convidar mais pessoas" }));
    await settle(4);
    expect(within(dialog()).getByRole("button", { name: /^Cargo/ }).textContent).toBe("Suporte");
    expect(tokensOf("invite-channels")).toEqual(["general", "suporte"]);
    expect(tokensOf("invite-agents")).toEqual(["Lodi"]);
  });

  test("Para: a pasted address book, who is in, invited or no address said on their tokens; only good ones count", async () => {
    const state = seedState();
    state.invitations.push(invitation({ id: "inv-bia", email: "bia@acme.com" }));
    await members(state);
    const invite = await openInvite();
    const to = within(invite).getByLabelText("Para");
    // As a mail app copies them: names around the addresses, one in quotes with a comma.
    const pasted = 'Ana Silva <ana@acme.com>, "Silva, Bia" <bia@acme.com>; João <joao@acme.com.br>, x@y';
    await act(async () => fireEvent.paste(to, { clipboardData: { getData: () => pasted } }));
    expect(tokensOf("invite-to")).toEqual(["ana@acme.com", "bia@acme.com", "joao@acme.com.br", "x@y"]);
    const token = (email: string) => within(invite).getByText(email).closest(".ac-token") as HTMLElement;
    expect(token("joao@acme.com.br").getAttribute("data-state")).toBe("soft");
    expect(token("joao@acme.com.br").textContent).toContain("já está na Acme");
    expect(token("bia@acme.com").textContent).toContain("já convidado");
    expect(token("x@y").getAttribute("data-state")).toBe("invalid");
    expect(token("x@y").textContent).toContain("confira");
    // The line only when needed, in the danger tone for an address to check.
    const line = invite.querySelector("#invite-to-line") as HTMLElement;
    expect(line.textContent).toBe("Confira os e-mails marcados: eles não recebem convite.");
    expect(line.classList.contains("ac-field__error")).toBe(true);
    expect(within(invite).getByRole("button", { name: "Convidar 1 pessoa" })).toBeTruthy();
    // Backspace takes the last one back; the line goes with what it was about.
    await key(to, "Backspace");
    expect(tokensOf("invite-to")).toEqual(["ana@acme.com", "bia@acme.com", "joao@acme.com.br"]);
    expect(invite.querySelector("#invite-to-line")?.textContent).toBe("Quem já está ou já foi convidado fica de fora.");
  });

  test("agents: each one says whether it can go and why; a restricted one you open starts answering the person", async () => {
    const state = withSupport();
    const atlas = state.agents.find((a) => a.id === ATLAS_ID) as Agent;
    Object.assign(atlas, { audienceMode: "people", audience: { mode: "people", userIds: [], roleIds: [] } });
    // Ada reads João's mailbox: opening her to someone new would take it.
    const ada = state.agents.find((a) => a.id === ADA_ID) as Agent;
    Object.assign(ada, { audienceMode: "people", audience: { mode: "people", userIds: [], roleIds: [] } });
    state.mailLoss = {
      [ADA_ID]: [{ accountId: "mb-1", address: "joao@acme.com.br", ownerUserId: "u-joao", ownerName: "João" }],
    };
    const { router } = await members(state);
    await openInvite();
    const field = within(dialog()).getByRole("combobox", { name: "Agentes" });
    await key(field, "ArrowDown");
    await settle(4);
    const list = screen().getByRole("listbox", { name: "Agentes" });
    const row = (name: string) => within(list).getByRole("option", { name: new RegExp(`^${name}`) });
    expect(row("Lodi").getAttribute("aria-disabled")).toBe("true");
    expect(row("Lodi").textContent).toContain("Todo mundo tem o Lodi");
    expect(row("Atlas").textContent).toContain("Restrito · você libera");
    expect(row("Max").textContent).toContain("Restrito · você libera");
    expect(row("Ada").textContent).toContain("Lê o e-mail de João");
    await click(row("Atlas"));
    expect(tokensOf("invite-agents")).toEqual(["Lodi", "Atlas"]);
    expect(dialog().textContent).toContain("Atlas passa a responder a quem entrar por este convite.");
    // A mailbox is never taken unasked: Ada's row opens her page, where that is decided.
    await click(row("Ada"));
    await settle(4);
    expect(screen().queryByRole("dialog", { name: "Convidar para a Acme" })).toBeNull();
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/agents/${ADA_ID}`);
  });

  test("with a cargo, Max goes by it; a cargo that can't talk to agents leaves the field off and says so", async () => {
    const state = withSupport();
    const everyone = state.roles?.find((r) => r.kind === "everyone") as OrgRole;
    everyone.permissions = everyone.permissions.filter((k) => k !== "talk_to_agents");
    await members(state);
    await openInvite();
    const field = within(dialog()).getByRole("combobox", { name: "Agentes" }) as HTMLInputElement;
    expect(field.disabled).toBe(true);
    expect(dialog().textContent).toContain("Com esse cargo, a pessoa não conversa com agentes.");
    // Admin can do anything, talking to agents too.
    await pickRoles("Admin");
    expect(field.disabled).toBe(false);
    expect(dialog().textContent).toContain("Com Admin, a pessoa vê todos os agentes.");
  });

  test("refusals say the cause and the way out, nothing typed is lost; no answer offers to try again", async () => {
    const state = seedState();
    state.inviteManyError = new ApiError(400, "invitation.channel", "One of these channels can't go", {
      channelId: ENG_ID,
      name: "eng",
      why: "archived",
    });
    await members(state);
    await openInvite();
    await address("nova@example.com");
    const channels = within(dialog()).getByRole("combobox", { name: "Canais" });
    await key(channels, "ArrowDown");
    await settle(4);
    await click(within(screen().getByRole("listbox", { name: "Canais" })).getByRole("option", { name: /^#eng/ }));
    await click(within(dialog()).getByRole("button", { name: "Convidar 1 pessoa" }));
    await settle(6);
    expect(dialog().textContent).toContain("O #eng foi arquivado. Tire o canal para enviar.");
    expect((within(dialog()).getByText("eng").closest(".ac-token") as HTMLElement).getAttribute("data-state")).toBe(
      "invalid",
    );
    expect(tokensOf("invite-to")).toEqual(["nova@example.com"]);

    state.inviteManyError = new NetworkError(new Error("offline"));
    await click(within(dialog()).getByRole("button", { name: "Remover #eng" }));
    await click(within(dialog()).getByRole("button", { name: "Convidar 1 pessoa" }));
    await settle(6);
    expect(dialog().textContent).toContain("Não deu para falar com o servidor. Nada foi enviado.");
    state.inviteManyError = undefined;
    await click(within(dialog()).getByRole("button", { name: "Tentar de novo" }));
    await settle(6);
    expect(screen().queryByRole("dialog", { name: "Convidar para a Acme" })).toBeNull();
    expect(text()).toContain("Convite enviado para nova@example.com.");
  });

  test("Link: the workspace's link at the defaults, renewed; any choice empties it until Criar link makes one", async () => {
    const state = withSupport();
    state.inviteLinks = [link({ id: "link-plain" })];
    await members(state);
    await openInvite();
    await click(within(dialog()).getByRole("radio", { name: "Link" }));
    await settle(6);
    // Opened at the defaults: the workspace's own link, renewed to 30 days.
    expect(state.calls.find((c) => c.method === "invites.createLink")?.args).toEqual([
      ORG_ID,
      { roleIds: [], channelIds: [], agentIds: [], expiresIn: "30d", maxUses: null },
    ]);
    const field = () => within(dialog()).getByLabelText("Link") as HTMLInputElement;
    expect(field().value).toBe("http://localhost:3000/invite/link-plain");
    expect(dialog().querySelector("#invite-link-until")?.textContent).toMatch(/^Vale até \d+ \S+$/);
    expect(hintOf("Link", dialog()).text).toBe("Quem abrir pede para entrar, e você aprova.");
    expect([...dialog().querySelectorAll(".ac-field__label")].map((l) => l.textContent)).toEqual([
      "Link",
      "Cargo",
      "Canais",
      "Agentes",
      "Validade",
      "Máximo de pessoas",
    ]);
    // A cargo: the field empties, and the one button becomes Criar link in its place.
    await pickRoles("Suporte");
    expect(field().value).toBe("");
    expect(field().placeholder).toBe("Crie o link para copiar");
    expect(dialog().querySelector("#invite-link-until")?.textContent).toBe("Vale 30 dias depois de criado.");
    const make = within(dialog()).getByRole("button", { name: "Criar link" });
    expect(make.className).toContain("ac-btn--primary");
    await click(make);
    await settle(6);
    expect(state.calls.filter((c) => c.method === "invites.createLink").at(-1)?.args).toEqual([
      ORG_ID,
      { roleIds: [SUPORTE], channelIds: [SUPORTE_CH], agentIds: [MAX_ID], expiresIn: "30d", maxUses: null },
    ]);
    expect(field().value).toBe("http://localhost:3000/invite/link-2");
    const writes = await withClipboard(() => click(within(dialog()).getByRole("button", { name: "Copiar link" })));
    expect(writes).toEqual(["http://localhost:3000/invite/link-2"]);
    expect(within(dialog()).getByRole("button", { name: "Copiado" })).toBeTruthy();
    // Back at the defaults: the workspace's link again.
    await pickRoles("Suporte");
    expect(field().value).toBe("http://localhost:3000/invite/link-plain");
    await click(within(dialog()).getByRole("button", { name: "Concluir" }));
    await settle(2);
    expect(screen().queryByRole("dialog", { name: "Convidar para a Acme" })).toBeNull();
  });

  test("Link: while a link is made the whole dialog waits on it, the switch and Concluir too, and Esc keeps it", async () => {
    const state = withSupport();
    state.inviteLinks = [link({ id: "link-plain" })];
    const api = createFakeApi(state);
    const make = hold(api.invites.createLink);
    api.invites.createLink = make.run;
    await members(state, "members", api);
    await openInvite();
    await click(within(dialog()).getByRole("radio", { name: "Link" }));
    // Opening at the defaults renews the workspace's link: the dialog waits on that too.
    expect(off(within(dialog()).getByRole("radio", { name: "E-mail" }))).toBe(true);
    await make.release();
    expect(off(within(dialog()).getByRole("radio", { name: "E-mail" }))).toBe(false);
    await pickRoles("Suporte");
    await click(within(dialog()).getByRole("button", { name: "Criar link" }));
    await settle(2);
    expect(off(within(dialog()).getByRole("radio", { name: "E-mail" }))).toBe(true);
    expect(off(within(dialog()).getByRole("button", { name: "Concluir" }))).toBe(true);
    // The chip fields look it too, and their lists don't open.
    expect(
      dialog().querySelector("#invite-link-channels")?.closest(".ac-chipfield")?.getAttribute("aria-disabled"),
    ).toBe("true");
    await key(dialog(), "Escape");
    expect(screen().queryByRole("dialog", { name: "Convidar para a Acme" })).not.toBeNull();
    await make.release();
    expect((within(dialog()).getByLabelText("Link") as HTMLInputElement).value).toBe(
      "http://localhost:3000/invite/link-2",
    );
    expect(off(within(dialog()).getByRole("button", { name: "Concluir" }))).toBe(false);
  });

  test("one dialog from everywhere: the workspace menu and ⌘K open it over the page; who may not invite has neither", async () => {
    const { router } = await renderApp(`/org/${ORG_ID}/issues`, { api: createFakeApi(seedState()) });
    await settle(6);
    await click(screen().getByRole("button", { name: "Menu do workspace Acme" }));
    await settle(1);
    await click(screen().getByRole("menuitem", { name: /^Convidar pessoas/ }));
    await settle(2);
    expect(dialog()).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/issues`);
    await click(within(dialog()).getByRole("button", { name: "Cancelar" }));
    await settle(2);
    expect(screen().queryByRole("dialog", { name: "Convidar para a Acme" })).toBeNull();

    // ⌘K: "convidar" (or "invite") finds it, beside People › Convites; choosing it opens it.
    for (const words of ["convidar", "invite"]) {
      await act(async () => fireEvent.keyDown(window, { key: "k", metaKey: true }));
      const palette = screen().getByRole("combobox", { name: "Ir para, ou pedir a um agente" });
      await type(palette, words);
      const found = within(screen().getByRole("listbox", { name: "Resultados" }))
        .getAllByRole("option")
        .find((o) => o.textContent?.includes("Convidar pessoas")) as HTMLElement;
      expect(found.textContent).toContain("por e-mail ou link");
      await click(found);
      await settle(2);
      expect(dialog()).toBeTruthy();
      await click(within(dialog()).getByRole("button", { name: "Cancelar" }));
      await settle(2);
    }
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/issues`);
    cleanup();

    const member = seedState();
    if (member.me?.organizations[0]) member.me.organizations[0].role = "member";
    await renderApp(`/org/${ORG_ID}/issues`, { api: createFakeApi(member) });
    await settle(6);
    await act(async () => fireEvent.keyDown(window, { key: "k", metaKey: true }));
    await type(screen().getByRole("combobox", { name: "Ir para, ou pedir a um agente" }), "convidar");
    expect(screen().queryByRole("option", { name: /Convidar pessoas/ })).toBeNull();
  });

  test("a channel's Adicionar: the address and that channel come chosen, the channel saying so", async () => {
    const state = seedState();
    await renderApp(`/org/${ORG_ID}/c/${ENG_ID}`, { api: createFakeApi(state) });
    await settle(6);
    await click(within(screen().getByRole("main")).getByRole("button", { name: "Configurações do canal" }));
    await settle(3);
    const details = screen().getByRole("dialog", { name: "#eng" });
    await click(within(details).getByRole("button", { name: "Membros" }));
    await click(within(details).getByRole("button", { name: "Adicionar pessoa ou agente" }));
    const add = screen().getByRole("dialog", { name: "Adicionar a #eng" });
    const search = within(add).getByRole("searchbox", { name: "Buscar pessoa ou agente" });
    // Someone in the workspace already: nothing to invite.
    await type(search, "joao@acme.com.br");
    expect(within(add).queryByRole("button", { name: /^Convidar .*@/ })).toBeNull();
    await type(search, " Nova@Estudio.com ");
    await click(within(add).getByRole("button", { name: "Convidar nova@estudio.com para a Acme e para #eng" }));
    await settle(4);
    // The invite dialog takes over: Adicionar and the channel's details close, so neither opens again over it.
    expect(screen().queryByRole("dialog", { name: "Adicionar a #eng" })).toBeNull();
    expect(screen().queryByRole("dialog", { name: "#eng" })).toBeNull();
    expect(tokensOf("invite-to")).toEqual(["nova@estudio.com"]);
    expect(tokensOf("invite-channels")).toEqual(["general", "eng"]);
    expect(dialog().textContent).toContain("Você convidou daqui.");
    await click(within(dialog()).getByRole("button", { name: "Convidar 1 pessoa" }));
    await settle(6);
    expect(state.calls.find((c) => c.method === "orgs.inviteMany")?.args[1]).toEqual({
      emails: ["nova@estudio.com"],
      roleIds: [],
      channelIds: [ENG_ID],
      agentIds: [],
    });
  });
});

describe("People › Convites", () => {
  test("the tab counts who waits; Membros keeps the people, and a member who may not invite has no tab", async () => {
    const state = seedState({
      joinRequests: [
        {
          id: "r1",
          name: "Ana Souza",
          email: "ana@estudio.com",
          note: null,
          verified: true,
          confirmed: true,
          createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
          expiresAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
        },
      ],
    });
    await members(state);
    const tabs = screen().getByRole("tablist");
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Membros", "Convites 1"]);
    expect(screen().queryByRole("region", { name: "Esperando você" })).toBeNull();
    expect(text()).toContain("Walter");
    cleanup();

    const member = seedState();
    if (member.me?.organizations[0]) member.me.organizations[0].role = "member";
    await members(member);
    expect(screen().queryByRole("tablist")).toBeNull();
    expect(screen().getByRole("region", { name: "Quer trazer alguém para a Acme?" })).toBeTruthy();
  });

  test("links: their cargos, what they give and their state; Editar keeps the address, Desativar asks", async () => {
    const state = withSupport();
    state.inviteLinks = [
      link({
        id: "link-plain",
        uses: 4,
        expiresAt: "9999-12-31T00:00:00.000Z",
        neverExpires: true,
        createdBy: "Ana",
        createdByUserId: "u-ana",
      }),
      link({
        id: "link-sup",
        plain: false,
        roleIds: [SUPORTE],
        channelIds: [SUPORTE_CH],
        agentIds: [MAX_ID],
        maxUses: 1,
        uses: 0,
        createdAt: new Date().toISOString(),
      }),
    ];
    await members(state, "invites");
    const links = screen().getByRole("region", { name: "Links" });
    const sup = within(links).getByRole("group", { name: "Link Suporte" });
    expect(sup.querySelector(".members-row__name")?.textContent).toBe("Suporte");
    expect(sup.querySelector(".members-row__sub")?.textContent).toBe("#general e #suporte · Max");
    expect(sup.querySelector(".members-row__state")?.textContent).toMatch(/^0 de 1 pessoa · expira em \d dias$/);
    const plain = within(links).getByRole("group", { name: "Link Membro" });
    expect(plain.querySelector(".members-row__sub")?.textContent).toBe("#general");
    expect(plain.querySelector(".members-row__state")?.textContent).toBe("4 pessoas entraram · não expira · de Ana");

    await openFrom(within(sup).getByRole("button", { name: "Mais ações para o link Suporte" }));
    await click(screen().getByRole("menuitem", { name: "Editar" }));
    await settle(4);
    const edit = screen().getByRole("dialog", { name: "Link de convite" });
    expect((within(edit).getByLabelText("Link") as HTMLInputElement).value).toBe(
      "http://localhost:3000/invite/link-sup",
    );
    expect([...edit.querySelectorAll(".ac-field__label")].map((l) => l.textContent)).toEqual([
      "Link",
      "Cargo",
      "Canais",
      "Agentes",
      "Validade",
      "Máximo de pessoas",
    ]);
    expect(within(edit).getByRole("combobox", { name: "Validade" }).textContent).toMatch(/^Até \d+ \S+$/);
    await click(within(edit).getByRole("button", { name: "Remover #suporte" }));
    await click(within(edit).getByRole("button", { name: "Salvar" }));
    await settle(6);
    // Only what changed goes: the cargo and the agents stay as they are.
    expect(state.calls.find((c) => c.method === "invites.editLink")?.args).toEqual([
      ORG_ID,
      "link-sup",
      { channelIds: [], maxUses: 1 },
    ]);
    expect(text()).toContain("Link salvo. O endereço é o mesmo.");

    await openFrom(within(links).getByRole("button", { name: "Mais ações para o link Suporte" }));
    await click(screen().getByRole("menuitem", { name: "Desativar link" }));
    const ask = screen().getByRole("dialog", { name: "Desativar o link?" });
    await click(within(ask).getByRole("button", { name: "Desativar link" }));
    await settle(6);
    expect(state.calls.find((c) => c.method === "invites.turnOff")?.args).toEqual([ORG_ID, "link-sup"]);
  });

  test("e-mails: copy at any time, Reenviar keeps the link, Editar what it gives; Cancelar waits for Desfazer", async () => {
    const state = withSupport();
    state.invitations.push(
      invitation({
        id: "inv-rafa",
        email: "rafael@acme.com",
        invitedBy: "João",
        roleIds: [SUPORTE],
        channelIds: [SUPORTE_CH],
      }),
      invitation({
        id: "inv-soon",
        email: "soon@acme.com",
        expiresAt: new Date(Date.now() + 20 * 3_600_000 + 60_000).toISOString(),
        createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
        url: null,
      }),
      invitation({
        id: "inv-old",
        email: "old@acme.com",
        status: "expired",
        expiresAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        createdAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
      }),
    );
    await members(state, "invites");
    const sent = () => screen().getByRole("region", { name: "Convites por e-mail" });
    const row = (email: string) => within(sent()).getByRole("group", { name: `Convite para ${email}` });
    const rafael = () => row("rafael@acme.com");
    expect(rafael().querySelector(".members-row__sub")?.textContent).toBe("Suporte · #general e #suporte · de João");
    // Expiring within two days: said in the attention tone. One sent before links could be copied again: no Copy.
    const soon = row("soon@acme.com").querySelector(".members-row__state") as HTMLElement;
    expect(soon.textContent).toBe("Expira em 20 h");
    expect(soon.getAttribute("data-tone")).toBe("soon");
    expect(within(row("soon@acme.com")).queryByRole("button", { name: "Copiar link" })).toBeNull();

    const writes = await withClipboard(() => click(within(rafael()).getByRole("button", { name: "Copiar link" })));
    expect(writes).toEqual(["http://localhost:3000/invite/tok-inv-rafa"]);
    expect(text()).toContain("Link do convite de rafael@acme.com copiado. É o mesmo do e-mail.");
    await click(within(rafael()).getByRole("button", { name: "Reenviar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "orgs.resendInvitation")?.args).toEqual([ORG_ID, "inv-rafa"]);
    expect(rafael().querySelector(".members-row__state")?.textContent).toMatch(/^Mandado de novo · vale até \d+ \S+$/);

    // Editar: what it gives, the same link, nothing sent.
    const more = () => within(rafael()).getByRole("button", { name: "Mais ações para rafael@acme.com" });
    await openFrom(more());
    await click(screen().getByRole("menuitem", { name: "Editar" }));
    await settle(4);
    const edit = screen().getByRole("dialog", { name: "Convite de rafael@acme.com" });
    expect(edit.textContent).toContain("Muda o que a pessoa recebe ao entrar. O link continua o mesmo.");
    // Exactly what it gives: Max, the cargo's agent it left out, stays out.
    expect([...edit.querySelectorAll("#edit-invitation-agents")].length).toBe(1);
    expect(
      [
        ...(edit
          .querySelector("#edit-invitation-agents")
          ?.closest(".ac-chipfield")
          ?.querySelectorAll(".ac-token__label") ?? []),
      ].map((l) => l.textContent),
    ).toEqual(["Lodi"]);
    await click(within(edit).getByRole("button", { name: "Remover #suporte" }));
    await click(within(edit).getByRole("button", { name: "Salvar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "orgs.updateInvitation")?.args).toEqual([
      ORG_ID,
      "inv-rafa",
      { channelIds: [] },
    ]);
    expect(text()).toContain("Convite de rafael@acme.com atualizado.");
    expect(state.calls.filter((c) => c.method === "orgs.resendInvitation")).toHaveLength(1);

    // Cancelar convite: off the list at once; Desfazer within the toast's time brings it back, nothing revoked.
    undoWindow.ms = 600;
    await openFrom(more());
    await click(screen().getByRole("menuitem", { name: "Cancelar convite" }));
    expect(within(sent()).queryByRole("group", { name: "Convite para rafael@acme.com" })).toBeNull();
    const toast = screen().getByText("Convite de rafael@acme.com cancelado.").closest(".ac-toast") as HTMLElement;
    await click(within(toast).getByRole("button", { name: "Desfazer" }));
    expect(rafael()).toBeTruthy();
    await wait(700);
    expect(state.calls.some((c) => c.method === "orgs.revokeInvitation")).toBe(false);

    // An expired one: Renovar or Tirar, which waits for Desfazer the same way.
    undoWindow.ms = 40;
    const old = row("old@acme.com");
    expect(old.querySelector(".members-row__state")?.textContent).toMatch(/^Expirou em \d+ \S+$/);
    await click(within(old).getByRole("button", { name: "Tirar" }));
    expect(text()).toContain("old@acme.com saiu da lista.");
    await wait(120);
    await settle(4);
    expect(state.calls.filter((c) => c.method === "orgs.revokeInvitation").at(-1)?.args).toEqual([ORG_ID, "inv-old"]);
  });

  test("pending: while a row's call runs its other actions wait; Desativar's dialog holds until the link is off", async () => {
    const state = withSupport();
    state.invitations.push(
      invitation({ id: "inv-rafa", email: "rafa@example.com" }),
      invitation({
        id: "inv-old",
        email: "velho@example.com",
        status: "expired",
        expiresAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      }),
    );
    state.inviteLinks = [link({ id: "link-sup", plain: false, roleIds: [SUPORTE] })];
    const api = createFakeApi(state);
    const resend = hold(api.orgs.resendInvitation);
    api.orgs.resendInvitation = resend.run;
    const turnOff = hold(api.invites.turnOff);
    api.invites.turnOff = turnOff.run;
    await members(state, "invites", api);
    const row = (email: string) => screen().getByRole("group", { name: `Convite para ${email}` });

    await click(within(row("rafa@example.com")).getByRole("button", { name: "Reenviar" }));
    await settle(2);
    expect(off(within(row("rafa@example.com")).getByRole("button", { name: "Copiar link" }))).toBe(true);
    expect(off(within(row("rafa@example.com")).getByRole("button", { name: "Mais ações para rafa@example.com" }))).toBe(
      true,
    );
    await resend.release();
    expect(off(within(row("rafa@example.com")).getByRole("button", { name: "Copiar link" }))).toBe(false);

    await click(within(row("velho@example.com")).getByRole("button", { name: "Renovar" }));
    await settle(2);
    expect(off(within(row("velho@example.com")).getByRole("button", { name: "Tirar" }))).toBe(true);
    await resend.release();

    const links = screen().getByRole("region", { name: "Links" });
    await openFrom(within(links).getByRole("button", { name: "Mais ações para o link Suporte" }));
    await click(screen().getByRole("menuitem", { name: "Desativar link" }));
    const ask = screen().getByRole("dialog", { name: "Desativar o link?" });
    await click(within(ask).getByRole("button", { name: "Desativar link" }));
    await settle(2);
    expect(off(within(ask).getByRole("button", { name: "Cancelar" }))).toBe(true);
    await key(ask, "Escape");
    expect(screen().queryByRole("dialog", { name: "Desativar o link?" })).not.toBeNull();
    await turnOff.release();
    expect(screen().queryByRole("dialog", { name: "Desativar o link?" })).toBeNull();
  });

  test("a cargo above yours that someone higher gave: Editar sends only what changed, and it can go, never come back", async () => {
    const state = withSupport();
    // The viewer may not give Suporte here, as an inviter under it.
    state.roles = (state.roles ?? []).map((r) => (r.id === SUPORTE ? { ...r, givable: false } : r));
    state.inviteLinks = [
      link({ id: "link-sup", plain: false, roleIds: [SUPORTE], channelIds: [SUPORTE_CH], agentIds: [MAX_ID] }),
    ];
    state.invitations.push(
      invitation({ id: "inv-sup", email: "sup@example.com", roleIds: [SUPORTE], channelIds: [SUPORTE_CH] }),
    );
    await members(state, "invites");

    // Editar link, the maximum alone: what it gives isn't sent, so nothing in it is checked for you again.
    const links = screen().getByRole("region", { name: "Links" });
    await openFrom(within(links).getByRole("button", { name: "Mais ações para o link Suporte" }));
    await click(screen().getByRole("menuitem", { name: "Editar" }));
    await settle(4);
    const editLink = screen().getByRole("dialog", { name: "Link de convite" });
    await openFrom(within(editLink).getByRole("combobox", { name: "Máximo de pessoas" }));
    await click(screen().getByRole("option", { name: "10 pessoas" }));
    await click(within(editLink).getByRole("button", { name: "Salvar" }));
    await settle(6);
    expect(state.calls.find((c) => c.method === "invites.editLink")?.args).toEqual([
      ORG_ID,
      "link-sup",
      { maxUses: 10 },
    ]);

    // Editar convite: the cargo shows picked and marked; taken out, it can't be ticked again, and only that goes.
    await openFrom(
      within(screen().getByRole("group", { name: "Convite para sup@example.com" })).getByRole("button", {
        name: "Mais ações para sup@example.com",
      }),
    );
    await click(screen().getByRole("menuitem", { name: "Editar" }));
    await settle(4);
    const editInvitation = screen().getByRole("dialog", { name: "Convite de sup@example.com" });
    await openFrom(within(editInvitation).getByRole("button", { name: /^Cargo/ }));
    const above = () => screen().getByRole("menuitemcheckbox", { name: /^Suporte/ });
    expect(above().getAttribute("aria-checked")).toBe("true");
    expect(above().textContent).toContain("Acima do seu cargo");
    await click(above());
    expect(above().getAttribute("aria-checked")).toBe("false");
    expect(above().getAttribute("aria-disabled")).toBe("true");
    await act(async () => fireEvent.keyDown(screen().getByRole("menu"), { key: "Escape" }));
    await settle(2);
    await click(within(editInvitation).getByRole("button", { name: "Salvar" }));
    await settle(6);
    expect(state.calls.find((c) => c.method === "orgs.updateInvitation")?.args).toEqual([
      ORG_ID,
      "inv-sup",
      { roleIds: [] },
    ]);
  });

  test("past 8 rows: a search by e-mail or cargo and the kind of row; nothing open says so with a way to invite", async () => {
    const state = withSupport();
    for (let i = 0; i < 9; i++) state.invitations.push(invitation({ id: `inv-${i}`, email: `pessoa${i}@example.com` }));
    state.invitations.push(invitation({ id: "inv-sup", email: "sup@example.com", roleIds: [SUPORTE] }));
    await members(state, "invites");
    const search = screen().getByRole("searchbox", { name: "Buscar e-mail ou cargo" });
    await type(search, "suporte");
    const rows = within(screen().getByRole("region", { name: "Convites por e-mail" })).getAllByRole("group");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Convite para sup@example.com"]);
    await type(search, "ninguém");
    expect(text()).toContain("Nenhum convite com “ninguém”.");
    cleanup();

    await members(seedState(), "invites");
    expect(text()).toContain("Nenhum convite aberto.");
    expect(screen().getAllByRole("button", { name: "Convidar pessoas" }).length).toBeGreaterThan(1);
  });

  test("the rows keep the app's row room, 12 above and below, as Membros' people do", async () => {
    const css = await Bun.file(new URL("../src/pages/members.css", import.meta.url).pathname).text();
    expect(css).toMatch(/\.ac-list__row\.members-row \{\s*padding-block: var\(--space-3\);\s*\}/);
  });
});

describe("Members › a member who may not invite", () => {
  /** Walter as a plain member: João (Admin) is who invites. */
  const asMember = () => {
    const state = seedState();
    if (state.me?.organizations[0]) state.me.organizations[0].role = "member";
    const walter = state.members.find((m) => m.userId === "u-walter");
    if (walter) walter.role = "member";
    return state;
  };

  test("suggests someone: the card, the dialog, its refusals in our words; then theirs, waiting, to take back", async () => {
    const { state } = await members(asMember());
    expect(screen().queryByRole("button", { name: "Convidar pessoas" })).toBeNull();
    expect(screen().queryByRole("region", { name: "Convites por e-mail" })).toBeNull();
    const card = screen().getByRole("region", { name: "Quer trazer alguém para a Acme?" });
    expect(card.textContent).toContain(
      "Quem convida aqui é João. Sugira a pessoa: a sugestão chega e é aprovada com um clique.",
    );
    await click(within(card).getByRole("button", { name: "Sugerir pessoa" }));
    await settle(2);
    const suggest = () => screen().getByRole("dialog", { name: "Sugerir alguém para a Acme" });
    const email = within(suggest()).getByLabelText("E-mail");
    const send = () => click(within(suggest()).getByRole("button", { name: "Mandar para os admins" }));
    await type(email, "otto@estudio");
    await send();
    expect(suggest().textContent).toContain("Confira o e-mail: algo como nome@empresa.com.br.");
    expect(state.calls.some((c) => c.method === "joinRequests.suggest")).toBe(false);

    // Refused: about the person suggested, never the generic "Você já está neste workspace."
    state.suggestError = new ApiError(409, "join.member", "Already in this workspace");
    await type(email, "Joao@acme.com.br");
    await send();
    await settle(4);
    expect(suggest().textContent).toContain("joao@acme.com.br já está na Acme.");
    expect(text()).not.toContain("Você já está neste workspace.");
    state.suggestError = new ApiError(409, "join.waiting", "Someone already asked for this person");
    await type(email, "otto@estudio.com");
    await send();
    await settle(4);
    expect(suggest().textContent).toContain("otto@estudio.com já está esperando um admin.");

    state.suggestError = undefined;
    await type(within(suggest()).getByLabelText("Quem é (opcional)"), " Freelancer de design ");
    await send();
    await settle(6);
    expect(state.calls.filter((c) => c.method === "joinRequests.suggest").at(-1)?.args).toEqual([
      ORG_ID,
      { email: "otto@estudio.com", note: "Freelancer de design" },
    ]);
    expect(text()).toContain("Sugestão enviada. João vê em Convites.");
    expect(screen().queryByRole("dialog", { name: "Sugerir alguém para a Acme" })).toBeNull();

    const mine = screen().getByRole("region", { name: "Suas sugestões" });
    const row = within(mine).getByRole("group", { name: "Sugestão de otto@estudio.com" });
    expect(row.textContent).toContain("Freelancer de design");
    expect(row.textContent).toContain("Esperando um admin · agora");
    await click(within(row).getByRole("button", { name: "Cancelar a sugestão de otto@estudio.com" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "joinRequests.cancel")?.args).toEqual([ORG_ID, "sug-1"]);
    expect(text()).toContain("Sugestão cancelada.");
    expect(screen().queryByRole("region", { name: "Suas sugestões" })).toBeNull();
  });

  test("a suggestion's refusals are said about the person, in both languages", () => {
    for (const lng of ["pt-BR", "en"] as const) {
      const { t } = createI18n(lng);
      for (const refusal of ["member", "invited", "waiting", "full", "invalid"] as const) {
        const said = t(`members.suggest.refused.${refusal}`, { email: "ana@acme.com", org: "Acme" });
        expect({ refusal, said: said.startsWith("members.") }).toEqual({ refusal, said: false });
      }
    }
    const en = createI18n("en").t;
    expect(en("members.suggest.refused.member", { email: "ana@acme.com", org: "Acme" })).toBe(
      "ana@acme.com is already in Acme.",
    );
  });
});

describe("a newcomer's first #general", () => {
  /** Walter, let in `minutes` ago as a member. */
  const newcomer = (minutes = 60) => {
    const state = seedState();
    if (state.me?.organizations[0]) state.me.organizations[0].role = "member";
    const walter = state.members.find((m) => m.userId === "u-walter");
    if (walter) {
      walter.role = "member";
      walter.joinedAt = new Date(Date.now() - minutes * 60_000).toISOString();
    }
    return state;
  };
  const welcome = () => screen().queryByRole("region", { name: "Boas-vindas à Acme, Walter" });
  const open = async (state: ReturnType<typeof seedState>, channelId = GENERAL_ID) => {
    const r = await renderApp(`/org/${ORG_ID}/c/${channelId}`, { api: createFakeApi(state) });
    await settle(6);
    return r;
  };

  test("the welcome on a sky: the agents first, then the people; the channels they're in too; closed, it stays closed", async () => {
    await open(newcomer());
    const card = welcome() as HTMLElement;
    expect(card.querySelector("h2")?.textContent).toBe("Boas-vindas à Acme, Walter");
    expect(card.textContent).toContain(
      "Aqui o time e os agentes trabalham juntos: escreva no #general ou chame um agente pelo nome. Você também está em #eng.",
    );
    expect([...card.querySelectorAll(".welcome-card__name")].map((n) => n.textContent)).toEqual([
      "Ada",
      "Atlas",
      "João",
    ]);
    await click(within(card).getByRole("button", { name: "Dizer oi no #general" }));
    expect(document.activeElement === screen().getByRole("combobox", { name: "Mensagem para #general" })).toBe(true);
    await click(within(card).getByRole("button", { name: "Fechar" }));
    expect(welcome()).toBeNull();
    expect(localStorage.getItem(`agentes.arrival.closed.u-walter.${ORG_ID}`)).toBe("1");
    cleanup();

    await open(newcomer());
    expect(welcome()).toBeNull();
  });

  test("the invitation's first agent greets them: pinned on top, it's whom Conversar com opens", async () => {
    const state = newcomer();
    state.sidebarView = {
      agentSort: "workspace",
      showAllAgents: false,
      pins: { agents: [ATLAS_ID], channels: [], people: [] },
    };
    const first = await open(state);
    const card = welcome() as HTMLElement;
    expect([...card.querySelectorAll(".welcome-card__name")].map((n) => n.textContent)).toEqual([
      "Atlas",
      "Ada",
      "João",
    ]);
    await click(within(card).getByRole("button", { name: "Conversar com Atlas" }));
    await settle(4);
    expect(first.router.state.location.pathname).toBe(`/org/${ORG_ID}/dm/agent/${ATLAS_ID}`);
    cleanup();

    const second = await open(newcomer());
    await click(within(welcome() as HTMLElement).getByRole("button", { name: "Ver a equipe" }));
    await settle(4);
    expect(second.router.state.location.pathname).toBe(`/org/${ORG_ID}/team`);
  });

  test("only someone who just came in, in #general: not the owner, not after a day, not in another channel", async () => {
    for (const [state, channelId] of [
      [seedState(), GENERAL_ID],
      [newcomer(25 * 60), GENERAL_ID],
      [newcomer(), ENG_ID],
    ] as const) {
      await open(state, channelId);
      expect(document.querySelector(".welcome-card")).toBeNull();
      cleanup();
    }
  });
});
