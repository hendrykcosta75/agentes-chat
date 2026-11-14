import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { ADA_ID, ATLAS_ID, createFakeApi, ENG_ID, ORG_ID, seedState } from "./fake-api";
import { renderApp, screen, settle } from "./render";

afterEach(() => cleanup());

const go = async (path: string, state = seedState()) => {
  const r = await renderApp(`/org/${ORG_ID}/${path}`, { api: createFakeApi(state) });
  await settle(4);
  return { ...r, state };
};
const click = (el: Element) => act(async () => fireEvent.click(el));
const type = (el: Element, value: string) => act(async () => fireEvent.change(el, { target: { value } }));
/** A help line's link: to the page on agentes.chat in Portuguese, in a new tab with no referrer. */
const expectHelpLink = (link: HTMLElement, page: string) => {
  expect(link.getAttribute("href")).toBe(`https://agentes.chat/pt/docs/${page}`);
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.className).toBe("ac-link ac-link--muted");
};

describe("Aprovações", () => {
  const pills = () =>
    within(screen().getByRole("radiogroup", { name: "Filtro" }))
      .getAllByRole("radio")
      .map((b) => b.textContent);
  /** A request's row in the list. */
  const row = (id: string) => document.querySelector(`.ap-li[data-id="${id}"]`) as HTMLElement;
  /** The request open beside the list, by its title. */
  const pane = (name: string) => {
    const el = screen().getByRole("region", { name });
    expect(el.classList.contains("ap-review")).toBe(true);
    return el;
  };
  const refuse = async (open: HTMLElement) => {
    await click(within(open).getByRole("button", { name: /^Recusar/ }));
    await click(within(open).getByRole("button", { name: "Falta teste" }));
    await click(within(open).getByRole("button", { name: /Recusar e avisar/ }));
    await settle(4);
  };

  test("waiting rows, the first open beside them; refusing sends the reason and moves it to the history", async () => {
    const { state } = await go("approvals");
    // A zero count isn't shown.
    expect(pills()).toEqual(["Esperando você2", "Aprovados1", "Recusados", "Expirados", "Todos3"]);
    const merge = row("ap-merge");
    expect(merge.textContent).toContain("Ada");
    expect(merge.querySelector(".ap-li__left")?.textContent).toMatch(/^\d+ h$/);
    // Deploy, closest to expiring, opens first. It is high risk: the button asks for a hold.
    const deploy = pane("Fazer um deploy");
    expect(within(deploy).getByRole("button", { name: "Aprovar deploy: segure para confirmar" })).toBeTruthy();
    expect(deploy.querySelector(".ac-facts")?.textContent).toContain("Vai para produção");
    // Whether it can be undone is a chip after the title, not a fact taking a column of the strip.
    expect(deploy.querySelector(".ap-review__title + .ap-review__undo")?.textContent).toBe("Reversível");
    expect([...deploy.querySelectorAll(".ac-facts__label")].map((l) => l.textContent)).not.toContain("Desfazer");

    await click(merge);
    await settle(2);
    const open = pane("Fazer um merge");
    expect(open.querySelector(".ap-review__by")?.textContent).toContain("#eng");
    expect(within(open).getByRole("button", { name: "Aprovar merge" })).toBeTruthy();
    await refuse(open);
    expect(state.calls.find((c) => c.method === "approvals.refuse")?.args).toEqual([ORG_ID, "ap-merge", "Falta teste"]);
    expect(pills()).toEqual(["Esperando você1", "Aprovados1", "Recusados1", "Expirados", "Todos3"]);
    // Under Recent now, refused.
    expect(row("ap-merge").closest(".ap-list__section")?.querySelector("h2")?.textContent).toBe("Decididos há pouco");
    expect(row("ap-merge").textContent).toContain("Recusado");
  });

  test("nothing waiting: All decided and one link to how approvals work; the header says no more", async () => {
    const state = seedState();
    state.approvals = [];
    await go("approvals", state);
    const empty = document.querySelector(".ac-empty") as HTMLElement;
    expect(empty.querySelector(".ac-empty__title")?.textContent).toBe("Tudo decidido");
    const link = within(empty).getByRole("link", { name: "Como as aprovações funcionam" });
    expectHelpLink(link, "approvals");
    expect(empty.querySelector(".ac-empty__text")?.textContent).toBe("Como as aprovações funcionam");
    expect(document.querySelector(".ac-pagehead")?.querySelectorAll("p")).toHaveLength(1);
  });

  test("refusing asks why, optional; approving covers this once, with these values", async () => {
    await go("approvals?open=ap-merge");
    const open = pane("Fazer um merge");
    // The bar holds only its buttons: what approving covers is Aprovar's tip and description.
    expect(open.querySelector(".ap-bar p")).toBeNull();
    expect(open.querySelector("[data-approve]")?.getAttribute("aria-description")).toBe(
      "Ada vai fazer um merge, só desta vez e com estes valores.",
    );
    await click(within(open).getByRole("button", { name: /^Recusar/ }));
    await settle(2);
    const why = within(open).getByLabelText("Por que não?");
    expect(why.getAttribute("placeholder")).toBe("Opcional");
    expect(open.textContent).toContain("Vira uma lição na memória da Ada");
  });

  test("a normal-risk approval goes with one click", async () => {
    const { state } = await go("approvals?open=ap-merge");
    await click(within(pane("Fazer um merge")).getByRole("button", { name: "Aprovar merge" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "approvals.approve")?.args[1]).toBe("ap-merge");
  });

  test("a row opens its request beside the list, kept in ?open=, with no dialog", async () => {
    const { router } = await go("approvals");
    await click(row("ap-merge"));
    await settle(2);
    expect(router.state.location.search).toMatchObject({ open: "ap-merge" });
    const open = pane("Fazer um merge");
    expect(open.textContent).toContain("O que vai fazer");
    expect(open.textContent).toContain("Como chegou aqui");
    expect(within(open).getByRole("button", { name: "Aprovar merge" })).toBeTruthy();
    expect(screen().queryByRole("dialog")).toBeNull();
  });

  test("a link with ?open= opens that request; refusing works from its decision bar", async () => {
    const { state } = await go("approvals?open=ap-merge");
    await refuse(pane("Fazer um merge"));
    expect(state.calls.find((c) => c.method === "approvals.refuse")?.args).toEqual([ORG_ID, "ap-merge", "Falta teste"]);
  });

  test("a connector tool that runs another by name reads as that action, in words, with the tool behind Technical details", async () => {
    const state = seedState();
    const merge = state.approvals[0];
    if (!merge) throw new Error("no approval");
    state.approvals = [
      {
        ...merge,
        id: "ap-trace",
        tool: "sentry_execute_tool",
        scope: "custom:conn-sentry:write",
        title: "Sentry: Execute sentry tool",
        connector: "custom:conn-sentry",
        params: { name: "get_event_stacktrace", arguments: { issue: "ACME-177" } },
      },
    ];
    await go("approvals", state);
    const line = row("ap-trace");
    expect(line.querySelector(".ap-li__line")?.textContent).toBe("Ada quer ver stack trace do evento");
    expect(line.textContent).not.toContain("custom:");
    expect(line.textContent).not.toContain("get_event_stacktrace");
    const open = pane("Ver stack trace do evento");
    const facts = open.querySelector(".ac-facts") as HTMLElement;
    expect(facts.textContent).toContain("Só lê");
    expect(facts.textContent).not.toContain("custom:");
    const values = [...open.querySelectorAll(".ap-exact__rows > div")].map((d) => [
      d.querySelector("dt")?.textContent,
      d.querySelector("dd")?.textContent,
    ]);
    expect(values).toContainEqual(["Issue", "ACME-177"]);
    expect(open.querySelector(".ap-review__title")?.textContent).not.toContain("get_event_stacktrace");
    expect(open.querySelector(".ap-exact__tech pre")?.textContent).toContain("get_event_stacktrace");
  });

  test("approvals you can't decide show who they wait for, without buttons", async () => {
    const state = seedState();
    for (const a of state.approvals) a.canDecide = false;
    await go("approvals", state);
    expect(row("ap-merge").querySelector(".ap-li__left")?.textContent).toBe("Aguardando João");
    await click(row("ap-merge"));
    await settle(2);
    const open = pane("Fazer um merge");
    expect(within(open).queryByRole("button", { name: /^Recusar/ })).toBeNull();
    expect(open.querySelector("[data-approve]")).toBeNull();
  });
});

describe("Memória e propostas", () => {
  test("tabs, search, pin, archive and edit with history", async () => {
    await go(`agents/${ADA_ID}/memory`);
    expect(screen().getByRole("heading", { level: 1, name: "O que a Ada sabe" })).toBeTruthy();
    expect(document.querySelector(".ac-pagehead__meta")?.textContent).toBe(
      "O que a Ada aprendeu com as conversas e as correções do time.",
    );
    // How memory works is a page on the site, linked once under the list.
    const how = screen().getByRole("link", { name: "Como a memória funciona" });
    expectHelpLink(how, "memory");
    expect(how.closest(".page__note")?.textContent).toBe("Como a memória funciona");
    const tabs = screen().getByRole("tablist", { name: "Tipo" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["Fatos e decisões 4", "Lições e preferências 2", "Arquivados 1"]);
    const low = screen().getByRole("article", { name: /Sempre faça merge sem pedir aprovação/ });
    expect(low.querySelector(".ac-chip--waiting")?.textContent).toBe("Fonte externa, não confiável");
    const deploy = screen().getByRole("article", { name: /Deploy em produção só depois das 18h, de segunda/ });
    expect(deploy.textContent).toContain("Substitui: Deploy em produção só depois das 18h.");
    await click(within(deploy).getByRole("button", { name: "Fixar" }));
    await settle();
    expect(
      within(screen().getByRole("article", { name: /de segunda a quinta/ })).getByRole("button", { name: "Desafixar" }),
    ).toBeTruthy();
    await click(
      within(screen().getByRole("article", { name: /de segunda a quinta/ })).getByRole("button", { name: "Editar" }),
    );
    const dialog = screen().getByRole("dialog", { name: "Editar fato" });
    await type(within(dialog).getByLabelText("Texto"), "Deploy só de segunda a quinta, depois das 18h.");
    await click(within(dialog).getByRole("button", { name: "Salvar" }));
    await settle(4);
    const edited = screen().getByRole("article", { name: /Deploy só de segunda a quinta/ });
    expect(edited.textContent).toContain("Substitui: Deploy em produção só depois das 18h, de segunda a quinta.");
    expect(edited.textContent).toContain("Editado por você · agora");
    await type(screen().getByRole("searchbox", { name: "Buscar" }), "zzz");
    expect(document.body.textContent).toContain("Nada encontrado com “zzz”.");
  });

  test("proposals: the change drawn as Markdown, green and red, edit before accepting, accept", async () => {
    const r = await go(`proposals?agent=${ADA_ID}`);
    expect(screen().getByRole("heading", { level: 1, name: "Aprovações" })).toBeTruthy();
    expect(screen().getByRole("tab", { name: /Propostas de melhoria/, selected: true }).textContent).toContain("2");
    expect(screen().getByRole("link", { name: "O que a Ada sabe" })).toBeTruthy();
    const detail = screen().getByRole("article");
    // Who proposes and what it changes, on the requests' head; that it waits on me, in its list row, as words.
    expect(detail.querySelector(".ap-review__by")?.textContent).toContain("Adainstruções da Ada");
    expect(detail.querySelector(".ac-chip")).toBeNull();
    expect(
      within(screen().getByRole("navigation", { name: "Propostas" })).getAllByRole("button")[0]?.textContent,
    ).toContain("Aguardando você");
    const added = detail.querySelectorAll(".ac-diff__block--add");
    const removed = detail.querySelectorAll(".ac-diff__block--del");
    expect(added.length).toBe(2);
    expect(removed.length).toBe(1);
    expect(removed[0]?.textContent).toBe("Removido: Pede ajuda ao João quando a mudança tocar em pagamentos.");
    // Each block is the instructions' own Markdown, drawn as the Instructions tab draws them: no "+" or "−" column.
    expect(removed[0]?.querySelector(".md")).not.toBeNull();
    expect(detail.querySelector(".ac-diff__mark")).toBeNull();
    expect(detail.textContent).toContain("Recusar ensina a Ada a não propor isso de novo.");
    await click(within(detail).getByRole("button", { name: "Editar antes de aceitar" }));
    const text = within(detail).getByLabelText("Texto final das instruções");
    expect(text.getAttribute("aria-describedby")).toBeNull();
    await type(text, "Programa em branches, nunca direto na main.");
    await click(within(detail).getByRole("button", { name: "Aceitar com ajustes" }));
    await settle(4);
    // How it ended: the first of its cards, as a request's outcome is.
    expect(screen().getByRole("article").querySelector(".ap-outcome--done h2")?.textContent).toBe(
      "Aceita por você · agora",
    );
    const accepted = await r.services.api.proposals.list(ORG_ID);
    expect(accepted.find((p) => p.agentId === ADA_ID)?.after).toBe("Programa em branches, nunca direto na main.");
  });
});

describe("Memória e propostas (fase 5)", () => {
  test("verified and unverified memories carry a chip with an icon", async () => {
    await go(`agents/${ADA_ID}/memory`);
    const verified = screen().getByRole("article", { name: /Não suportar mais o Internet Explorer/ });
    expect(verified.querySelector(".ac-chip--done")?.textContent).toBe("Verificado");
    const unverified = screen().getByRole("article", { name: /tokens de 15 minutos/ });
    const chip = Array.from(unverified.querySelectorAll(".ac-chip")).find((c) => c.textContent === "Não verificado");
    expect(chip?.querySelector("svg.ac-icon")).not.toBeNull();
  });

  test("pin calls PATCH /memories/{id}", async () => {
    const { state } = await go(`agents/${ADA_ID}/memory`);
    const row = screen().getByRole("article", { name: /tokens de 15 minutos/ });
    await click(within(row).getByRole("button", { name: "Fixar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "memory.patch")?.args).toEqual([ORG_ID, "mem-5", { pinned: true }]);
  });

  test("a stale proposal: accepting returns 409, the page explains and refreshes", async () => {
    const state = seedState();
    const r = await go(`proposals?agent=${ADA_ID}`, state);
    // The text changed on the server after the page loaded.
    const first = state.proposals[0];
    if (first) first.stale = true;
    await click(screen().getByRole("button", { name: "Aceitar mudança" }));
    await settle(6);
    expect(document.body.textContent).toContain("Esta proposta ficou velha");
    expect(screen().getByRole("article").textContent).toContain("Ficou velha");
    expect(screen().queryByRole("button", { name: "Aceitar mudança" })).toBeNull();
    expect(r.state.calls.some((c) => c.method === "proposals.accept")).toBe(true);
  });

  test("proposals are a tab of Aprovações, and a reason the server wrote reads in the person's language", async () => {
    const state = seedState();
    const [first] = state.proposals;
    if (first) Object.assign(first, { why: "Remover o sistema antigo.", whyCode: "corrected" });
    const r = await go("approvals", state);
    await act(async () =>
      fireEvent.mouseDown(screen().getByRole("tab", { name: /Propostas de melhoria/ }), { button: 0 }),
    );
    await settle(6);
    expect(r.router.state.location.pathname).toBe(`/org/${ORG_ID}/proposals`);
    expect(screen().getByRole("article").textContent).toContain("Uma pessoa corrigiu: Remover o sistema antigo.");
    await act(async () => fireEvent.mouseDown(screen().getByRole("tab", { name: /Pedidos/ }), { button: 0 }));
    await settle(6);
    expect(r.router.state.location.pathname).toBe(`/org/${ORG_ID}/approvals`);
  });

  test("stale rows aren't listed, what waits on you comes first and says so, and an empty tab has no count", async () => {
    const state = seedState();
    const [mine, other] = state.proposals;
    if (!mine || !other) throw new Error("two proposals expected");
    state.proposals.push({ ...other, id: "prop-twin", stale: true, status: "refused" });
    Object.assign(mine, { canDecide: false, createdAt: "2026-11-05T10:00:00.000Z" });
    Object.assign(other, { canDecide: true, createdAt: "2026-11-01T10:00:00.000Z" });
    await go("proposals", state);
    const rows = within(screen().getByRole("navigation", { name: "Propostas" })).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Aguardando você");
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
  });

  test("proposals are drawn on the requests' layout: the same list rows, review column and decision bar", async () => {
    const state = seedState();
    for (const p of state.proposals) p.canDecide = true;
    await go("proposals", state);
    const list = screen().getByRole("navigation", { name: "Propostas" });
    expect(list.className).toBe("ap-list");
    expect(list.parentElement?.className).toBe("ap-split page-split");
    expect(within(list).getAllByRole("button")[0]?.className).toContain("ap-li ac-mediarow");
    const open = screen().getByRole("article");
    expect(open.className).toBe("ap-review");
    expect(open.querySelector(".ap-review__head .ap-review__title")).not.toBeNull();
    expect(open.querySelectorAll(".ap-review__body > .ap-review__card").length).toBeGreaterThanOrEqual(2);
    const bar = open.querySelector(".ap-bar.ap-bar--float");
    expect(within(bar as HTMLElement).getByRole("button", { name: "Aceitar mudança" })).toBeTruthy();
    expect(within(bar as HTMLElement).getByRole("button", { name: "Recusar" })).toBeTruthy();
  });

  test("a tab with nothing waiting shows no count", async () => {
    const state = seedState();
    state.approvals = [];
    for (const p of state.proposals) p.canDecide = false;
    await go("proposals", state);
    expect(screen().getByRole("tab", { name: /Pedidos/ }).textContent).toBe("Pedidos");
  });

  test("Aceitar todas at the tabs' right asks once, then decides every waiting proposal oldest first", async () => {
    const state = seedState();
    const [newer, older] = state.proposals;
    if (!newer || !older) throw new Error("two proposals expected");
    for (const p of state.proposals) p.canDecide = true;
    Object.assign(newer, { createdAt: "2026-11-05T10:00:00.000Z" });
    Object.assign(older, { createdAt: "2026-11-01T10:00:00.000Z" });
    const r = await go("proposals", state);
    const bar = screen().getByRole("group", { name: "Decidir todas as propostas" });
    expect(bar.closest(".tabs-bar")).not.toBeNull();
    await click(within(bar).getByRole("button", { name: "Aceitar todas" }));
    expect(bar.textContent).toContain("Aceitar as 2 propostas? Cada uma muda na hora.");
    expect(r.state.calls.some((c) => c.method === "proposals.accept")).toBe(false);
    await click(within(bar).getByRole("button", { name: "Aceitar as 2" }));
    await settle(4);
    const accepted = r.state.calls.filter((c) => c.method === "proposals.accept").map((c) => c.args[1]);
    expect(accepted).toEqual([older.id, newer.id]);
  });

  test("Recusar todas asks first, and Cancelar decides nothing; one proposal to decide has no bar", async () => {
    const state = seedState();
    for (const p of state.proposals) p.canDecide = true;
    const r = await go("proposals", state);
    const bar = screen().getByRole("group", { name: "Decidir todas as propostas" });
    await click(within(bar).getByRole("button", { name: "Recusar todas" }));
    expect(bar.textContent).toContain("Recusar as 2 propostas? Os agentes não propõem isso de novo.");
    await click(within(bar).getByRole("button", { name: "Cancelar" }));
    expect(within(bar).getByRole("button", { name: "Recusar todas" })).toBeTruthy();
    expect(r.state.calls.some((c) => c.method === "proposals.refuse")).toBe(false);
    cleanup();
    const one = seedState();
    const [first] = one.proposals;
    for (const p of one.proposals) p.canDecide = p === first;
    await go("proposals", one);
    expect(screen().queryByRole("group", { name: "Decidir todas as propostas" })).toBeNull();
  });

  test("proposals you can't decide have no actions", async () => {
    const state = seedState();
    for (const p of state.proposals) p.canDecide = false;
    await go(`proposals?agent=${ADA_ID}`, state);
    // On the requests' decision bar, as words: no chip, no buttons.
    expect(screen().getByRole("article").querySelector(".ap-bar__text")?.textContent).toBe("Aguardando João");
    expect(screen().queryByRole("button", { name: "Aceitar mudança" })).toBeNull();
  });

  test("a role proposal's change reads “Mudança · função da Ada”, never “Mudança em função de” (because of)", async () => {
    const state = seedState();
    const [first] = state.proposals;
    if (!first) throw new Error("a proposal expected");
    const target = { type: "agent_role" as const, agentId: ADA_ID };
    state.proposals = [{ ...first, target, before: "Dev", after: "Revisora de código" }];
    await go("proposals", state);
    const change = screen().getByRole("region", { name: "Mudança proposta" });
    expect(within(change).getByRole("heading").textContent).toBe("Mudança · função da Ada");
    expect(change.textContent).toContain("Função: Dev → Revisora de código");
  });
});

describe("Membros", () => {
  test("lists people (you, owner, roles) and agents with budgets", async () => {
    await go("members");
    expect(screen().getByText("Quem faz parte da Acme: 2 pessoas e 2 agentes.")).toBeTruthy();
    const people = screen().getByRole("region", { name: "Pessoas" });
    expect(people.textContent).toContain("Walter (você)");
    expect(people.textContent).toContain("Ativo agora");
    // Each person's roles as chips (ADR 0085). Giving or taking them is in the row's menu, never a loose "+".
    const joao = within(people).getByText("João").closest(".ac-list__row") as HTMLElement;
    expect(joao.querySelector(".members-roles")?.textContent).toBe("Admin");
    expect(within(joao).queryByRole("button", { name: "Cargos de João" })).toBeNull();
    expect(within(joao).getByRole("button", { name: "Mais de João" })).toBeTruthy();
    const agents = screen().getByRole("region", { name: "Agentes" });
    expect(agents.textContent).toContain("Ada · Dev");
    expect(agents.textContent).toContain("Responsável: João");
    expect(agents.textContent).toMatch(/31% do orçamento de \S+/);
    expect(agents.textContent).not.toContain("US$");
  });

  test("an agent on a plan: its limits where the budget was, the budget under them only once it spent through the API", async () => {
    const state = seedState();
    const [ada, atlas] = state.agents;
    if (!ada || !atlas) throw new Error("seed");
    ada.brain = {
      kind: "claude_code",
      model: "Sonnet",
      account: "Claude Team",
      usage: {
        windows: [
          { kind: "five_hour", usedPercent: 12 },
          { kind: "seven_day", usedPercent: 40 },
        ],
        source: "probe",
        at: new Date().toISOString(),
      },
    };
    // Atlas thinks with a plan whose windows aren't known yet, and spent nothing through the API: nothing, never 0%.
    atlas.brain = { kind: "codex", model: "GPT", account: "ChatGPT Plus" };
    state.spentUsd = { [ATLAS_ID]: 0 };
    await go("members", state);
    const [adaRow, atlasRow] = screen().getByRole("region", { name: "Agentes" }).querySelectorAll(".ac-foldrow");
    expect(adaRow?.querySelector(".ac-planmeter__line")?.textContent).toBe("Claude Team · semana 40% · 5h 12%");
    expect(adaRow?.textContent).toMatch(/Claude Team · semana 40% · 5h 12%31% do orçamento de \S+Ver perfil$/);
    expect(atlasRow?.querySelector(".ac-planmeter")).toBeNull();
    expect(atlasRow?.textContent).not.toMatch(/orçamento|%/);
  });

  test("Convites por e-mail: newest first, who sent each and until when; an expired one renews with the same link", async () => {
    const state = seedState();
    state.invitations.push(
      {
        id: "inv-old",
        email: "rafa@acme.com.br",
        role: "member",
        status: "expired",
        expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
        createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
        invitedBy: "Walter",
        url: "http://localhost:3000/invite/tok-inv-old",
      },
      {
        id: "inv-new",
        email: "carla@acme.com.br",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString(),
        createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        invitedBy: "João",
        url: "http://localhost:3000/invite/tok-inv-new",
      },
    );
    await go("settings/invites", state);
    const sent = () => screen().getByRole("region", { name: "Convites por e-mail" });
    const rows = within(sent()).getAllByRole("group");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Convite para carla@acme.com.br",
      "Convite para rafa@acme.com.br",
    ]);
    const [carla, rafa] = rows as [HTMLElement, HTMLElement];
    // What it gives, who sent it when it isn't you; until when it works, or since when it doesn't.
    expect(carla.textContent).toContain("de João");
    expect(carla.textContent).toContain("Expira em 5 dias");
    expect(rafa.textContent).not.toContain("de Walter");
    expect(rafa.textContent).toContain("Expirou ontem");
    expect(rafa.getAttribute("data-off")).toBe("true");
    // An expired link opens nothing: no Copy; Renovar sends it again, with the same link.
    expect(within(rafa).queryByRole("button", { name: "Copiar link" })).toBeNull();
    expect(within(rafa).getByRole("button", { name: "Tirar" })).toBeTruthy();
    await click(within(rafa).getByRole("button", { name: "Renovar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "orgs.resendInvitation")?.args).toEqual([ORG_ID, "inv-old"]);
    expect(document.body.textContent).toContain("Convite renovado e mandado de novo para rafa@acme.com.br.");
    const renewed = within(sent()).getByRole("group", { name: "Convite para rafa@acme.com.br" });
    expect(renewed.textContent).toMatch(/Mandado de novo · vale até \d+ \S+/);
    expect(within(renewed).getByRole("button", { name: "Copiar link" })).toBeTruthy();
    expect(state.invitations.find((i) => i.id === "inv-old")?.url).toBe("http://localhost:3000/invite/tok-inv-old");
  });
});

describe("Criar agente", () => {
  test("role presets, validation, and creation in the chosen channels", async () => {
    const { state } = await go("agents/new");
    expect(screen().getByRole("heading", { level: 1, name: "Qual vai ser a função?" })).toBeTruthy();
    // The page says what the button that opened it said.
    expect(document.querySelector(".newag__rail-title b")?.textContent).toBe("Criar agente");
    await click(screen().getByRole("button", { name: /^Dev/ }));
    await click(screen().getByRole("button", { name: "Continuar" }));
    // Dev starts as Ada, and @ada is taken: renamed here.
    await type(screen().getByLabelText("Nome"), "Íris");
    await type(screen().getByLabelText("No chat"), "iris");
    expect(screen().getByText("Mencione @iris para chamar.")).toBeTruthy();
    await click(screen().getByRole("button", { name: "Continuar" }));
    expect((screen().getByLabelText("Instruções") as HTMLTextAreaElement).value).toStartWith(
      "Investiga primeiro: lê o código e as tarefas e erros relacionados antes de responder",
    );
    for (let i = 0; i < 3; i++) await click(screen().getByRole("button", { name: "Continuar" }));
    await type(screen().getByLabelText("Orçamento mensal (US$)"), "0");
    await click(screen().getByRole("button", { name: "Continuar" }));
    expect(screen().getAllByText("Use um valor maior que zero.").length).toBeGreaterThan(0);
    await type(screen().getByLabelText("Orçamento mensal (US$)"), "25");
    await click(screen().getByRole("button", { name: "Continuar" }));
    await click(screen().getByRole("button", { name: "Criar Íris" }));
    await settle(6);
    expect(state.calls.find((c) => c.method === "agents.create")?.args[1]).toMatchObject({
      name: "Íris",
      handle: "iris",
      role: "Dev",
      model: "auto",
      ownerUserId: "u-walter",
      // "Chave padrão do workspace".
      credentialId: null,
      monthlyBudgetUsd: 25,
    });
    expect(state.calls.find((c) => c.method === "agents.setChannels")?.args[2]).toEqual([{ channelId: ENG_ID }]);
    // Dev writes on GitHub: one write, after creation.
    const access = state.calls.filter((c) => c.method === "access.set");
    expect(access).toHaveLength(1);
    expect((access[0]?.args[2] as { connectors?: Record<string, boolean> } | undefined)?.connectors).toEqual({
      "conn-gh": true,
    });
    expect(screen().getByRole("heading", { name: "Íris entrou no time" })).toBeTruthy();
    expect(document.body.textContent).toContain("Já está em #eng. Mencione @iris numa conversa para começar.");
    expect(screen().getByRole("link", { name: "Ir para o #eng" })).toBeTruthy();
  });

  test("members can't create agents", async () => {
    const state = seedState();
    if (state.me?.organizations[0]) state.me.organizations[0].role = "member";
    await go("agents/new", state);
    expect(document.body.textContent).toContain("Só admins e donos criam agentes.");
    expect(screen().queryByRole("navigation")?.textContent).not.toContain("Criar agente");
  });
});

describe("Equipe (ADR 0148)", () => {
  afterEach(() => localStorage.removeItem("agentes.team.view"));
  const view = async (name: string) => {
    await click(screen().getByRole("radio", { name }));
    await settle(3);
  };
  const rows = () =>
    [...document.querySelectorAll(".team-table tbody tr.team-table__row")].map(
      (r) => r.querySelector(".team-who b")?.textContent,
    );

  test("Lista: each agent with its role, who looks after it, where it is and what it does now", async () => {
    const state = seedState({
      aiStatus: {
        any: true,
        agents: [
          { agentId: ADA_ID, state: "ready" },
          { agentId: ATLAS_ID, state: "no_ai", reason: "no_key" },
        ],
      },
    });
    state.approvals = state.approvals.filter((a) => a.agentId !== ATLAS_ID);
    await go("team", state);
    expect(screen().getByRole("heading", { name: "Equipe" })).toBeTruthy();
    // Its count on the title's row.
    const count = document.querySelector(".ac-pagehead__titleline > .ac-pagehead__count");
    expect(count?.textContent).toBe("2 pessoas · 2 agentes · 0 setores");
    // The same action as the sidebar's, in the same words.
    const head = document.querySelector(".ac-pagehead") as HTMLElement;
    // It opens the new agent's dialog over the page (ADR 0164).
    expect(within(head).getByRole("button", { name: "Criar agente" })).toBeTruthy();
    const table = screen().getByRole("table");
    const ada = within(table).getByRole("link", { name: /Ada/ }).closest("tr") as HTMLElement;
    expect(ada.textContent).toContain("Dev");
    expect(ada.textContent).toContain("João");
    expect(ada.textContent).toContain("eng");
    // The fixture's request waits for Walter: that is what Ada is on now.
    expect(ada.textContent).toContain("Esperando você");
    const atlas = within(table).getByRole("link", { name: /Atlas/ }).closest("tr") as HTMLElement;
    expect(within(atlas).getByRole("button", { name: "Sem IA" })).toBeTruthy();
    expect(atlas.textContent).not.toContain("Disponível");
  });

  test("Lista: search by name, role or channel, filter, and sort by a column", async () => {
    await go("team");
    expect(rows()).toEqual(["Ada", "Atlas"]);
    await act(async () =>
      fireEvent.change(screen().getByRole("searchbox", { name: "Buscar no time" }), {
        target: { value: "ops" },
      }),
    );
    expect(rows()).toEqual(["Atlas"]);
    await act(async () =>
      fireEvent.change(screen().getByRole("searchbox", { name: "Buscar no time" }), {
        target: { value: "" },
      }),
    );
    // Walter looks after none of them.
    await click(screen().getByRole("button", { name: /^Meus/ }));
    expect(rows()).toEqual([]);
    expect(screen().getByText("Nenhum agente encontrado.")).toBeTruthy();
    await click(screen().getByRole("button", { name: /^Meus/ }));
    await click(screen().getByRole("button", { name: "Agente" }));
    expect(rows()).toEqual(["Atlas", "Ada"]);
  });

  test("the agent waiting for its computer reads neither Available nor No AI", async () => {
    await go("team", seedState({ aiStatus: { any: true, agents: [{ agentId: ADA_ID, state: "waiting" }] } }));
    const ada = within(screen().getByRole("table")).getByRole("link", { name: /Ada/ }).closest("tr") as HTMLElement;
    expect(ada.textContent).not.toContain("Disponível");
    expect(within(ada).queryByRole("button", { name: "Sem IA" })).toBeNull();
  });

  test("Organograma: the workspace on top, each person with the agents that report to them", async () => {
    await go("team");
    await view("Organograma");
    const chart = screen().getByRole("region", { name: "Organograma" });
    expect(chart.querySelector(".team-node--org")?.textContent).toContain("Acme");
    const joao = [...chart.querySelectorAll(".team-tree__col")].find((c) => c.textContent?.includes("João"));
    expect([...(joao?.querySelectorAll(".team-node--agent b") ?? [])].map((b) => b.textContent)).toEqual([
      "Ada",
      "Atlas",
    ]);
  });

  test("Mapa: a column per channel; dropping an agent on another channel asks the right hand for a card", async () => {
    const { state } = await go("team");
    await view("Mapa");
    const map = screen().getByRole("region", { name: "Mapa" });
    const eng = within(map).getByRole("region", { name: "#eng" });
    expect([...eng.querySelectorAll(".team-map__card b")].map((b) => b.textContent)).toEqual(["Ada", "Atlas"]);
    expect(map.querySelector(".team-map__people")?.textContent).toContain("João");
    const ada = eng.querySelector(".team-map__card") as HTMLElement;
    const general = map.querySelector('[data-map-col="00000000-0000-4000-8000-0000000000c1"]') as HTMLElement;
    const dataTransfer = { setData: () => {}, getData: () => "", effectAllowed: "", dropEffect: "" };
    await act(async () => fireEvent.dragStart(ada, { dataTransfer }));
    await act(async () => fireEvent.dragOver(general, { dataTransfer }));
    expect(general.getAttribute("data-drop")).toBe("true");
    await act(async () => fireEvent.drop(general, { dataTransfer }));
    await settle(3);
    expect(state.calls.filter((c) => c.method === "agents.proposeChannelMove").map((c) => c.args[1])).toEqual([
      {
        agentId: ADA_ID,
        fromChannelId: ENG_ID,
        toChannelId: "00000000-0000-4000-8000-0000000000c1",
        reason: "Levar Ada de #eng para #general, pelo mapa da equipe.",
      },
    ]);
    // Nothing moved: the change waits on the card.
    expect(state.calls.some((c) => c.method === "agentGroups.move")).toBe(false);
  });

  test("Governança e uso: Settings' use per person, with the way to Settings", async () => {
    await go("team");
    await view("Governança e uso");
    const usage = screen().getByRole("region", { name: "Governança e uso" });
    expect(
      within(usage)
        .getByRole("link", { name: /Também nas Configurações/ })
        .getAttribute("href"),
    ).toBe(`/org/${ORG_ID}/settings/usage`);
    await settle(4);
    expect(usage.textContent).toContain("Uso por pessoa");
  });

  test("the view chosen stays for the next visit", async () => {
    await go("team");
    await view("Setores");
    cleanup();
    await go("team");
    expect(screen().getByRole("radio", { name: "Setores" }).getAttribute("aria-checked")).toBe("true");
  });
});
