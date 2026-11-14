import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import type {
  ApiClient,
  InvitationPreview,
  JoinRequest,
  JoinStatus,
  Member,
  NotificationLatest,
  OrgRole,
} from "@agenteschat/client";
import { ApiError, keys } from "@agenteschat/client";
import { errorText } from "@agenteschat/client/lib/errors";
import { icons } from "@agenteschat/ui";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { createI18n } from "@/i18n";
import { ADA_ID, ADMIN_ROLE_ID, ATLAS_ID, createFakeApi, ORG_ID, seedRoles, seedState } from "./fake-api";
import { createFakeAuth } from "./fake-auth";
import { notification } from "./fakes/notifications";
import { hintOf } from "./hint";
import { renderApp, screen, settle } from "./render";

afterEach(() => {
  setSystemTime();
  cleanup();
});

const click = (el: Element) => act(async () => fireEvent.click(el));
const type = (el: Element, value: string) => act(async () => fireEvent.change(el, { target: { value } }));
const button = (name: string | RegExp) => screen().getByRole("button", { name });
const heading = () => screen().getByRole("heading", { level: 1 }).textContent;
const text = () => document.body.textContent ?? "";

const LINK: InvitationPreview = {
  orgName: "Acme",
  email: "",
  role: "member",
  kind: "link",
  invitedBy: "Marina Alves",
  agents: [
    { id: ADA_ID, name: "Ada", appearance: { color: "amber", eyes: "dots", accessory: "beanie" } },
    { id: ATLAS_ID, name: "Atlas", appearance: null },
  ],
};
const you = (patch: Partial<JoinStatus> = {}): JoinStatus => ({
  member: false,
  email: "walter@acme.com.br",
  request: null,
  ...patch,
});
type Fake = ReturnType<typeof seedState>;
type Claim = ApiClient["invites"]["claim"];
/** The key the fake's ask answers when it carries a password, and where the page keeps it (ADR 0090). */
const KEY = "00000000-0000-4000-8000-000000000001.page-secret";
const ASKED = "agentes.join.asked.lnk";

/**
 * The link's page, signed out (`me: null`) or as the fake's Walter (confirmed unless `unconfirmed`). What this tab
 * asked before is forgotten, unless `reload` (the page opened again in the same tab).
 */
async function openLink(
  preview: InvitationPreview,
  options: {
    signedIn?: boolean;
    unconfirmed?: boolean;
    askError?: ApiError;
    sendCodeError?: ApiError;
    emails?: boolean;
    claims?: Fake["claims"];
    /** In place of the fake's `invites.claim`, given it: a server that fails for a moment, or refuses the key. */
    claim?: (fake: Claim) => Claim;
    reload?: boolean;
    auth?: (state: Fake) => ReturnType<typeof createFakeAuth>["auth"];
  } = {},
) {
  if (!options.reload) sessionStorage.clear();
  const state = seedState({
    previews: { lnk: preview },
    askError: options.askError,
    sendCodeError: options.sendCodeError,
    authConfig: { passwordReset: options.emails ?? true },
    claims: options.claims,
  });
  if (!options.signedIn) state.me = null;
  else if (state.me) state.me.user.emailVerified = !options.unconfirmed;
  const api = createFakeApi(state);
  if (options.claim) api.invites.claim = options.claim(api.invites.claim);
  const r = await renderApp("/invite/lnk", { api, auth: options.auth?.(state) });
  await settle(4);
  return { ...r, state };
}

const lead = () => document.querySelector(".auth__lead")?.textContent ?? null;
/** The link's progress, as a screen reader hears it. */
const steps = () => document.querySelector(".invite__steps .ac-visually-hidden")?.textContent;
const next = () => button(/^Continuar$/);
const codeField = () => screen().queryByLabelText("Código do e-mail") as HTMLInputElement | null;
const sends = (state: Fake) => state.calls.filter((c) => c.method === "invites.sendCode");

/** Signed out where email goes out: the email, its code, a name and a password, then Ask with no note. */
async function askThrough() {
  await type(screen().getByLabelText("Seu e-mail"), "ana@acme.com");
  await click(next());
  await settle(4);
  await type(codeField() as HTMLInputElement, "123456");
  await settle(4);
  await type(screen().getByLabelText("Seu nome"), "Ana Souza");
  await click(next());
  await type(screen().getByLabelText("Crie uma senha"), "senha-longa");
  await click(next());
  await click(button("Pedir para entrar"));
  await settle(4);
}

describe("an invitation link asks to join", () => {
  test("signed out where email goes out: one question per screen, the code on its own, and the ask carries them all", async () => {
    const { state } = await openLink(LINK, { claims: [{ status: "pending" }] });
    // The workspace above the host: who shared the link, and the faces and names of who works there.
    const org = document.querySelector(".invite__org");
    expect(org?.querySelector(".invite__org-name")?.textContent).toBe("Acme");
    expect(org?.textContent).toContain("Convite de Marina Alves");
    expect(org?.textContent).toContain("Ada e Atlas trabalham lá");
    expect(org?.querySelectorAll(".invite__faces .ac-avatar")).toHaveLength(2);
    // The host is the workspace's first agent, as it looks there.
    expect(document.querySelector(".auth__ask .ac-avatar")?.getAttribute("data-accessory")).toBe("beanie");
    expect(heading()).toBe("Oi. Este é o convite da Acme.");
    expect(lead()).toBe("Qual é o seu e-mail? Um admin aprova cada pessoa nova.");
    expect(steps()).toBe("Passo 1 de 5");
    const signIn = () => screen().getByRole("link", { name: "Já tem conta? Entrar" }).getAttribute("href");
    expect(signIn()).toBe("/login?redirect=%2Finvite%2Flnk");
    expect(next().hasAttribute("disabled")).toBe(true);
    await type(screen().getByLabelText("Seu e-mail"), "ana@gmial.com");
    // The code goes to that address: a likely typo is offered first.
    await click(button("Você quis dizer ana@gmail.com?"));
    // Signing in instead takes the address typed here along.
    expect(signIn()).toBe("/login?redirect=%2Finvite%2Flnk&email=ana%40gmail.com");
    await click(next());
    await settle(4);
    expect(sends(state).map((c) => c.args)).toEqual([["lnk", { email: "ana@gmail.com" }]]);

    // The code, on a screen of its own: focused, counting down to Resend, with the webmail at hand.
    expect(heading()).toBe("Mandei um código para ana@gmail.com.");
    expect(lead()).toBe("Digite os 6 números. Ele vale por 10 minutos.");
    expect(steps()).toBe("Passo 2 de 5");
    const code = codeField() as HTMLInputElement;
    expect(document.activeElement === code).toBe(true);
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
    expect(text()).toMatch(/Reenviar em \d+ segundos/);
    expect(screen().getByRole("link", { name: "Abrir o Gmail" }).getAttribute("href")).toBe("https://mail.google.com");

    // A wrong code: said under the field, which empties for another try.
    await type(code, "000000");
    await settle(4);
    expect(screen().getByRole("alert").textContent).toBe("Código errado. Tente de novo.");
    expect(code.value).toBe("");
    expect(document.activeElement === code).toBe(true);

    // The sixth digit checks at once; spaces and dashes don't count.
    await type(code, "123 45");
    expect(code.value).toBe("12345");
    expect(state.calls.filter((c) => c.method === "invites.checkCode")).toHaveLength(1);
    await type(code, "123-456");
    await settle(4);
    expect(state.calls.filter((c) => c.method === "invites.checkCode").at(-1)?.args).toEqual([
      "lnk",
      { email: "ana@gmail.com", code: "123456" },
    ]);

    // Then a name, a password and a note, each on its screen.
    expect(heading()).toBe("E-mail confirmado. Prazer.");
    expect(lead()).toBe("Como o time te chama?");
    expect(document.querySelector(".auth__who--ok")?.textContent).toBe("ana@gmail.com");
    await type(screen().getByLabelText("Seu nome"), "  Ana Souza ");
    await click(next());
    expect(heading()).toBe("Boa, Ana. Agora uma senha.");
    expect(lead()).toBe("É com ela que você entra quando aprovarem.");
    expect(steps()).toBe("Passo 4 de 5");
    await type(screen().getByLabelText("Crie uma senha"), "curta");
    expect(next().hasAttribute("disabled")).toBe(true);
    await type(screen().getByLabelText("Crie uma senha"), "senha-longa");
    await click(next());
    expect(heading()).toBe("Quer dizer algo para quem aprova?");
    const note = screen().getByLabelText("Recado");
    expect(note.getAttribute("placeholder")).toBe("Sou do financeiro. A Ana me passou o link.");
    await type(note, "Designer nova");
    await click(button("Pedir para entrar"));
    await settle(4);
    expect(state.calls.find((c) => c.method === "invites.ask")?.args).toEqual([
      "lnk",
      { name: "Ana Souza", email: "ana@gmail.com", note: "Designer nova", code: "123456", password: "senha-longa" },
    ]);

    // Asked: no account yet, and the page waits for an admin, checking at once with the key the ask answered.
    expect(heading()).toBe("Pronto. Seu pedido chegou na Acme.");
    expect(lead()).toBe("Você entra assim que um admin aprovar. Pode fechar esta página: aviso em seu e-mail.");
    expect(text()).toContain("Esperando um admin da Acme");
    expect(text()).toContain("Pedido de Ana Souza · ana@gmail.com");
    expect(text()).toContain("Sua conta só é criada quando aprovarem. Se recusarem, nada fica guardado.");
    expect(state.calls.filter((c) => c.method === "invites.claim").map((c) => c.args)).toEqual([["lnk", KEY]]);
  });

  test("a password equal to the name asks nothing: back on the name with the line, the password cleared", async () => {
    const { state } = await openLink(LINK);
    await type(screen().getByLabelText("Seu e-mail"), "ana@acme.com");
    await click(next());
    await settle(4);
    await type(codeField() as HTMLInputElement, "123456");
    await settle(4);
    await type(screen().getByLabelText("Seu nome"), "Fake#Pass1x");
    expect(screen().getByRole("status").textContent).toBe("Isso parece uma senha. Aqui vai o seu nome.");
    await click(next());
    await type(screen().getByLabelText("Crie uma senha"), "Fake#Pass1x ");
    await click(next());
    expect(lead()).toBe("Como o time te chama?");
    expect(screen().getByRole("alert").textContent).toBe("Esse é o seu nome? É igual à senha que você digitou.");
    await type(screen().getByLabelText("Seu nome"), "Ana Souza");
    await click(next());
    expect((screen().getByLabelText("Crie uma senha") as HTMLInputElement).value).toBe("");
    expect(state.calls.some((c) => c.method === "invites.ask")).toBe(false);
  });

  test("the wait survives a reload; approved, the page signs in with its one-time sign-in and opens the workspace", async () => {
    await openLink(LINK, { claims: [{ status: "pending" }] });
    await askThrough();
    expect(heading()).toBe("Pronto. Seu pedido chegou na Acme.");
    expect(JSON.parse(sessionStorage.getItem(ASKED) ?? "{}")).toEqual({
      key: KEY,
      name: "Ana Souza",
      email: "ana@acme.com",
    });
    cleanup();

    // Opened again in this tab: still waiting, with the same key. Then an admin approves.
    const { auth, calls } = createFakeAuth();
    const { state, services, router } = await openLink(LINK, {
      reload: true,
      claims: [{ status: "pending" }, { status: "in", orgId: ORG_ID, signIn: "one-time-token" }],
      auth: (fake) => {
        const once = auth.signInOneTime;
        auth.signInOneTime = async (token) => {
          // The session of the account the approval made, now in the workspace.
          fake.me = seedState().me;
          return once(token);
        };
        return auth;
      },
    });
    expect(heading()).toBe("Pronto. Seu pedido chegou na Acme.");
    expect(state.calls.filter((c) => c.method === "invites.claim").map((c) => c.args)).toEqual([["lnk", KEY]]);
    await act(() => services.queryClient.invalidateQueries());
    await settle(4);
    // "Aprovado" for a moment, then the workspace.
    expect(heading()).toBe("Aprovado. Você entrou na Acme.");
    expect(text()).toContain("Entrando na Acme");
    expect(sessionStorage.getItem(ASKED)).toBeNull();
    await act(() => new Promise((r) => setTimeout(r, 1300)));
    await settle(10);
    expect(calls.filter((c) => c.method === "signInOneTime").map((c) => c.args)).toEqual([["one-time-token"]]);
    expect(router.state.location.pathname.startsWith(`/org/${ORG_ID}`)).toBe(true);
  });

  test("an admin's answer while the page waits: turned down with their note, or a request that ended", async () => {
    await openLink(LINK, { claims: [{ status: "denied", reason: "Só a <i>equipe</i> do estúdio" }] });
    await askThrough();
    expect(heading()).toBe("Seu pedido não foi aprovado");
    // As in the email: the label in bold, their words in quotes, as typed.
    const note = document.querySelector(".invite__reason");
    expect(note?.textContent).toBe("Recado: “Só a <i>equipe</i> do estúdio”");
    expect(note?.querySelector("b")?.textContent).toBe("Recado:");
    expect(note?.querySelector("i")).toBeNull();
    expect(lead()).toBe("Se acha que foi engano, peça a alguém da Acme para convidar você.");
    // The last word: a reload doesn't wait anymore.
    expect(sessionStorage.getItem(ASKED)).toBeNull();
    cleanup();

    // Run out, its link turned off, or approved for an account that was already there: sign in as always.
    for (const claims of [[{ status: "closed" as const }], []]) {
      const { router } = await openLink(LINK, { claims });
      await askThrough();
      expect(heading()).toBe("Seu pedido terminou.");
      expect(lead()).toBe("Se foi aprovado, entre com sua conta.");
      await click(button("Entrar"));
      await settle(4);
      expect(router.state.location.pathname).toBe("/login");
      expect(router.state.location.search).toEqual({ redirect: "/invite/lnk", email: "ana@acme.com" });
      cleanup();
    }
  });

  test("checks that fail for a moment keep it waiting, however many; a refused key ends it", async () => {
    // What each check meets before the fake answers, in turn: an error, or nothing (the fake's own answer).
    let meets: (Error | undefined)[] = [];
    const failing =
      (fake: Claim): Claim =>
      async (token, key) => {
        const error = meets.shift();
        if (error) throw error;
        return fake(token, key);
      };
    const offline = () => new TypeError("Failed to fetch");
    const { services } = await openLink(LINK, { claims: [{ status: "pending" }], claim: failing });
    await askThrough();
    expect(heading()).toBe("Pronto. Seu pedido chegou na Acme.");
    const check = async () => {
      await act(() => services.queryClient.invalidateQueries());
      await settle(4);
    };
    // No connection, the server restarting, too many checks from here: still waiting, the key kept.
    meets = [
      offline(),
      new ApiError(503, "http_503", "Service Unavailable"),
      undefined,
      offline(),
      new ApiError(429, "rate_limited", "Too many requests from here."),
    ];
    for (let i = 0; i < 5; i++) await check();
    expect(heading()).toBe("Pronto. Seu pedido chegou na Acme.");
    expect(sessionStorage.getItem(ASKED)).not.toBeNull();
    // A deploy's minute of failures in a row: still waiting, the key kept for when the server is back.
    meets = [offline(), new ApiError(502, "http_502", "Bad Gateway"), offline(), offline()];
    for (let i = 0; i < 4; i++) await check();
    expect(heading()).toBe("Pronto. Seu pedido chegou na Acme.");
    expect(sessionStorage.getItem(ASKED)).not.toBeNull();
    cleanup();

    // A key the server can't read or no longer knows: ended at the first check, opened again in this tab.
    for (const refusal of [
      new ApiError(400, "validation_error", "Invalid key"),
      new ApiError(404, "not_found", "Nothing waits for this page"),
    ]) {
      meets = [refusal];
      sessionStorage.setItem(ASKED, JSON.stringify({ key: KEY, name: "Ana Souza", email: "ana@acme.com" }));
      await openLink(LINK, { reload: true, claims: [{ status: "pending" }], claim: failing });
      expect(heading()).toBe("Seu pedido terminou.");
      expect(sessionStorage.getItem(ASKED)).toBeNull();
      cleanup();
    }
  });

  test("approved, but the one-time sign-in doesn't go through: signing in by hand, with the address chosen", async () => {
    const { router } = await openLink(LINK, {
      claims: [{ status: "in", orgId: ORG_ID, signIn: "spent" }],
      auth: () => createFakeAuth({ oneTime: { ok: false, status: 401, message: "Invalid token" } }).auth,
    });
    await askThrough();
    expect(heading()).toBe("Aprovado. Você entrou na Acme.");
    await act(() => new Promise((r) => setTimeout(r, 1300)));
    await settle(4);
    expect(heading()).toBe("Aprovado. Agora é só entrar.");
    expect(lead()).toBe("Use o e-mail e a senha que você escolheu.");
    await click(button("Entrar"));
    await settle(4);
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: `/org/${ORG_ID}`, email: "ana@acme.com" });
  });

  test("Trocar goes back to the email; one code a minute, then Resend; a proven address skips its code", async () => {
    const { state } = await openLink(LINK);
    await type(screen().getByLabelText("Seu e-mail"), "ana@acme.com");
    await click(next());
    await settle(4);
    expect(text()).toContain("Reenviar em 60 segundos");
    // Trocar: the email again. The same address inside the minute goes back to the code already sent.
    await click(button("Trocar"));
    expect(heading()).toBe("Oi. Este é o convite da Acme.");
    expect((screen().getByLabelText("Seu e-mail") as HTMLInputElement).value).toBe("ana@acme.com");
    await click(next());
    await settle(4);
    expect(heading()).toBe("Mandei um código para ana@acme.com.");
    expect(sends(state)).toHaveLength(1);
    // After the minute, another one.
    setSystemTime(new Date(Date.now() + 61_000));
    await type(codeField() as HTMLInputElement, "1");
    await click(button("Reenviar o código"));
    await settle(4);
    expect(sends(state)).toHaveLength(2);
    expect(text()).toMatch(/Reenviar em \d+ segundos/);
    // Proven: going back to the email and on again skips the code.
    await type(codeField() as HTMLInputElement, "123456");
    await settle(4);
    expect(heading()).toBe("E-mail confirmado. Prazer.");
    await click(button("Voltar"));
    await click(next());
    await settle(4);
    expect(heading()).toBe("E-mail confirmado. Prazer.");
    expect(sends(state)).toHaveLength(2);
    cleanup();

    // Opened again inside the minute: the code already sent is the one to type.
    await openLink(LINK, { sendCodeError: new ApiError(429, "join.code_wait", "wait", { retryIn: 42 }) });
    await type(screen().getByLabelText("Seu e-mail"), "ana@acme.com");
    await click(next());
    await settle(4);
    expect(heading()).toBe("Mandei um código para ana@acme.com.");
    expect(text()).toContain("Reenviar em 42 segundos");
    expect(screen().queryByRole("alert")).toBeNull();
  });

  test("every refusal of a code is said in both languages, never in the server's English", () => {
    const codes = ["wrong", "expired", "tries", "limit", "wait", "needed"];
    for (const lng of ["pt-BR", "en"] as const) {
      const { t } = createI18n(lng);
      const said = codes.map((c) => errorText(t, new ApiError(409, `join.code_${c}`, "SERVER WORDS")));
      expect(said.filter((s) => s === "SERVER WORDS" || s.startsWith("errors."))).toEqual([]);
    }
    expect(errorText(createI18n("en").t, new ApiError(400, "join.code_wrong", "x"))).toBe("Wrong code. Try again.");
  });

  test("too many codes for an address: said on its screen, and Continue goes off for it; at the cap, Resend too", async () => {
    const limit = new ApiError(429, "join.code_limit", "limit");
    const { state } = await openLink(LINK, { sendCodeError: limit });
    await type(screen().getByLabelText("Seu e-mail"), "ana@acme.com");
    await click(next());
    await settle(4);
    expect(screen().getByRole("alert").textContent).toBe("Muitos códigos para este e-mail. Tente de novo mais tarde.");
    expect(heading()).toBe("Oi. Este é o convite da Acme.");
    expect(next().hasAttribute("disabled")).toBe(true);

    // Another address gets one. At its cap Resend goes off, and the code already sent stays good.
    state.sendCodeError = undefined;
    await type(screen().getByLabelText("Seu e-mail"), "bia@acme.com");
    expect(next().hasAttribute("disabled")).toBe(false);
    await click(next());
    await settle(4);
    setSystemTime(new Date(Date.now() + 61_000));
    await type(codeField() as HTMLInputElement, "1");
    state.sendCodeError = limit;
    await click(button("Reenviar o código"));
    await settle(4);
    expect(screen().getByRole("alert").textContent).toBe("Muitos códigos para este e-mail. Tente de novo mais tarde.");
    expect(button("Reenviar o código").hasAttribute("disabled")).toBe(true);
    expect(sends(state)).toHaveLength(3);
    await type(codeField() as HTMLInputElement, "123456");
    await settle(4);
    expect(heading()).toBe("E-mail confirmado. Prazer.");
  });

  test("a proof that ran out by the time of asking: back to the email, and Continue sends a new code", async () => {
    const { state } = await openLink(LINK, { askError: new ApiError(409, "join.code_expired", "expired") });
    await askThrough();
    expect(heading()).toBe("Oi. Este é o convite da Acme.");
    expect(screen().getByRole("alert").textContent).toBe("Este código expirou. Peça um novo.");
    state.askError = undefined;
    await click(next());
    await settle(4);
    expect(heading()).toBe("Mandei um código para ana@acme.com.");
    expect(sends(state)).toHaveLength(2);
  });

  test("signed out where no email goes out: the typed form (name, email, note), and where the answer goes", async () => {
    const { state } = await openLink(LINK, { emails: false });
    expect(heading()).toBe("Pedir para entrar na Acme");
    expect(lead()).toBe("Um admin aprova cada pessoa nova.");
    const signIn = () => screen().getByRole("link", { name: "Já tem conta? Entrar" }).getAttribute("href");
    expect(signIn()).toBe("/login?redirect=%2Finvite%2Flnk");
    const send = button("Pedir para entrar");
    expect(send.hasAttribute("disabled")).toBe(true);
    await type(screen().getByLabelText("Seu nome"), "  Ana Souza ");
    await type(screen().getByLabelText("Seu e-mail"), "ana@gmial.com");
    // No line under it: the sent screen names the address.
    expect(screen().getByLabelText("Seu e-mail").hasAttribute("aria-describedby")).toBe(false);
    // The answer goes to that address: a likely typo is offered first.
    await click(button("Você quis dizer ana@gmail.com?"));
    expect(signIn()).toBe("/login?redirect=%2Finvite%2Flnk&email=ana%40gmail.com");
    const note = screen().getByLabelText("Algo que eles devam saber? (opcional)");
    expect(note.getAttribute("placeholder")).toBe("Quem é você e quem te convidou");
    await type(note, "Designer nova da Paula");
    expect(send.hasAttribute("disabled")).toBe(false);
    await click(send);
    await settle(4);
    expect(state.calls.find((c) => c.method === "invites.ask")?.args).toEqual([
      "lnk",
      { name: "Ana Souza", email: "ana@gmail.com", note: "Designer nova da Paula" },
    ]);
    expect(state.calls.some((c) => c.method === "invites.sendCode")).toBe(false);
    expect(heading()).toBe("Pedido enviado");
    expect(lead()).toBe("Avisamos em ana@gmail.com quando um admin responder.");
  });

  test("signed in with an email not confirmed: Continue sends a code to the account's own address, and the ask carries it", async () => {
    const { state } = await openLink({ ...LINK, you: you() }, { signedIn: true, unconfirmed: true });
    expect(heading()).toBe("Pedir para entrar na Acme");
    expect(lead()).toBe("Você vai pedir como walter@acme.com.br. Antes, mando um código para confirmar o e-mail.");
    expect(screen().queryByLabelText("Seu e-mail")).toBeNull();
    await click(next());
    await settle(4);
    expect(sends(state).map((c) => c.args)).toEqual([["lnk", {}]]);
    expect(heading()).toBe("Mandei um código para walter@acme.com.br.");
    // The account's own address: nothing to change it to here.
    expect(screen().queryByRole("button", { name: "Trocar" })).toBeNull();
    await type(codeField() as HTMLInputElement, "123456");
    await settle(4);
    expect(state.calls.find((c) => c.method === "invites.checkCode")?.args).toEqual(["lnk", { code: "123456" }]);
    expect(state.calls.find((c) => c.method === "invites.ask")?.args).toEqual(["lnk", { code: "123456" }]);
    expect(heading()).toBe("Pedido enviado");
  });

  test("signed in: one tap as the account; the page follows the answer", async () => {
    const { state, services } = await openLink({ ...LINK, you: you() }, { signedIn: true });
    expect(heading()).toBe("Pedir para entrar na Acme");
    expect(lead()).toBe("Você vai pedir como walter@acme.com.br.");
    expect(button("Não é você? Sair")).toBeTruthy();
    expect(screen().queryByLabelText("Seu e-mail")).toBeNull();
    await click(button("Pedir para entrar"));
    await settle(4);
    expect(state.calls.find((c) => c.method === "invites.ask")?.args).toEqual(["lnk", {}]);
    expect(heading()).toBe("Pedido enviado");
    expect(lead()).toBe("Você entra assim que um admin aprovar.");
    expect(text()).toContain("Esperando um admin da Acme");

    // Approved: the next check finds them in.
    state.previews = {
      lnk: {
        ...LINK,
        you: you({ member: true, orgId: ORG_ID, request: { status: "approved", reason: null } }),
      },
    };
    await act(() => services.queryClient.invalidateQueries());
    await settle(4);
    expect(heading()).toBe("Você entrou na Acme");
    expect(button("Abrir Acme")).toBeTruthy();
  });

  test("Não é você? Sair: signs out and stays on the link, at its first question", async () => {
    const { auth, calls } = createFakeAuth();
    const { router } = await openLink({ ...LINK, you: you() }, { signedIn: true, auth: () => auth });
    await click(button("Não é você? Sair"));
    await settle(4);
    expect(calls.map((c) => c.method)).toEqual(["signOut"]);
    expect(heading()).toBe("Oi. Este é o convite da Acme.");
    expect(router.state.location.pathname).toBe("/invite/lnk");
  });

  test("the answers, signed in: denied with the admin's note, approved by invitation, already in, a link that no longer works", async () => {
    await openLink(
      { ...LINK, you: you({ request: { status: "denied", reason: "Só a <i>equipe</i> do estúdio" } }) },
      { signedIn: true },
    );
    expect(heading()).toBe("Seu pedido não foi aprovado");
    // As in the email: the label in bold, their words in quotes, as typed.
    const note = document.querySelector(".invite__reason");
    expect(note?.textContent).toBe("Recado: “Só a <i>equipe</i> do estúdio”");
    expect(note?.querySelector("b")?.textContent).toBe("Recado:");
    expect(note?.querySelector("i")).toBeNull();
    expect(lead()).toBe("Se acha que foi engano, peça a alguém da Acme para convidar você.");
    cleanup();

    await openLink({ ...LINK, you: you({ request: { status: "approved", reason: null } }) }, { signedIn: true });
    expect(heading()).toBe("Aprovado");
    expect(lead()).toBe("Para terminar, abra o convite que mandamos para walter@acme.com.br.");
    cleanup();

    // A server that sends no email: the admin hands them the link.
    await openLink(
      { ...LINK, you: you({ request: { status: "approved", reason: null } }) },
      { signedIn: true, emails: false },
    );
    expect(heading()).toBe("Aprovado");
    expect(lead()).toBe("Um admin vai mandar um link para você terminar.");
    cleanup();

    await openLink({ ...LINK, you: you({ member: true, orgId: ORG_ID }) }, { signedIn: true });
    expect(heading()).toBe("Você já está na Acme");
    cleanup();

    await openLink({ ...LINK, invitedBy: null, agents: [], closed: true });
    expect(heading()).toBe("Este link não funciona mais");
    expect(lead()).toBe("Peça um novo a quem mandou.");
    expect(screen().queryByRole("button", { name: "Pedir um novo convite" })).toBeNull();
    expect(screen().queryByLabelText("Seu e-mail")).toBeNull();
    cleanup();

    // A member opening a link that no longer works: they're in, with the way there.
    await openLink(
      { ...LINK, invitedBy: null, agents: [], closed: true, you: you({ member: true, orgId: ORG_ID }) },
      { signedIn: true },
    );
    expect(heading()).toBe("Você já está na Acme");
    expect(button("Abrir Acme")).toBeTruthy();
  });

  test("a link that took all its people says so before anyone asks, and whom to ask for a new one", async () => {
    await openLink({ ...LINK, full: true });
    expect(heading()).toBe("Este link já recebeu todas as pessoas que podia.");
    expect(lead()).toBe("Peça um link novo a Marina.");
    expect(screen().queryByLabelText("Seu e-mail")).toBeNull();
  });

  test("whoever works there is counted: the first four by name, then how many more", async () => {
    const agents = ["Ada", "Atlas", "Lia", "Theo"].map((name, i) => ({ id: `a${i}`, name, appearance: null }));
    await openLink({ ...LINK, agents, moreAgents: 2 });
    expect(text()).toContain("Ada, Atlas, Lia, Theo e mais 2 trabalham lá");
    expect(document.querySelectorAll(".invite__faces .ac-avatar")).toHaveLength(4);
  });

  test("a full workspace or too many asks, from here or through the link: said on the ask, which stays", async () => {
    for (const [error, words] of [
      [new ApiError(409, "join.full", "full"), "Este workspace tem muitos pedidos esperando."],
      [new ApiError(429, "join.rate_limited", "slow down"), "Muitos pedidos daqui. Tente de novo daqui a uma hora."],
      [new ApiError(429, "join.link_busy", "busy"), "Muita gente pediu por este link na última hora."],
    ] as const) {
      await openLink({ ...LINK, you: you() }, { signedIn: true, askError: error });
      await click(button("Pedir para entrar"));
      await settle(4);
      expect(screen().getByRole("alert").textContent).toContain(words);
      expect(heading()).toBe("Pedir para entrar na Acme");
      cleanup();
    }
  });

  test("the workspace's logo, on a link and an invitation alike; the pixel mark without one", async () => {
    const mark = () => document.querySelector<HTMLImageElement>(".invite__org img.org-mark");
    const pixels = () => document.querySelector(".invite__org svg.ac-logo__mark");
    const logo = "/api/app/invitations/lnk/logo/0123456789abcdef.png";
    await openLink({ ...LINK, logo });
    expect(mark()?.getAttribute("src")).toBe(logo);
    expect(pixels()).toBeNull();
    cleanup();

    const invitation: InvitationPreview = { orgName: "Acme", email: "ana@acme.com.br", role: "member", kind: "email" };
    const state = seedState({
      me: null,
      previews: { inv: { ...invitation, logo: "/api/app/invitations/inv/logo/a.png" } },
    });
    await renderApp("/invite/inv", { api: createFakeApi(state) });
    await settle(4);
    expect(mark()?.getAttribute("src")).toBe("/api/app/invitations/inv/logo/a.png");
    expect(pixels()).toBeNull();
    cleanup();

    await openLink(LINK);
    expect(mark()).toBeNull();
    expect(pixels()).not.toBeNull();
  });

  test("at phone width the step bars take the column; wider, they start where the bubble does", async () => {
    const css = (await Bun.file(new URL("../src/pages/invite.css", import.meta.url).pathname).text()).replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const phone = css.split("\n@media (max-width: 560px) {")[1]?.split("\n}")[0] ?? "";
    const rule = (selector: string, sheet = css) =>
      new RegExp(`\\n *${selector.replace(/[.>]/g, "\\$&")} \\{([^}]*)\\}`).exec(sheet)?.[1] ?? "";
    // The host's 56px and the 14px beside it.
    expect(rule(".invite__steps")).toContain("margin: 0 0 18px 70px");
    expect(rule(".invite__steps", phone)).toContain("margin-left: 0");
  });
});

/** Mid-day: a request made 2 h ago is still today, so it reads "há 2 h" and never "ontem". */
const MIDDAY = new Date(2026, 9, 21, 12);

const requests = (): JoinRequest[] => [
  {
    id: "r1",
    name: "Ana Souza",
    email: "ana@estudio.com",
    note: "Designer nova da Paula",
    verified: true,
    confirmed: true,
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    expiresAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
  },
  {
    id: "r2",
    name: "Bruno Lima",
    email: "bruno@lima.dev",
    note: null,
    verified: false,
    confirmed: false,
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    expiresAt: new Date(Date.now() + 13 * 86_400_000).toISOString(),
  },
];

/** People › Convites (`section`: another of People's tabs, or Members' old address the admins' e-mail names). */
async function members(query = "", patch: Parameters<typeof seedState>[0] = {}, section = "invites") {
  setSystemTime(MIDDAY);
  const state = seedState({ joinRequests: requests(), ...patch });
  const r = await renderApp(`/org/${ORG_ID}/settings/${section}${query}`, { api: createFakeApi(state) });
  await settle(6);
  return { ...r, state };
}
const card = (name: string) => screen().getByRole("group", { name: `${name} pede para entrar` });

/** A member's suggestion (ADR 0090): through no link, nothing proved, from João; named by its address. */
const suggestion = (): JoinRequest => ({
  id: "r3",
  name: "carla.dias",
  email: "carla.dias@estudio.com",
  note: "Freelancer de design, vai ajudar no site novo.",
  verified: false,
  confirmed: false,
  suggestedBy: "João",
  createdAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
});
const stateOf = (row: HTMLElement) => row.querySelector(".members-row__state")?.textContent;
const noteOf = (row: HTMLElement) => row.querySelector(".members-row__note")?.textContent ?? null;

describe("People › Convites › Esperando você", () => {
  test("who asked through the link and whom a member suggested: how and when, the note in a well; approve with roles", async () => {
    setSystemTime(MIDDAY);
    const { state } = await members("", { joinRequests: [...requests(), suggestion()] });
    const section = screen().getByRole("region", { name: "Esperando você" });
    expect(section.querySelector(".ac-grouphead__count")?.textContent).toBe("3");
    const ana = within(section).getByRole("group", { name: "Ana Souza pede para entrar" });
    expect(ana.querySelector(".members-row__name")?.textContent).toBe("Ana Souza");
    expect(ana.textContent).toContain("ana@estudio.com");
    expect(stateOf(ana)).toBe("Pediu pelo link há 2 h");
    // The state's icon on its words' first line, as every icon line.
    expect(ana.querySelector(".members-row__state")?.classList.contains("ac-iconline")).toBe(true);
    // What they wrote, as they wrote it, in a well under the row.
    expect(noteOf(ana)).toBe("“Designer nova da Paula”");
    const chips = (el: HTMLElement) => [...el.querySelectorAll(".ac-chip")].map((c) => c.textContent);
    expect(chips(ana)).toEqual([]);
    // Nobody proved Bruno's address: "Não verificado", the only hint approving can't add him at once.
    const bruno = card("Bruno Lima");
    expect(chips(bruno)).toEqual(["Não verificado"]);
    expect(bruno.querySelector(".members-row__flag > .ac-chip")?.textContent).toBe("Não verificado");
    expect(stateOf(bruno)).toMatch(/^Pediu pelo link em \d+ \S+$/);
    expect(noteOf(bruno)).toBeNull();
    // A member's suggestion says who suggested it, and never "Não verificado": nobody was asked to prove anything.
    const carla = within(section).getByRole("group", { name: "João sugeriu carla.dias" });
    expect(stateOf(carla)).toBe("João sugeriu há 30 min");
    expect(chips(carla)).toEqual([]);
    expect(noteOf(carla)).toBe("“Freelancer de design, vai ajudar no site novo.”");

    const sidebarCount = () => document.querySelector(".sidebar__org-meta")?.textContent;
    expect(sidebarCount()).toBe("2 membros · 2 agentes");
    // Roles to give (ADR 0085), "Membro" with none: a menu that stays open, one switch per role below the approver's.
    const roles = within(ana).getByRole("button", { name: "Cargos para Ana Souza" });
    expect(roles.textContent).toBe("Membro");
    roles.focus();
    await act(async () => fireEvent.keyDown(roles, { key: "Enter" }));
    await click(screen().getByRole("menuitemcheckbox", { name: "Admin" }));
    await act(async () => fireEvent.keyDown(screen().getByRole("menu"), { key: "Escape" }));
    expect(roles.textContent).toContain("Admin");
    await click(within(ana).getByRole("button", { name: "Aprovar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "joinRequests.approve")?.args).toEqual([ORG_ID, "r1", [ADMIN_ROLE_ID]]);
    expect(text()).toContain("Ana Souza entrou.");
    // She counts in the workspace's line too, without a reload.
    expect(sidebarCount()).toBe("3 membros · 2 agentes");

    await click(within(card("Bruno Lima")).getByRole("button", { name: "Aprovar" }));
    await settle(4);
    expect(state.calls.filter((c) => c.method === "joinRequests.approve").at(-1)?.args).toEqual([ORG_ID, "r2", []]);
    expect(text()).toContain("Convite enviado para bruno@lima.dev.");
    // Approving a suggestion emails the person an invitation.
    const suggested = within(section).getByRole("group", { name: "João sugeriu carla.dias" });
    await click(within(suggested).getByRole("button", { name: "Aprovar" }));
    await settle(4);
    expect(state.calls.filter((c) => c.method === "joinRequests.approve").at(-1)?.args).toEqual([ORG_ID, "r3", []]);
    expect(text()).toContain("Convite enviado para carla.dias@estudio.com.");
    expect(screen().queryByRole("region", { name: "Esperando você" })).toBeNull();
  });

  test("on a server without email, approving hands the admin the invitation to send", async () => {
    await members("", {
      approval: { outcome: "invited", url: "http://localhost:3000/invite/tok-r2", emailed: false },
    });
    await click(within(card("Bruno Lima")).getByRole("button", { name: "Aprovar" }));
    await settle(4);
    const dialog = screen().getByRole("dialog", { name: "Mande este link para Bruno Lima" });
    expect(dialog.textContent).toContain("Este servidor não manda e-mail. O link vale por 7 dias.");
    expect((within(dialog).getByRole("textbox") as HTMLInputElement).value).toBe("http://localhost:3000/invite/tok-r2");
  });

  test("someone let in elsewhere (another admin, another tab) shows at once: in the people and the sidebar's count", async () => {
    const { state, sockets, services } = await members("", {}, "members");
    const socket = sockets.last();
    await act(async () => socket.open());
    const agentFetches = () => services.queryClient.getQueryState(keys.agents(ORG_ID))?.dataUpdateCount ?? 0;
    const fetchedBefore = agentFetches();
    const sidebarCount = () => document.querySelector(".sidebar__org-meta")?.textContent;
    expect(sidebarCount()).toBe("2 membros · 2 agentes");
    const joao = state.members[1] as Member;
    state.members.push({ ...joao, userId: "u-carla", name: "Carla Dias", email: "carla@acme.com.br", handle: "carla" });
    await act(async () => socket.push({ type: "event", scope: "org", event: { type: "org.members" } }));
    await settle(6);
    expect(sidebarCount()).toBe("3 membros · 2 agentes");
    expect(text()).toContain("Carla Dias");
    // A role change may let someone talk to an agent or take it away: the agents refetch too.
    expect(agentFetches()).toBeGreaterThan(fetchedBefore);
  });

  test("deny: an optional reason they read in the email; someone else answering first is said", async () => {
    const { state } = await members();
    await click(within(card("Ana Souza")).getByRole("button", { name: "Recusar" }));
    const dialog = screen().getByRole("dialog", { name: "Recusar o pedido de Ana Souza?" });
    expect(dialog.textContent).toContain("Opcional. A pessoa lê no e-mail.");
    await type(within(dialog).getByLabelText("Diga o motivo"), "  Só a equipe do estúdio ");
    await click(within(dialog).getByRole("button", { name: "Recusar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "joinRequests.deny")?.args).toEqual([
      ORG_ID,
      "r1",
      "Só a equipe do estúdio",
    ]);
    expect(text()).toContain("Pedido recusado.");
    expect(screen().queryByRole("group", { name: "Ana Souza pede para entrar" })).toBeNull();

    state.answerError = new ApiError(409, "join.answered", "answered");
    await click(within(card("Bruno Lima")).getByRole("button", { name: "Aprovar" }));
    await settle(4);
    expect(text()).toContain("Alguém já respondeu este pedido.");
  });

  test("deny: the reason is off while it goes, Cancelar stays, and a refusal gives it back with its words", async () => {
    setSystemTime(MIDDAY);
    const api = createFakeApi(seedState({ joinRequests: requests() }));
    let refuse = (_: unknown) => {};
    api.joinRequests.deny = () =>
      new Promise((_, reject) => {
        refuse = reject;
      });
    await renderApp(`/org/${ORG_ID}/settings/invites`, { api });
    await settle(6);
    await click(within(card("Ana Souza")).getByRole("button", { name: "Recusar" }));
    const dialog = screen().getByRole("dialog", { name: "Recusar o pedido de Ana Souza?" });
    const reason = within(dialog).getByLabelText("Diga o motivo") as HTMLTextAreaElement;
    await type(reason, "Só a equipe");
    await click(within(dialog).getByRole("button", { name: "Recusar" }));
    await settle(2);
    expect(reason.closest("fieldset[disabled]")).not.toBeNull();
    expect(reason.value).toBe("Só a equipe");
    expect((within(dialog).getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => refuse(new ApiError(500, "internal", "boom")));
    await settle(4);
    expect(reason.isConnected).toBe(true);
    expect(reason.closest("fieldset[disabled]")).toBeNull();
    expect(reason.value).toBe("Só a equipe");
  });

  test("the email's links, to Members' old address: Convites opens, Deny's dialog, Approve focused, a gone request said", async () => {
    const { router } = await members("?request=r2&do=deny", {}, "members");
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/invites`);
    expect(screen().getByRole("dialog", { name: "Recusar o pedido de Bruno Lima?" })).toBeTruthy();
    cleanup();

    await members("?request=r1&do=approve", {}, "members");
    expect(document.activeElement === within(card("Ana Souza")).getByRole("button", { name: "Aprovar" })).toBe(true);
    cleanup();

    await members("?request=r9&do=approve", {}, "members");
    expect(screen().getByRole("status").textContent).toContain("Alguém já respondeu este pedido, ou ele expirou.");
  });

  test("a request through a link with choices: what it gives, its cargos to start on; a full link waits for more room", async () => {
    setSystemTime(MIDDAY);
    const link = {
      id: "link-sup",
      createdBy: "Marina Alves",
      roleIds: [ADMIN_ROLE_ID],
      channelIds: [],
      agentIds: [ADA_ID],
      full: false,
    };
    const { state } = await members("", {
      joinRequests: [
        { ...(requests()[0] as JoinRequest), link },
        { ...(requests()[1] as JoinRequest), link: { ...link, id: "link-full", full: true } },
      ],
    });
    const ana = card("Ana Souza");
    expect(stateOf(ana)).toBe("Pediu pelo link de Marina Alves há 2 h");
    expect(ana.textContent).toContain("Com o link: Admin · Ada.");
    expect(within(ana).getByRole("button", { name: "Cargos para Ana Souza" }).textContent).toBe("Admin");
    await click(within(ana).getByRole("button", { name: "Aprovar" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "joinRequests.approve")?.args).toEqual([ORG_ID, "r1", [ADMIN_ROLE_ID]]);
    const bruno = card("Bruno Lima");
    expect(bruno.textContent).toContain(
      "O link deste pedido já recebeu todas as pessoas que podia. Para aprovar, aumente o máximo de pessoas do link.",
    );
    expect(within(bruno).getByRole("button", { name: "Aprovar" }).hasAttribute("disabled")).toBe(true);
  });

  test("a link's cargo above yours starts out of the approval, said on the row; while Aprovar runs its cargos wait too", async () => {
    setSystemTime(MIDDAY);
    const [admin, everyone] = seedRoles() as [OrgRole, OrgRole];
    const fin: OrgRole = {
      ...admin,
      id: "role-fin",
      name: "Financeiro",
      icon: "wallet",
      color: "green",
      position: 0,
      permissions: ["approve_actions"],
      hoist: false,
      givable: false,
    };
    const link = {
      id: "link-fin",
      createdBy: "Marina Alves",
      roleIds: [fin.id, ADMIN_ROLE_ID],
      channelIds: [],
      agentIds: [],
      full: false,
    };
    const state = seedState({
      joinRequests: [{ ...(requests()[0] as JoinRequest), link }],
      roles: [fin, { ...admin, position: 1 }, { ...everyone, position: 2 }],
    });
    const api = createFakeApi(state);
    const approve = api.joinRequests.approve;
    let release = () => {};
    api.joinRequests.approve = async (...args) => {
      await new Promise<void>((r) => {
        release = r;
      });
      return approve(...args);
    };
    await renderApp(`/org/${ORG_ID}/settings/invites`, { api });
    await settle(6);
    const ana = card("Ana Souza");
    expect(ana.textContent).toContain("Com o link: Financeiro e Admin.");
    expect(ana.textContent).toContain("Financeiro fica de fora: está acima do seu cargo.");
    const picker = within(ana).getByRole("button", { name: "Cargos para Ana Souza" }) as HTMLButtonElement;
    expect(picker.textContent).toBe("Admin");
    await click(within(ana).getByRole("button", { name: "Aprovar" }));
    await settle(2);
    expect(picker.disabled).toBe(true);
    await act(async () => release());
    await settle(4);
    expect(state.calls.find((c) => c.method === "joinRequests.approve")?.args).toEqual([ORG_ID, "r1", [ADMIN_ROLE_ID]]);
  });
});

test("a name typed with markup reads as typed, in Members and in the inbox", async () => {
  const name = "Ana <strong>CEO</strong><br/>x";
  await members("", { joinRequests: [{ ...(requests()[0] as JoinRequest), name }] });
  const who = card(name).querySelector(".members-row__name");
  expect(who?.textContent).toBe(name);
  expect(who?.children.length).toBe(0);
  cleanup();

  const state = seedState({
    notifications: [
      notification({
        id: "n-join",
        kind: "join_request",
        waiting: true,
        count: 1,
        source: { label: "Acme" },
        latest: { title: name },
      }),
    ],
  });
  await renderApp(`/org/${ORG_ID}/notifications`, { api: createFakeApi(state) });
  await settle(6);
  const notice = document.querySelector('[data-n="n-join"]') as HTMLElement;
  expect(notice.getAttribute("aria-label")).toBe(`${name} pede para entrar, não lida`);
  const headline = notice.querySelector(".nt-what b");
  expect(headline?.textContent).toBe(name);
  expect(headline?.children.length).toBe(0);
});

/** Members' "Convidar pessoas" (the page's own, the first of that name): the workspace's invite dialog (ADR 0090). */
async function openInvite() {
  const [open] = screen().getAllByRole("button", { name: "Convidar pessoas" });
  await click(open as HTMLElement);
  await settle(2);
  return screen().getByRole("dialog", { name: "Convidar para a Acme" });
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

describe("Members › Convidar pessoas", () => {
  test("says no agent answers someone invited now, as the Team step does, while every agent with an AI is only yours", async () => {
    const note = async (audience: "owner" | "everyone") => {
      cleanup();
      const state = seedState({ joinRequests: [] });
      for (const a of state.agents) {
        a.ownerUserId = state.me?.user.id ?? null;
        a.audience = { mode: "owner", userIds: [] };
      }
      const first = state.agents[0];
      if (first) first.audience = { mode: audience, userIds: [] };
      await renderApp(`/org/${ORG_ID}/settings/members`, { api: createFakeApi(state) });
      await settle(6);
      const invite = await openInvite();
      return { invite, line: within(invite).queryByText("Seus agentes só atendem você.")?.closest(".setup-line") };
    };
    const { invite, line } = await note("owner");
    expect(line).toBeTruthy();
    expect(hintOf("Seus agentes só atendem você.", invite).text).toBe(
      "Num plano, você pode deixar cada um atender outras pessoas na página dele.",
    );
    // Before the addresses it's about.
    const to = within(invite).getByLabelText("Para");
    expect((line as Element).compareDocumentPosition(to) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One agent that answers everyone: someone invited gets an answer, so nothing to say.
    expect((await note("everyone")).line).toBeFalsy();
  });

  test("a server that sends no email: Link alone, no E-mail to switch to; one that does: E-mail first, Link beside it", async () => {
    const link = {
      id: "link-1",
      url: "http://localhost:3000/invite/k3J",
      expiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: "Walter",
      waiting: 2,
    };
    await members("", { inviteLinks: [link], authConfig: { passwordReset: false } }, "members");
    let invite = await openInvite();
    await settle(4);
    expect(within(invite).queryByRole("radiogroup", { name: "Como convidar" })).toBeNull();
    expect(within(invite).queryByLabelText("Para")).toBeNull();
    expect((within(invite).getByLabelText("Link") as HTMLInputElement).value).toBe(link.url);
    expect(within(invite).queryByRole("button", { name: /^Convidar/ })).toBeNull();
    expect(within(invite).getByRole("button", { name: "Concluir" })).toBeTruthy();
    cleanup();

    await members(
      "",
      { joinRequests: [], inviteLinks: [link], edition: "selfhost", authConfig: { passwordReset: true } },
      "members",
    );
    invite = await openInvite();
    const how = within(invite).getByRole("radiogroup", { name: "Como convidar" });
    expect(within(how).getByRole("radio", { name: "E-mail" }).getAttribute("aria-checked")).toBe("true");
    expect(within(invite).getByLabelText("Para")).toBeTruthy();
    expect(within(invite).queryByLabelText("Link")).toBeNull();
    await click(within(how).getByRole("radio", { name: "Link" }));
    await settle(4);
    expect((within(invite).getByLabelText("Link") as HTMLInputElement).value).toBe(link.url);
  });
});

describe("People › Convites › the workspace's link", () => {
  test("copy it from the page; it lists with what it gives; Desativar closes its requests; an older one can only go", async () => {
    const until = new Date(Date.now() + 20 * 86_400_000).toISOString();
    const { state } = await members("", {
      joinRequests: [],
      inviteLinks: [
        {
          id: "link-1",
          url: "http://localhost:3000/invite/k3J",
          expiresAt: until,
          createdAt: new Date().toISOString(),
          createdBy: "Walter",
          createdByUserId: "u-walter",
          waiting: 2,
        },
        {
          id: "link-0",
          url: null,
          expiresAt: until,
          createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          createdBy: "João",
          waiting: 0,
        },
      ],
    });
    // The page's own button copies it: the word and its icon both say so.
    const fromPage = await withClipboard(() => click(screen().getByRole("button", { name: "Copiar link de convite" })));
    expect(fromPage).toEqual(["http://localhost:3000/invite/k3J"]);
    const copied = screen().getByRole("button", { name: "Copiado" });
    expect(copied.querySelector(".ac-swap > :not([aria-hidden]) svg path")?.getAttribute("d")).toBe(
      icons.check[0]?.[1].d,
    );
    // An active link was there: none was made.
    expect(state.calls.some((c) => c.method === "invites.createLink")).toBe(false);

    const links = screen().getByRole("region", { name: "Links" });
    const plain = within(links).getByRole("group", { name: "Link Membro" });
    expect(plain.querySelector(".members-row__sub")?.textContent).toBe("#general");
    expect(plain.querySelector(".members-row__state")?.textContent).toMatch(
      /^Ninguém entrou ainda · expira em \d+ dias$/,
    );
    const older = within(links).getByRole("group", { name: "Membro" });
    expect(older.textContent).toMatch(/Link anterior, criado por João .+\. Vale até /);

    const more = within(links).getByRole("button", { name: "Mais ações para o link Membro" });
    more.focus();
    await act(async () => fireEvent.keyDown(more, { key: "Enter" }));
    await click(screen().getByRole("menuitem", { name: "Desativar link" }));
    const dialog = screen().getByRole("dialog", { name: "Desativar o link?" });
    expect(dialog.textContent).toContain(
      "Ninguém mais consegue pedir com ele, e os 2 pedidos feitos por ele fecham também.",
    );
    await click(within(dialog).getByRole("button", { name: "Desativar link" }));
    await settle(4);
    expect(state.calls.find((c) => c.method === "invites.turnOff")?.args).toEqual([ORG_ID, "link-1"]);
    await click(within(screen().getByRole("region", { name: "Links" })).getByRole("button", { name: "Desativar" }));
    await click(
      within(screen().getByRole("dialog", { name: "Desativar o link?" })).getByRole("button", {
        name: "Desativar link",
      }),
    );
    await settle(4);
    expect(state.calls.filter((c) => c.method === "invites.turnOff").at(-1)?.args).toEqual([ORG_ID, "link-0"]);
  });
});

test("the admins' notice: who asks, a Convites chip, and it opens Convites, from Abrir or the row itself", async () => {
  const notice = async () => {
    const state = seedState({
      notifications: [
        notification({
          id: "n-join",
          kind: "join_request",
          waiting: true,
          count: 2,
          source: { label: "Acme" },
          latest: { title: "Bruno Lima", names: ["Ana Souza", "Bruno Lima"] },
        }),
      ],
    });
    const { router } = await renderApp(`/org/${ORG_ID}/notifications`, { api: createFakeApi(state) });
    await settle(6);
    return { router, row: document.querySelector('[data-n="n-join"]') as HTMLElement };
  };
  const { router, row } = await notice();
  // Two people: both by name, the first to ask first, as the notice's face and time are hers.
  expect(row.getAttribute("aria-label")).toBe("Ana Souza e Bruno Lima pedem para entrar, não lida");
  expect(row.textContent).toContain("Ana Souza e Bruno Lima pedem para entrar");
  expect(row.querySelector(".nt-face")?.textContent).toBe("AS");
  expect(row.querySelector(".nt-wr__src")?.textContent).toBe("Convites");
  await click(within(row).getByRole("button", { name: "Abrir" }));
  await settle(6);
  expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/invites`);
  cleanup();

  const again = await notice();
  await click(again.row.querySelector(".nt-what") as HTMLElement);
  await settle(6);
  expect(again.router.state.location.pathname).toBe(`/org/${ORG_ID}/settings/invites`);
});

test("the admins' notice names the first two who asked and counts the rest", async () => {
  const cases: [NotificationLatest, number, string][] = [
    [
      { title: "Carla Dias", names: ["Ana Souza", "Bruno Lima"] },
      3,
      "Ana Souza, Bruno Lima e mais 1 pedem para entrar",
    ],
    // Kept from before the notice held names: the newest one's, and how many more.
    [{ title: "Bruno Lima" }, 2, "Bruno Lima e mais 1 pedem para entrar"],
  ];
  for (const [latest, count, said] of cases) {
    const state = seedState({
      notifications: [
        notification({ id: "n-join", kind: "join_request", waiting: true, count, source: { label: "Acme" }, latest }),
      ],
    });
    await renderApp(`/org/${ORG_ID}/notifications`, { api: createFakeApi(state) });
    await settle(6);
    const notice = document.querySelector('[data-n="n-join"]') as HTMLElement;
    expect(notice.getAttribute("aria-label")).toBe(`${said}, não lida`);
    expect(notice.querySelector(".nt-what")?.textContent).toContain(said);
    cleanup();
  }
});

test("the inviter's notice when someone joins: their face and name, a Members chip; Abrir opens a conversation with them", async () => {
  const accepted = (latest: NotificationLatest) =>
    seedState({
      notifications: [
        notification({
          id: "n-in",
          kind: "invitation_accepted",
          actors: [{ type: "user", id: "u-carla" }],
          source: { label: "Acme" },
          latest,
        }),
      ],
    });
  // Just joined: the members list hasn't caught up yet, so the notice's own name is the one said.
  const { router } = await renderApp(`/org/${ORG_ID}/notifications`, {
    api: createFakeApi(accepted({ title: "Carla <b>Dias</b>" })),
  });
  await settle(6);
  const row = document.querySelector('[data-n="n-in"]') as HTMLElement;
  expect(row.getAttribute("aria-label")).toBe("Carla <b>Dias</b>, não lida");
  expect(row.querySelector(".nt-what")?.textContent).toBe("Carla <b>Dias</b> aceitou seu convite e entrou na Acme");
  // Typed by a person: text, never markup.
  expect(row.querySelector(".nt-what b")?.textContent).toBe("Carla <b>Dias</b>");
  expect(row.querySelector(".nt-what b")?.children.length).toBe(0);
  expect(row.querySelector(".nt-tags .ac-chip")?.textContent).toBe("Membros");
  expect(row.querySelector(".ac-mediarow__face .ac-avatar")).toBeTruthy();
  await click(within(row).getByRole("button", { name: "Abrir" }));
  await settle(6);
  expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/dm/person/u-carla`);
  cleanup();

  // In the members list: the name it has there; the person's initials on their face.
  const state = accepted({ title: "Carla" });
  const carla = { ...(state.members[1] as Member), userId: "u-carla", name: "Carla Dias", email: "carla@acme.com" };
  state.members.push(carla);
  await renderApp(`/org/${ORG_ID}/notifications`, { api: createFakeApi(state) });
  await settle(6);
  const known = document.querySelector('[data-n="n-in"]') as HTMLElement;
  expect(known.querySelector(".nt-what")?.textContent).toBe("Carla Dias aceitou seu convite e entrou na Acme");
  expect(known.querySelector(".ac-mediarow__face .ac-avatar")?.textContent).toBe("CD");
  // No workspace on it: who joined, all the same.
  cleanup();
  await renderApp(`/org/${ORG_ID}/notifications`, {
    api: createFakeApi(
      seedState({
        notifications: [
          notification({
            id: "n-in",
            kind: "invitation_accepted",
            actors: [{ type: "user", id: "u-carla" }],
            latest: { title: "Carla Dias" },
          }),
        ],
      }),
    ),
  });
  await settle(6);
  expect(document.querySelector('[data-n="n-in"] .nt-what')?.textContent).toBe("Carla Dias aceitou seu convite");
});

test("in a personal workspace the inviter's notice names no workspace: its name says no place (ADR 0159)", async () => {
  const state = seedState({
    notifications: [
      notification({
        id: "n-in",
        kind: "invitation_accepted",
        actors: [{ type: "user", id: "u-carla" }],
        source: { label: "Pessoal" },
        latest: { title: "Carla Dias" },
      }),
    ],
  });
  const org = state.me?.organizations[0];
  if (org) org.mode = "personal";
  await renderApp(`/org/${ORG_ID}/notifications`, { api: createFakeApi(state) });
  await settle(6);
  expect(document.querySelector('[data-n="n-in"] .nt-what')?.textContent).toBe("Carla Dias aceitou seu convite");
});
