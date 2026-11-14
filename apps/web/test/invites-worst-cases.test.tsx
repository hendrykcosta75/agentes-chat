import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import type { Agent, Channel, InvitationWithStatus, InviteLink, JoinRequest, OrgRole } from "@agenteschat/client";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { ADA_ID, createFakeApi, ORG_ID, seedRoles, seedState, withRightHand } from "./fake-api";
import { renderApp, screen, settle } from "./render";

afterEach(() => cleanup());

/**
 * The invite dialog and People › Convites with what breaks them (break-ui): a workspace name of 74 letters, a cargo of
 * 40, an address of 64 with no break, 40 addresses pasted at once, 30 channels with long names, an agent with a long
 * name and job, a request with a long note, a link with three cargos and an invitation to the long address. CI's
 * geometry check lays out every screen these tests reach at 1280 and 320.
 */
const ORG = "Cooperativa Agroindustrial dos Produtores Rurais do Vale do Jequitinhonha";
const CARGO = "Coordenação de Atendimento ao Cliente Sul";
const LONG_EMAIL = "maria.fernanda.albuquerque.de.oliveira.santos.figueiredo@example.com";

function worst() {
  const state = withRightHand(seedState());
  if (state.me?.organizations[0]) state.me.organizations[0].name = ORG;
  const [admin, everyone] = seedRoles() as [OrgRole, OrgRole];
  const cargo = (id: string, name: string, position: number): OrgRole => ({
    ...admin,
    id,
    name,
    icon: "headset",
    color: "teal",
    position,
    permissions: ["approve_actions"],
    hoist: false,
  });
  state.roles = [admin, cargo("role-long", CARGO, 1), cargo("role-fin", "Financeiro", 2), { ...everyone, position: 3 }];
  for (let i = 0; i < 30; i++)
    state.channels.push({
      id: `ch-${i}`,
      name: i === 0 ? "chamados-urgentes-do-atendimento-noturno-da-regional-sudeste" : `canal-de-projeto-${i}`,
      topic: "",
      visibility: i % 7 === 0 ? "private" : "public",
      ...(i % 7 === 0 ? { audienceRoleIds: ["role-long"] } : {}),
      isMember: true,
      createdAt: new Date().toISOString(),
    } satisfies Channel);
  const ada = state.agents.find((a) => a.id === ADA_ID) as Agent;
  state.agents.push({
    ...ada,
    id: "agent-long",
    name: "Maximiliano Alexandre",
    handle: "maximiliano",
    role: "Atendimento ao cliente e cobranças do turno da noite",
    audienceMode: "people",
    audience: { mode: "people", userIds: [], roleIds: ["role-long"] },
  });
  return state;
}

const click = (el: Element) => act(async () => fireEvent.click(el));
const dialogOf = () => screen().getByRole("dialog", { name: `Convidar para a ${ORG}` });

describe("the invite dialog, worst case", () => {
  test("40 addresses pasted, a 64-letter one, a 40-letter cargo and 30 channels: tokens keep their ✕, nothing cut", async () => {
    await renderApp(`/org/${ORG_ID}/settings/invites`, { api: createFakeApi(worst()) });
    await settle(6);
    const [open] = screen().getAllByRole("button", { name: "Convidar pessoas" });
    await click(open as HTMLElement);
    await settle(4);
    const to = within(dialogOf()).getByLabelText("Para");
    const pasted = [LONG_EMAIL, ...Array.from({ length: 39 }, (_, i) => `pessoa.numero.${i + 1}@example.com`)].join(
      "\n",
    );
    await act(async () => fireEvent.paste(to, { clipboardData: { getData: () => pasted } }));
    const long = within(dialogOf()).getByText(LONG_EMAIL).closest(".ac-token") as HTMLElement;
    expect(within(long).getByRole("button", { name: `Remover ${LONG_EMAIL}` })).toBeTruthy();
    expect(within(dialogOf()).getByRole("button", { name: "Convidar 40 pessoas" })).toBeTruthy();
    const cargo = within(dialogOf()).getByRole("button", { name: /^Cargo/ });
    cargo.focus();
    await act(async () => fireEvent.keyDown(cargo, { key: "Enter" }));
    await click(screen().getByRole("menuitemcheckbox", { name: CARGO }));
    await click(screen().getByRole("menuitemcheckbox", { name: "Financeiro" }));
    await act(async () => fireEvent.keyDown(screen().getByRole("menu"), { key: "Escape" }));
    await settle(2);
    expect(cargo.textContent).toContain(CARGO);
    expect(cargo.textContent).toContain("Financeiro");
    // The cargo brought its private channels and its agent.
    expect(dialogOf().textContent).toContain("chamados-urgentes-do-atendimento-noturno-da-regional-sudeste");
    expect(dialogOf().textContent).toContain("Maximiliano Alexandre");
    const channels = within(dialogOf()).getByRole("combobox", { name: "Canais" });
    await act(async () => fireEvent.keyDown(channels, { key: "ArrowDown" }));
    await settle(4);
    expect(within(screen().getByRole("listbox", { name: "Canais" })).getAllByRole("option").length).toBeGreaterThan(20);
    await act(async () => fireEvent.keyDown(channels, { key: "Escape" }));
    const agents = within(dialogOf()).getByRole("combobox", { name: "Agentes" });
    await act(async () => fireEvent.keyDown(agents, { key: "ArrowDown" }));
    await settle(4);
    expect(screen().getByRole("listbox", { name: "Agentes" }).textContent).toContain(
      `Maximiliano AlexandrePelo cargo ${CARGO}`,
    );
  });

  test("Link mode at phone width: Validade and Máximo de pessoas, each its own field", async () => {
    const state = worst();
    await renderApp(`/org/${ORG_ID}/settings/invites`, { api: createFakeApi(state) });
    await settle(6);
    const [open] = screen().getAllByRole("button", { name: "Convidar pessoas" });
    await click(open as HTMLElement);
    await settle(4);
    await click(within(dialogOf()).getByRole("radio", { name: "Link" }));
    await settle(6);
    expect(within(dialogOf()).getByRole("combobox", { name: "Validade" })).toBeTruthy();
    expect(within(dialogOf()).getByRole("combobox", { name: "Máximo de pessoas" })).toBeTruthy();
  });
});

describe("People › Convites, worst case", () => {
  test("a long name and note, a link with three cargos, a 64-letter address: rows wrap whole, actions keep their place", async () => {
    const state = worst();
    const request: JoinRequest = {
      id: "r-long",
      name: "Maria Eduarda Albuquerque de Vasconcelos Figueiredo Sobrinho",
      email: LONG_EMAIL,
      note: "Oi! Sou a nova analista de atendimento do turno da noite. A Carla me passou o link ontem à tarde.",
      verified: true,
      confirmed: true,
      link: {
        id: "link-3",
        createdBy: "Ana Beatriz Nascimento",
        roleIds: ["role-long", "role-fin"],
        channelIds: ["ch-0", "ch-1", "ch-2"],
        agentIds: ["agent-long", ADA_ID],
        full: false,
      },
      createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
      expiresAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
    };
    state.joinRequests = [request];
    const link: InviteLink = {
      id: "link-3",
      url: "http://localhost:3000/invite/link-3",
      expiresAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: "Ana Beatriz Nascimento",
      createdByUserId: "u-ana",
      waiting: 1,
      plain: false,
      roleIds: ["role-long", "role-fin", "role-admin"],
      channelIds: ["ch-0", "ch-1", "ch-2", "ch-3"],
      agentIds: ["agent-long", ADA_ID],
      maxUses: 10,
      uses: 10,
    };
    state.inviteLinks = [link];
    const invitation: InvitationWithStatus = {
      id: "inv-long",
      email: LONG_EMAIL,
      role: "member",
      roleIds: ["role-long"],
      channelIds: ["ch-0"],
      agentIds: ["agent-long"],
      status: "pending",
      expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
      invitedBy: "Ana Beatriz Nascimento",
      url: "http://localhost:3000/invite/tok-inv-long",
    };
    state.invitations.push(invitation);
    await renderApp(`/org/${ORG_ID}/settings/invites`, { api: createFakeApi(state) });
    await settle(6);
    const links = screen().getByRole("region", { name: "Links" });
    const row = within(links).getAllByRole("group")[0] as HTMLElement;
    expect(row.querySelector(".members-row__state")?.getAttribute("data-tone")).toBe("soon");
    expect(row.querySelector(".members-row__state")?.textContent).toMatch(
      /^10 de 10 pessoas · expira em \d+ h · de Ana/,
    );
    const waiting = screen().getByRole("region", { name: "Esperando você" });
    expect(waiting.textContent).toContain("Com o link:");
    const emails = screen().getByRole("region", { name: "Convites por e-mail" });
    expect(within(emails).getByRole("group", { name: `Convite para ${LONG_EMAIL}` })).toBeTruthy();
  });
});
