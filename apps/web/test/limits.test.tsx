import { afterEach, describe, expect, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import { ApiError, type WorkspaceLimits } from "@agenteschat/client";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { setNavigateAway } from "@/lib/navigate";
import { createFakeApi, ORG_ID, seedState } from "./fake-api";
import { renderApp, screen, settle } from "./render";

afterEach(() => cleanup());

const GB = 1024 ** 3;
const BILLING = "https://billing.example.com";
const click = (el: Element) => act(async () => fireEvent.click(el));
const limits = (over: Partial<WorkspaceLimits> = {}): WorkspaceLimits => ({
  members: { used: 2, limit: null },
  storage: { usedBytes: 0, limitBytes: null, ownStorage: false },
  uploads: { usedBytes24h: 0, limitBytesPerDay: null },
  ...over,
});
/** Acme with these limits, where a billing service runs (`billing`), opened at `path`. */
async function go(path: string, over: Partial<WorkspaceLimits>, billing = true) {
  const state = seedState({ limits: limits(over) });
  state.authConfig = { ...state.authConfig, billingUrl: billing ? BILLING : null };
  const api = createFakeApi(state);
  const left: string[] = [];
  setNavigateAway((url) => left.push(url));
  const { sockets, router } = await renderApp(`/org/${ORG_ID}/${path}`, { api });
  await settle(6);
  const billingLinks = () => state.calls.filter((c) => c.method === "orgs.billingLink").map((c) => c.args[1]);
  return { api, state, left, billingLinks, sockets, router };
}
/**
 * Members' "Convidar pessoas" opens the invite dialog (ADR 0090, 0184); an address goes in, so the only thing that can
 * keep Convidar waiting is a full workspace.
 */
async function inviteDialog() {
  const [open] = screen().getAllByRole("button", { name: "Convidar pessoas" });
  await click(open as HTMLElement);
  await settle(2);
  const dialog = () => screen().getByRole("dialog", { name: "Convidar para a Acme" });
  const to = within(dialog()).getByLabelText("Para");
  await act(async () => fireEvent.change(to, { target: { value: "nova@acme.com.br" } }));
  await act(async () => fireEvent.keyDown(to, { key: "Enter" }));
  return dialog;
}
const sendButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Convidar 1 pessoa" });

describe("a workspace's limits (ADR 0079)", () => {
  test("Plano e cobrança: people and files against them, in plain numbers", async () => {
    await go("settings/billing", {
      members: { used: 3, limit: 10 },
      storage: { usedBytes: 40 * GB, limitBytes: 50 * GB, ownStorage: false },
    });
    const card = screen().getByLabelText("Plano e cobrança");
    expect(card.textContent).toContain("Pessoas3 de 10");
    expect(card.textContent).toContain("Arquivos40 GB de 50 GB");
    expect(within(card).getAllByRole("meter")).toHaveLength(2);
    cleanup();
    await go("settings/billing", { storage: { usedBytes: GB, limitBytes: 50 * GB, ownStorage: true } });
    const own = screen().getByLabelText("Plano e cobrança");
    expect(own.textContent).toContain("PessoasSem limite");
    expect(own.textContent).toContain("ArquivosNo seu próprio bucket, sem limite nosso");
    expect(within(own).queryAllByRole("meter")).toHaveLength(0);
    cleanup();
    // Against the plan's top, with the seats paid for under it; no such line when they are the same.
    await go("settings/billing", { members: { used: 12, limit: 12, max: 15, canAddSeats: true } });
    const top = screen().getByLabelText("Plano e cobrança");
    expect(top.textContent).toContain("Pessoas12 de 15");
    expect(top.textContent).toContain("12 vagas pagas");
    cleanup();
    await go("settings/billing", { members: { used: 1, limit: 1, max: 1, canAddSeats: false } });
    const one = screen().getByLabelText("Plano e cobrança");
    expect(one.textContent).toContain("Pessoas1 de 1");
    expect(one.textContent).not.toContain("paga");
  });

  test("a full workspace: inviting waits, and owners see the plan's options; without a billing service, who to ask", async () => {
    const { billingLinks, left } = await go("settings/members", { members: { used: 2, limit: 2 } });
    const invite = await inviteDialog();
    expect(invite().textContent).toContain("Este workspace está com 2 de 2 pessoas.");
    expect(invite().textContent).toContain("Para chamar mais gente, veja as opções do plano do agentes.chat.");
    expect(sendButton(invite()).hasAttribute("disabled")).toBe(true);
    await click(within(invite()).getByRole("button", { name: "Abrir plano e cobrança" }));
    await settle(4);
    expect(billingLinks()).toEqual(["invite_full"]);
    expect(left).toEqual([`${BILLING}/link?t=invite_full`]);
    cleanup();

    await go("settings/members", { members: { used: 1, limit: 1 } }, false);
    const plain = await inviteDialog();
    expect(plain().textContent).toContain("No plano do agentes.chat deste workspace cabe 1 pessoa.");
    expect(plain().textContent).toContain("Peça a quem administra o workspace para abrir espaço.");
    expect(within(plain()).queryByRole("button", { name: "Abrir plano e cobrança" })).toBeNull();
    cleanup();

    // Below the plan's top: a seat to add; at it, another plan.
    await go("settings/members", { members: { used: 12, limit: 12, max: 15, canAddSeats: true } });
    expect((await inviteDialog())().textContent).toContain(
      "Todas as vagas pagas estão ocupadas. Adicione uma vaga em Plano e cobrança.",
    );
    cleanup();
    await go("settings/members", { members: { used: 15, limit: 15, max: 15, canAddSeats: false } });
    expect((await inviteDialog())().textContent).toContain(
      "O plano chegou ao máximo de pessoas. Mude de plano em Plano e cobrança.",
    );
    cleanup();
    // Someone else pays: only they add seats, so an admin who doesn't pay asks them, by name when it is shown.
    const ana = { you: false, name: "Ana" };
    await go("settings/members", { members: { used: 12, limit: 12, max: 15, canAddSeats: true, payer: ana } });
    expect((await inviteDialog())().textContent).toContain(
      "Peça a Ana, que paga este workspace, para adicionar uma vaga.",
    );
    cleanup();
    const unseen = { you: false, name: null };
    await go("settings/members", { members: { used: 12, limit: 12, max: 15, canAddSeats: true, payer: unseen } });
    expect((await inviteDialog())().textContent).toContain("Peça a quem paga este workspace para adicionar uma vaga.");
    cleanup();
    const you = { you: true, name: null };
    await go("settings/members", { members: { used: 12, limit: 12, max: 15, canAddSeats: true, payer: you } });
    expect((await inviteDialog())().textContent).toContain("Adicione uma vaga em Plano e cobrança.");
    cleanup();

    await go("settings/members", { members: { used: 2, limit: 3 } });
    const room = await inviteDialog();
    expect(room().textContent).not.toContain("Este workspace está com");
    expect(sendButton(room()).hasAttribute("disabled")).toBe(false);
  });

  test("a new plan opens a full workspace by itself: inviting is back once the limits change, with no reload", async () => {
    const { state, sockets } = await go("settings/members", { members: { used: 1, limit: 1 } });
    const invite = await inviteDialog();
    expect(invite().textContent).toContain("No plano do agentes.chat deste workspace cabe 1 pessoa.");
    expect(sendButton(invite()).hasAttribute("disabled")).toBe(true);
    const socket = sockets.last();
    await act(async () => socket.open());
    state.limits = limits({ members: { used: 1, limit: 10 } });
    await act(async () => socket.push({ type: "event", scope: "org", event: { type: "org.limits", orgId: ORG_ID } }));
    await settle(6);
    expect(invite().textContent).not.toContain("cabe 1 pessoa");
    expect(sendButton(invite()).hasAttribute("disabled")).toBe(false);
  });

  test("a new plan while this tab was away: the reconnect asks for the limits again, and inviting is back", async () => {
    const { state, sockets } = await go("settings/members", { members: { used: 1, limit: 1 } });
    const invite = await inviteDialog();
    expect(sendButton(invite()).hasAttribute("disabled")).toBe(true);
    await act(async () => sockets.last().open());
    // The socket drops; meanwhile the plan changes, and its `org.limits` never reaches this tab.
    await act(async () => sockets.last().drop());
    state.limits = limits({ members: { used: 1, limit: 10 } });
    await act(() => new Promise((r) => setTimeout(r, 650)));
    await act(async () => sockets.last().open());
    await settle(6);
    expect(invite().textContent).not.toContain("cabe 1 pessoa");
    expect(sendButton(invite()).hasAttribute("disabled")).toBe(false);
  });

  test("back from the billing service: the plan lands in core before this page's socket opens, and its first open asks again", async () => {
    const { state, sockets } = await go("settings/members", { members: { used: 1, limit: 1 } });
    const invite = await inviteDialog();
    expect(sendButton(invite()).hasAttribute("disabled")).toBe(true);
    // Read, then the plan changes before the socket opens: its `org.limits` went out to no one.
    state.limits = limits({ members: { used: 1, limit: 10 } });
    await act(async () => sockets.last().open());
    await settle(6);
    expect(invite().textContent).not.toContain("cabe 1 pessoa");
    expect(sendButton(invite()).hasAttribute("disabled")).toBe(false);
  });

  test("Armazenamento: the meter, near the limit with the plan's options; on its own bucket, no limit from us", async () => {
    await go("settings/storage", { storage: { usedBytes: 10 * GB, limitBytes: 50 * GB, ownStorage: false } });
    const quiet = screen().getByRole("region", { name: "Armazenamento" });
    expect(quiet.textContent).toContain("Vocês usaram 10 GB de 50 GB.");
    expect(within(quiet).queryByRole("button", { name: "Ver opções" })).toBeNull();
    cleanup();

    const { billingLinks } = await go("settings/storage", {
      storage: { usedBytes: 45 * GB, limitBytes: 50 * GB, ownStorage: false },
    });
    const near = screen().getByRole("region", { name: "Armazenamento" });
    expect(near.textContent).toContain(
      "Vocês usaram 45 GB de 50 GB. Os envios pausam no limite, e nada é apagado.Mude o plano do agentes.chat",
    );
    await click(within(near).getByRole("button", { name: "Ver opções" }));
    await settle(4);
    expect(billingLinks()).toEqual(["storage"]);
    cleanup();

    await go("settings/storage", { storage: { usedBytes: 50 * GB, limitBytes: 50 * GB, ownStorage: true } });
    const own = screen().getByRole("region", { name: "Armazenamento" });
    expect(own.textContent).toContain("No seu próprio bucket, sem limite nosso");
    expect(within(own).queryByRole("meter")).toBeNull();
  });

  test("an upload refused at a limit says so; at the storage limit owners get the plan's options", async () => {
    const { api, billingLinks, router } = await go("drive", {});
    let refusal = new ApiError(409, "storage.full", "The workspace's file storage is full", {
      usedBytes: 50 * GB,
      limitBytes: 50 * GB,
    });
    api.artifacts.upload = async () => {
      throw refusal;
    };
    const send = async () => {
      const file = new File([new Uint8Array([1, 2, 3])], "notas.txt", { type: "text/plain" });
      const input = document.querySelector("input[data-upload-input]") as HTMLInputElement;
      await act(async () => fireEvent.change(input, { target: { files: [file] } }));
      await settle(6);
    };
    await send();
    const toast = screen().getByRole("alert");
    expect(toast.textContent).toContain("Os envios pausaram em 50 GB. Nada foi apagado.");
    expect(toast.textContent).toContain("Mude o plano do agentes.chat");
    await click(within(toast).getByRole("button", { name: "Ver opções" }));
    await settle(4);
    expect(billingLinks()).toEqual(["upload_full"]);

    refusal = new ApiError(409, "storage.daily_full", "Today's uploads reached 10 GB", { limitBytes: 10 * GB });
    await send();
    expect(document.body.textContent).toContain(
      "Os envios de hoje chegaram a 10 GB. Dá para enviar de novo em algumas horas.",
    );
    // Its own bucket is the other way to room: the toast's second button opens where it is connected.
    refusal = new ApiError(409, "storage.full", "The workspace's file storage is full", {
      usedBytes: 50 * GB,
      limitBytes: 50 * GB,
    });
    await send();
    const again = screen().getAllByRole("alert").at(-1) as HTMLElement;
    expect(again.textContent).not.toContain("Configurações");
    await click(within(again).getByRole("button", { name: "Conectar um bucket" }));
    await settle(4);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/storage`);
  });

  test("an invitation to a full workspace: the person invited reads whom to tell", async () => {
    const state = seedState({ previews: { full: { orgName: "Acme", email: "walter@acme.com.br", role: "member" } } });
    const api = createFakeApi(state);
    api.orgs.acceptInvitation = async () => {
      throw new ApiError(409, "org.members_full", "This workspace is full", { members: 2, limit: 2 });
    };
    await renderApp("/invite/full", { api });
    await settle(4);
    await click(screen().getByRole("button", { name: "Entrar na Acme" }));
    await settle(4);
    expect(screen().getByRole("alert").textContent).toBe(
      "Todas as vagas deste workspace estão ocupadas agora. Peça a quem convidou você para abrir uma vaga.",
    );
  });
});
