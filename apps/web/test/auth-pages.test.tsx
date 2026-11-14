import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiError, type InvitationPreview, NetworkError, type SignInOptions } from "@agenteschat/client";
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { createBetterAuthClient } from "@/auth/better-auth";
import { rememberSignIn } from "@/components/SocialButtons";
import { setNavigateAway } from "@/lib/navigate";
import { STORAGE_KEYS, storage } from "@/lib/storage";
import { ADA_ID, createFakeApi, fakeMachinesOf, ORG_ID, seedState } from "./fake-api";
import { createFakeAuth } from "./fake-auth";
import { installTurnstile, removeTurnstile } from "./fake-turnstile";
import { renderApp, screen, settle } from "./render";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const type = (label: string, value: string) =>
  act(async () => fireEvent.change(screen().getByLabelText(label), { target: { value } }));

/** A fake API whose sign-in screen answers `options` for any e-mail (and "forgot password" when `reset`). */
const authApi = (options: SignInOptions, { reset = false, state = seedState({ me: null }) } = {}) => {
  const api = createFakeApi(state);
  api.account.signInOptions = async (input) => {
    state.calls.push({ method: "account.signInOptions", args: [input] });
    return options;
  };
  const config = api.account.authConfig;
  api.account.authConfig = async () => ({ ...(await config()), passwordReset: reset });
  return { api, state };
};
const press = async (name: string | RegExp, rounds = 6) => {
  await act(async () => fireEvent.click(screen().getByRole("button", { name })));
  await settle(rounds);
};
const heading = () => screen().getByRole("heading").textContent;
/** The line under the question, or null where the step has none. */
const lead = () => document.querySelector(".auth__lead")?.textContent ?? null;
const ACCOUNT: SignInOptions = { account: true, password: true, providers: [], canSignUp: false };
const NEW: SignInOptions = { account: false, password: false, providers: [], canSignUp: true };

describe("the sign-in forms when the server doesn't answer", () => {
  const UNREACHABLE = "Sem conexão com o agentes.chat agora. Tente de novo em instantes.";
  const alertText = () => screen().getByRole("alert").textContent;

  test("Continuar with no answer: why, under the field, and Continuar works again", async () => {
    const { api } = authApi(ACCOUNT);
    let fails = true;
    const options = api.account.signInOptions;
    api.account.signInOptions = async (input) => {
      if (fails) throw new NetworkError(new TypeError("Failed to fetch"));
      return options(input);
    };
    await renderApp("/login", { api });
    await type("E-mail", "marina@acme.com.br");
    await press(/^Continuar(?! com)/);
    expect(alertText()).toBe(UNREACHABLE);
    const own = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    try {
      await press(/^Continuar(?! com)/);
      expect(alertText()).toBe("Você está sem internet. Confira a conexão e tente de novo.");
    } finally {
      if (own) Object.defineProperty(navigator, "onLine", own);
      else delete (navigator as { onLine?: boolean }).onLine;
    }
    fails = false;
    await press(/^Continuar(?! com)/);
    expect(heading()).toBe("Bom te ver de novo.");
  });

  test("Entrar whose request got no answer: the line, the button stops spinning and works again", async () => {
    const real = globalThis.fetch;
    let asked = 0;
    globalThis.fetch = (async () => {
      asked++;
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    try {
      const { api } = authApi(ACCOUNT);
      await renderApp("/login", { api, auth: createBetterAuthClient("http://localhost:3000") });
      await type("E-mail", "marina@acme.com.br");
      await press(/^Continuar(?! com)/);
      await type("Senha", "correct horse");
      await press(/^Entrar/);
      expect(alertText()).toBe(UNREACHABLE);
      const button = screen().getByRole("button", { name: /^Entrar/ });
      expect(button.getAttribute("aria-busy")).toBeNull();
      expect(button.hasAttribute("disabled")).toBe(false);
      await press(/^Entrar/);
      expect(asked).toBe(2);
      expect(document.body.textContent).not.toContain("Failed to fetch");
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("Entrar (e-mail primeiro)", () => {
  test("the e-mail has a password: a wrong one frowns and offers a link; the right one enters", async () => {
    const state = seedState({ me: null });
    const signedIn = seedState().me;
    let tries = 0;
    const { auth, calls } = createFakeAuth({ onSignIn: () => (state.me = signedIn) });
    const signIn = auth.signIn;
    auth.signIn = async (input) => {
      if (++tries > 1) return signIn(input);
      calls.push({ method: "signIn", args: [input] });
      return { ok: false, status: 401, message: "Invalid" };
    };
    const { api } = authApi(ACCOUNT, { reset: true, state });
    const { router } = await renderApp(`/login?redirect=/org/${ORG_ID}/drive`, { api, auth });
    expect(heading()).toBe("Oi. Qual é o seu e-mail?");
    // auth-config of the fake: GitHub only.
    expect(screen().queryByRole("button", { name: /Continuar com Google/ })).toBeNull();
    expect(screen().getByRole("button", { name: /Continuar com GitHub/ })).toBeTruthy();
    expect(
      screen()
        .getByRole("button", { name: /^Continuar(?! com)/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    await type("E-mail", "marina@acme.com.br");
    await press(/^Continuar(?! com)/);
    expect(state.calls.find((c) => c.method === "account.signInOptions")?.args).toEqual([
      { email: "marina@acme.com.br" },
    ]);
    expect(heading()).toBe("Bom te ver de novo.");
    expect(screen().getByText("marina@acme.com.br")).toBeTruthy();

    await type("Senha", "senha-errada");
    await press(/^Entrar/);
    expect(heading()).toBe("Hmm, essa senha não bateu.");
    // The field, Entrar and "Esqueci a senha" sit right under it: no line between.
    expect(lead()).toBeNull();
    expect(screen().getByLabelText("Senha").getAttribute("aria-invalid")).toBe("true");
    expect(screen().getByRole("button", { name: "Esqueci a senha" })).toBeTruthy();

    await type("Senha", "correct horse");
    await press(/^Entrar/);
    expect(calls.filter((c) => c.method === "signIn").map((c) => c.args[0])).toEqual([
      { email: "marina@acme.com.br", password: "senha-errada" },
      { email: "marina@acme.com.br", password: "correct horse" },
    ]);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/drive`);
  });

  test("signed in from an email's deep link: back on that page, its query and all", async () => {
    const state = seedState({ me: null });
    const signedIn = seedState().me;
    const { auth } = createFakeAuth({ onSignIn: () => (state.me = signedIn) });
    const { api } = authApi(ACCOUNT, { state });
    const target = `/org/${ORG_ID}/agents/${ADA_ID}?tab=settings&sec=budget`;
    const { router } = await renderApp(`/login?redirect=${encodeURIComponent(target)}`, { api, auth });
    await type("E-mail", "marina@acme.com.br");
    await press(/^Continuar(?! com)/);
    await type("Senha", "correct horse");
    await press(/^Entrar/);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/agents/${ADA_ID}`);
    expect(router.state.location.search).toEqual({ tab: "settings", sec: "budget" });
  });

  test("signed in from the ready email's Connect your AI: Início with Connect an AI open, the computer ready", async () => {
    const state = seedState({
      me: null,
      aiStatus: { any: false, agents: [{ agentId: ADA_ID, state: "no_ai" } as const] },
    });
    for (const a of state.agents) if (a.id === ADA_ID) a.ownerUserId = "u-walter";
    const signedIn = seedState().me;
    const { auth } = createFakeAuth({ onSignIn: () => (state.me = signedIn) });
    const { api } = authApi(ACCOUNT, { state });
    fakeMachinesOf.get(api)?.setSetup({ state: "ready", machineId: "machine_1" });
    const brain = api.agents.brain;
    api.agents.brain = async (orgId, agentId) => ({ ...(await brain(orgId, agentId)), ownSignIn: false });
    const { router } = await renderApp(`/login?redirect=${encodeURIComponent(`/org/${ORG_ID}?connect=ai`)}`, {
      api,
      auth,
    });
    await type("E-mail", "marina@acme.com.br");
    await press(/^Continuar(?! com)/);
    await type("Senha", "correct horse");
    await press(/^Entrar/, 10);
    expect(router.state.location.pathname).toBe(`/org/${ORG_ID}/home`);
    expect(router.state.location.search).toEqual({});
    // Asked for no agent in particular: Connect for the team (ADR 0160, addendum), whose Claude says it's ready.
    const dialog = screen().getByRole("dialog", { name: "Conectar uma IA para o time" });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: /^Claude/ })));
    await settle(4);
    const panel = within(dialog).getByRole("region", { name: "Seu plano do Claude" });
    expect(panel.textContent).toContain("O computador está pronto.");
  });

  test("an account without a password: only the provider it signs in with", async () => {
    const { api } = authApi({ account: true, password: false, providers: ["github"], canSignUp: false });
    const { auth, calls } = createFakeAuth();
    await renderApp("/login", { api, auth });
    await type("E-mail", "marina@acme.com.br");
    await press(/^Continuar(?! com)/);
    expect(heading()).toBe("Você entra com GitHub.");
    expect(screen().queryByLabelText("Senha")).toBeNull();
    await press(/Continuar com GitHub/);
    expect(calls[0]).toEqual({ method: "signInSocial", args: ["github", "/"] });
  });

  test("the way used last is marked on its button's corner: a provider's, or the e-mail's Continuar", async () => {
    rememberSignIn("github");
    try {
      await renderApp("/login", { api: authApi(ACCOUNT).api, auth: createFakeAuth().auth });
      expect(screen().getByRole("button", { name: "Continuar com GitHub", description: "Último usado" })).toBeTruthy();
      expect(
        document.querySelector(".auth-last")?.closest(".auth-last-host")?.querySelector("button")?.textContent,
      ).toBe("Continuar com GitHub");
      cleanup();
      rememberSignIn("email");
      await renderApp("/login", { api: authApi(ACCOUNT).api, auth: createFakeAuth().auth });
      expect(screen().getByRole("button", { name: /^Continuar(?! com)/, description: "Último usado" })).toBeTruthy();
      expect(screen().queryByRole("button", { name: "Continuar com GitHub", description: "Último usado" })).toBeNull();
    } finally {
      storage.remove(STORAGE_KEYS.lastSignIn);
    }
  });

  test("every sign-in says which server it goes to, and Trocar picks another: the Cloud or one's own", async () => {
    const asked: string[] = [];
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (url: string) => {
      asked.push(String(url));
      if (String(url).startsWith("https://agentes.example.com/"))
        return new Response(JSON.stringify({ name: "agentes.chat", api: 1, minApi: 1 }), { status: 200 });
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);
    const went: string[] = [];
    const assign = spyOn(window.location, "assign").mockImplementation((to: string | URL) => {
      went.push(String(to));
    });
    try {
      await renderApp("/login", { api: authApi(ACCOUNT).api, auth: createFakeAuth().auth });
      await settle(4);
      const line = document.querySelector(".auth__place") as HTMLElement;
      expect(line.textContent).toContain("Entrando no agentes.chat Cloud");
      await act(async () => fireEvent.click(within(line).getByRole("button", { name: "Trocar de servidor" })));
      await settle(2);
      const sheet = screen().getByRole("dialog", { name: "Onde fica o seu workspace?" });
      const cloud = within(sheet).getByRole("radio", { name: /agentes\.chat Cloud/ });
      expect(cloud.getAttribute("aria-checked")).toBe("true");
      expect(cloud.textContent).toContain("Recomendado");
      expect(cloud.textContent).toContain("Computador dos agentes sempre ligado");
      // No radio dot: the chosen card's border says it.
      expect(sheet.querySelector(".ac-optrow__dot")).toBeNull();
      await act(async () => fireEvent.click(within(sheet).getByRole("radio", { name: /No seu servidor/ })));
      expect(sheet.textContent).toContain("Os agentes param quando ele desliga");
      expect(sheet.textContent).toContain("Grátis · código aberto");
      // "Ainda não tem um?": a server for a team, or the app on one's own computer.
      await act(async () =>
        fireEvent.click(within(sheet).getByRole("button", { name: "Veja como ter o seu, grátis" })),
      );
      await settle(2);
      const get = screen().getByRole("dialog", { name: "Ter o seu próprio servidor" });
      expect(within(get).getByRole("link", { name: "Baixar o app" }).getAttribute("href")).toBe(
        "https://agentes.chat/download",
      );
      expect(within(get).getByRole("link", { name: "Como funciona" }).getAttribute("href")).toBe(
        "https://agentes.chat/pt/docs/run-on-your-computer",
      );
      expect(within(get).getByRole("link", { name: "Ver o passo a passo" }).getAttribute("href")).toBe(
        "https://agentes.chat/pt/docs/install-on-a-server",
      );
      await act(async () => fireEvent.click(within(get).getByRole("button", { name: "Use o Cloud" })));
      await settle(2);
      expect(
        within(sheet)
          .getByRole("radio", { name: /agentes\.chat Cloud/ })
          .getAttribute("aria-checked"),
      ).toBe("true");
      await act(async () => fireEvent.click(within(sheet).getByRole("radio", { name: /No seu servidor/ })));
      const field = within(sheet).getByLabelText("Endereço do servidor");
      await act(async () => fireEvent.change(field, { target: { value: "not an address" } }));
      await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Conectar" })));
      await settle(2);
      expect(sheet.textContent).toContain("Isso não é um endereço.");
      await act(async () => fireEvent.change(field, { target: { value: "nowhere.example.org" } }));
      await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Conectar" })));
      await settle(4);
      expect(sheet.textContent).toContain("Não achamos o agentes.chat em nowhere.example.org.");
      await act(async () => fireEvent.change(field, { target: { value: "agentes.example.com" } }));
      await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Conectar" })));
      await settle(4);
      expect(went).toEqual(["https://agentes.example.com/login"]);
    } finally {
      fetchSpy.mockRestore();
      assign.mockRestore();
    }
  });

  test("a misspelled webmail domain gets a one-click fix", async () => {
    const { api } = authApi(ACCOUNT);
    await renderApp("/login", { api, auth: createFakeAuth().auth });
    await type("E-mail", "marina@gmial.com");
    await press("Você quis dizer marina@gmail.com?", 1);
    expect((screen().getByLabelText("E-mail") as HTMLInputElement).value).toBe("marina@gmail.com");
  });

  test("forgot password: sends the link in place and opens the webmail", async () => {
    const { api } = authApi(ACCOUNT, { reset: true });
    const { auth, calls } = createFakeAuth();
    await renderApp("/login", { api, auth });
    await type("E-mail", "marina@gmail.com");
    await press(/^Continuar(?! com)/);
    await press("Esqueci a senha", 2);
    expect(heading()).toBe("Te mando um link para criar outra senha.");
    await press(/^Enviar link/);
    expect(calls[0]?.method).toBe("requestPasswordReset");
    expect((calls[0]?.args[0] as { email: string } | undefined)?.email).toBe("marina@gmail.com");
    expect(heading()).toBe("Pronto. Mandei o link para marina@gmail.com.");
    expect(lead()).toBe("Não chegou em 1 minuto? Veja o spam.");
    expect(screen().getByRole("link", { name: "Abrir o Gmail" }).getAttribute("href")).toBe("https://mail.google.com");
  });

  test("without e-mail on the server, 'forgot password' says the way back in, never sends (ADR 0158)", async () => {
    const { api } = authApi(ACCOUNT, { reset: false });
    const { auth, calls } = createFakeAuth();
    await renderApp("/login", { api, auth });
    await type("E-mail", "marina@acme.com.br");
    await press(/^Continuar(?! com)/);
    await press("Esqueci a senha", 2);
    expect(heading()).toBe("Este servidor não manda e-mail.");
    expect(lead()).toContain("Peça a um dono do seu workspace um link de senha nova.");
    expect(calls.some((c) => c.method === "requestPasswordReset")).toBe(false);
    await press("Voltar para a senha", 2);
    expect(heading()).toBe("Bom te ver de novo.");
  });

  test("a blocked account is told so; another refusal in plain words, never the server's English", async () => {
    for (const [signIn, says] of [
      [
        { ok: false, status: 403, message: "This account can't sign in.", code: "ACCOUNT_BLOCKED" },
        "Esta conta não pode entrar.",
      ],
      // A refusal the app has no words for: a plain line in the person's language, not the server's English.
      [
        { ok: false, status: 403, message: "Invalid origin" },
        "Não deu certo. Confira o que preencheu e tente de novo.",
      ],
    ] as const) {
      const { api } = authApi(ACCOUNT);
      await renderApp("/login", { api, auth: createFakeAuth({ signIn }).auth });
      await type("E-mail", "marina@acme.com.br");
      await press(/^Continuar(?! com)/);
      await type("Senha", "correct horse");
      await press(/^Entrar/);
      expect(screen().getByRole("alert").textContent).toContain(says);
      cleanup();
    }
  });

  test("on agentes.chat Cloud a blocked account reads why by the block's kind, and how to contest it", async () => {
    const contest = "Para contestar, escreva para legal@agentes.chat.";
    for (const [block, says] of [
      [
        { kind: "abuse", cloud: true },
        `Esta conta está bloqueada. As nossas verificações a ligaram a uma conta encerrada por abuso (Termos, seção 5). ${contest}`,
      ],
      [
        { kind: "legal", cloud: true },
        "Esta conta está bloqueada enquanto guardamos os dados dela por uma questão legal. Para perguntar sobre isso, escreva para legal@agentes.chat.",
      ],
      [{ kind: "other", cloud: true }, `Esta conta não pode entrar. ${contest}`],
      // A self-hosted server: the line it always had.
      [{}, "Esta conta não pode entrar."],
    ] as const) {
      const signIn = {
        ok: false as const,
        status: 403,
        message: "This account can't sign in.",
        code: "ACCOUNT_BLOCKED",
        ...block,
      };
      const { api } = authApi(ACCOUNT);
      await renderApp("/login", { api, auth: createFakeAuth({ signIn }).auth });
      await type("E-mail", "marina@acme.com.br");
      await press(/^Continuar(?! com)/);
      await type("Senha", "correct horse");
      await press(/^Entrar/);
      expect(screen().getByRole("alert").textContent).toBe(says);
      cleanup();
    }
  });
});

describe("Entrar a caminho de algum lugar: a página diz para onde", () => {
  const LINK: InvitationPreview = {
    orgName: "Acme",
    email: "",
    role: "member",
    kind: "link",
    invitedBy: null,
    agents: [],
  };
  const at = (redirect: string, email?: string) =>
    `/login?${new URLSearchParams({ redirect, ...(email ? { email } : {}) })}`;

  test("from an invitation link's Sign in: its workspace, and the address typed there already filled in", async () => {
    const { api } = authApi(ACCOUNT, { state: seedState({ me: null, previews: { lnk: LINK } }) });
    await renderApp(at("/invite/lnk"), { api, auth: createFakeAuth().auth });
    expect(heading()).toBe("Oi. Qual é o seu e-mail?");
    expect(lead()).toBe("Para pedir para entrar na Acme.");
    cleanup();

    await renderApp(at("/invite/lnk", "marina@acme.com.br"), { api, auth: createFakeAuth().auth });
    await settle(4);
    expect(heading()).toBe("Bom te ver de novo.");
    expect(lead()).toBe("Para pedir para entrar na Acme.");
    expect(screen().getByText("marina@acme.com.br")).toBeTruthy();
  });

  test("an email invitation's: to join; the ready email's Connect your AI and Create an agent: to do that", async () => {
    const { api } = authApi(ACCOUNT, { state: seedState({ me: null }) });
    await renderApp(at("/invite/valid"), { api, auth: createFakeAuth().auth });
    expect(lead()).toBe("Para entrar na Acme.");
    cleanup();

    await renderApp(at(`/org/${ORG_ID}?connect=ai`), { api, auth: createFakeAuth().auth });
    expect(heading()).toBe("Oi. Qual é o seu e-mail?");
    expect(lead()).toBe("Para conectar sua IA.");
    cleanup();

    await renderApp(at(`/org/${ORG_ID}/agents/new`), { api, auth: createFakeAuth().auth });
    expect(heading()).toBe("Oi. Qual é o seu e-mail?");
    expect(lead()).toBe("Para criar um agente.");
    cleanup();

    // An AI app's sign-in (ADR 0119): back to its consent page.
    await renderApp(at("/autorizar?req=0192"), { api, auth: createFakeAuth().auth });
    expect(lead()).toBe("Para conectar um app ao agentes.chat.");
  });

  test("a link that no longer works, an unknown one, or anywhere else: the general line", async () => {
    const { api } = authApi(ACCOUNT, {
      state: seedState({ me: null, previews: { off: { ...LINK, closed: true } } }),
    });
    // The ready email's button to the workspace itself included: it leads nowhere in particular.
    for (const redirect of ["/invite/off", "/invite/nope", `/org/${ORG_ID}/drive`, `/org/${ORG_ID}`]) {
      await renderApp(at(redirect), { api, auth: createFakeAuth().auth });
      expect(lead()).toBe("Vale para entrar ou para criar uma conta.");
      cleanup();
    }
  });
});

describe("Criar conta (e-mail novo)", () => {
  test("name, then a password with live help; creating the account goes to onboarding", async () => {
    const { api } = authApi(NEW);
    const { auth, calls } = createFakeAuth();
    const { router } = await renderApp("/signup", { api, auth });
    expect(heading()).toBe("Vamos criar sua conta. Qual é o seu e-mail de trabalho?");
    expect(lead()).toBeNull();
    await type("E-mail", "walter@acme.com.br");
    await press(/^Continuar(?! com)/);
    expect(heading()).toBe("Prazer. Esse e-mail é novo por aqui.");
    await type("Seu nome", "Walter Souza");
    await press(/^Continuar(?! com)/, 2);
    expect(heading()).toBe("Boa, Walter. Agora uma senha.");
    // What a password needs is said once, under the field, and turns into the count as it's typed.
    expect(lead()).toBeNull();
    expect(screen().getByText("Pelo menos 8 caracteres.")).toBeTruthy();
    await type("Crie uma senha", "curta");
    expect(screen().getByText("Faltam 3 caracteres (mínimo de 8).")).toBeTruthy();
    expect(
      screen()
        .getByRole("button", { name: /Criar conta/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    await type("Crie uma senha", "senha-longa");
    expect(screen().getByText("Senha ok.")).toBeTruthy();
    await press(/Criar conta/);
    expect(calls[0]?.args[0]).toEqual({ name: "Walter Souza", email: "walter@acme.com.br", password: "senha-longa" });
    // This server sends no email, so no confirmation link went anywhere.
    expect(sessionStorage.getItem("agentes.confirmation.sent")).toBeNull();
    // Signed out in the fake, so onboarding sends back to sign-in.
    expect(router.state.location.pathname).toBe("/login");
  });

  test("the first character typed or erased keeps the step in place: no new step, nothing to replay its entrance", async () => {
    const { api } = authApi(NEW);
    await renderApp("/signup", { api, auth: createFakeAuth().auth });
    await type("E-mail", "walter@acme.com.br");
    await press(/^Continuar(?! com)/);
    const step = document.querySelector(".auth__step");
    const field = screen().getByLabelText("Seu nome");
    const button = screen().getByRole("button", { name: /^Continuar(?! com)/ });
    for (const value of ["W", "", "W"]) {
      await type("Seu nome", value);
      expect(document.querySelector(".auth__step")).toBe(step);
      expect(screen().getByLabelText("Seu nome")).toBe(field);
      expect(screen().getByRole("button", { name: /^Continuar(?! com)/ })).toBe(button);
      expect(button.hasAttribute("disabled")).toBe(value === "");
    }
  });

  test("a server that emails: the onboarding learns where the confirmation went; the name isn't spell-checked", async () => {
    const { api } = authApi(NEW, { reset: true });
    const { auth } = createFakeAuth();
    await renderApp("/signup", { api, auth });
    await type("E-mail", "Walter@Acme.com.br");
    await press(/^Continuar(?! com)/);
    expect(screen().getByLabelText("Seu nome").getAttribute("spellcheck")).toBe("false");
    await type("Seu nome", "Walter Souza");
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "senha-longa");
    try {
      await press(/Criar conta/);
      expect(sessionStorage.getItem("agentes.confirmation.sent")).toBe("walter@acme.com.br");
    } finally {
      sessionStorage.clear();
    }
  });

  test("a password typed as the name: a soft hint there, and the same password back on the name, no account", async () => {
    const { api } = authApi(NEW);
    const { auth, calls } = createFakeAuth();
    await renderApp("/signup", { api, auth });
    await type("E-mail", "walter@acme.com.br");
    await press(/^Continuar(?! com)/);
    await type("Seu nome", "Ana 2");
    expect(screen().queryByText("Isso parece uma senha. Aqui vai o seu nome.")).toBeNull();
    await type("Seu nome", "Fake#Pass1");
    expect(screen().getByText("Isso parece uma senha. Aqui vai o seu nome.")).toBeTruthy();
    // Only a hint: Continuar still goes on.
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "Fake#Pass1");
    await press(/Criar conta/);
    expect(calls.some((c) => c.method === "signUp")).toBe(false);
    expect(heading()).toBe("Prazer. Esse e-mail é novo por aqui.");
    expect(screen().getByRole("alert").textContent).toBe("Esse é o seu nome? É igual à senha que você digitou.");
    await type("Seu nome", "Walter Souza");
    await press(/^Continuar(?! com)/, 2);
    // The password went with the mistake: a new one is typed.
    expect(screen().getByLabelText<HTMLInputElement>("Crie uma senha").value).toBe("");
    await type("Crie uma senha", "Fake#Pass1");
    await press(/Criar conta/);
    expect(calls.filter((c) => c.method === "signUp").map((c) => c.args[0])).toEqual([
      { name: "Walter Souza", email: "walter@acme.com.br", password: "Fake#Pass1" },
    ]);
  });

  test("sign-up closed for that e-mail: says so and offers another e-mail", async () => {
    const { api } = authApi({ ...NEW, canSignUp: false });
    await renderApp("/login", { api, auth: createFakeAuth().auth });
    await type("E-mail", "stranger@acme.com.br");
    await press(/^Continuar(?! com)/);
    expect(heading()).toBe("Esse e-mail ainda não tem conta.");
    await press("Usar outro e-mail", 2);
    expect(heading()).toBe("Oi. Qual é o seu e-mail?");
  });

  test("the terms line shows only when the server has both links, and links to them", async () => {
    const terms = "https://example.com/terms";
    await renderApp("/signup", { api: createFakeApi(seedState({ me: null, authConfig: { termsUrl: terms } })) });
    expect(screen().queryByText(/Ao continuar/)).toBeNull();
    cleanup();
    const both = { termsUrl: terms, privacyUrl: "https://example.com/privacy" };
    await renderApp("/signup", { api: createFakeApi(seedState({ me: null, authConfig: both })) });
    expect(screen().getByRole("link", { name: "Termos" }).getAttribute("href")).toBe(terms);
    expect(screen().getByRole("link", { name: "Política de privacidade" }).getAttribute("href")).toBe(
      "https://example.com/privacy",
    );
  });
});

describe("Acesso antecipado (o link do convite)", () => {
  const ACCESS = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v";
  const lookups = (state: ReturnType<typeof seedState>) =>
    state.calls.filter((c) => c.method === "account.signInOptions").map((c) => c.args[0]);

  test("the address filled in and looked up with the link's token; the sign-up and a provider carry it", async () => {
    const { api, state } = authApi(NEW);
    const { auth, calls } = createFakeAuth();
    await renderApp(`/signup?email=ana%40acme.com&access=${ACCESS}`, { api, auth });
    await settle(6);
    expect(lookups(state)).toEqual([{ email: "ana@acme.com", access: ACCESS }]);
    expect(heading()).toBe("Prazer. Esse e-mail é novo por aqui.");
    await type("Seu nome", "Ana Lima");
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "senha-longa");
    await press(/Criar conta/);
    expect(calls[0]?.args[0]).toEqual({
      name: "Ana Lima",
      email: "ana@acme.com",
      password: "senha-longa",
      access: ACCESS,
    });
  });

  test("a provider's sign-up from the link carries its token too", async () => {
    const { api } = authApi(NEW);
    const { auth, calls } = createFakeAuth();
    await renderApp(`/signup?email=ana%40acme.com&access=${ACCESS}`, { api, auth });
    await settle(6);
    await press("Trocar", 2);
    await press(/Continuar com GitHub/);
    expect(calls.at(-1)).toEqual({ method: "signInSocial", args: ["github", "/", ACCESS] });
  });

  test("a token in any other shape is dropped", async () => {
    const { api, state } = authApi(NEW);
    const { auth, calls } = createFakeAuth();
    await renderApp("/signup?email=ana%40acme.com&access=short", { api, auth });
    await settle(6);
    expect(lookups(state)).toEqual([{ email: "ana@acme.com" }]);
    await press("Trocar", 2);
    await press(/Continuar com GitHub/);
    expect(calls.at(-1)).toEqual({ method: "signInSocial", args: ["github", "/"] });
  });

  test("a link for another address says so in place, never as a closed sign-up", async () => {
    const { api } = authApi(NEW);
    const { auth } = createFakeAuth({
      signUp: {
        ok: false,
        status: 403,
        code: "EARLY_ACCESS_OTHER_EMAIL",
        message: "This invitation is for another address. Sign up with the address it was sent to.",
      },
    });
    await renderApp(`/signup?email=bia%40acme.com&access=${ACCESS}`, { api, auth });
    await settle(6);
    await type("Seu nome", "Bia");
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "senha-longa");
    await press(/Criar conta/);
    expect(heading()).toBe("Boa, Bia. Agora uma senha.");
    expect(screen().getByRole("alert").textContent).toBe(
      "Este convite é para outro endereço. Cadastre-se com o endereço que recebeu o convite.",
    );
  });

  test("an expired link: says so, and where to ask for a new one", async () => {
    for (const [supportEmail, says] of [
      ["suporte@agentes.chat", "Peça um novo em suporte@agentes.chat."],
      [null, "Peça um novo a quem convidou você."],
    ] as const) {
      const { api } = authApi({ ...NEW, canSignUp: false, accessExpired: true });
      const config = api.account.authConfig;
      api.account.authConfig = async () => ({ ...(await config()), supportEmail });
      await renderApp(`/signup?email=ana%40acme.com&access=${ACCESS}`, { api, auth: createFakeAuth().auth });
      await settle(6);
      expect([heading(), lead()]).toEqual(["Este convite expirou.", says]);
      expect(screen().getByRole("button", { name: "Usar outro e-mail" })).toBeTruthy();
      cleanup();
    }
  });

  test("a provider's sign-in refused comes back with its reason, in the person's words, whatever its code", async () => {
    const { api } = authApi(NEW);
    await renderApp("/login?error=EARLY_ACCESS_EMAIL_UNVERIFIED&error_description=x", {
      api,
      auth: createFakeAuth().auth,
    });
    expect(screen().getByRole("alert").textContent).toBe(
      "Seu provedor de login não confirmou este endereço. Confirme lá, ou cadastre-se com uma senha.",
    );
    cleanup();
    await renderApp("/login?error=SIGNUP_CLOSED&error_description=x", { api, auth: createFakeAuth().auth });
    expect(screen().getByRole("alert").textContent).toBe(
      "O cadastro está fechado. Peça um convite a quem administra o seu workspace.",
    );
    // Nothing is wrong with a field nobody typed in.
    expect(screen().getByLabelText("E-mail").getAttribute("aria-invalid")).toBeNull();
    // Better Auth's own codes, by what the person can do; any other one too.
    for (const [code, says] of [
      ["access_denied", "O login foi cancelado."],
      ["unable_to_link_account", "Este email já tem uma conta aqui. Entre do jeito que você entrou antes."],
      ["email_not_found", "Essa conta não informou um email confirmado. Tente outro jeito de entrar."],
      ["state_mismatch", "Esse login demorou demais ou já foi usado. Tente de novo."],
      ["server_error", "Algo deu errado do nosso lado. Tente de novo em instantes."],
      ["something_new", "Não deu para entrar. Tente de novo."],
      ["toString", "Não deu para entrar. Tente de novo."],
    ] as const) {
      cleanup();
      await renderApp(`/login?error=${code}`, { api, auth: createFakeAuth().auth });
      expect(screen().getByRole("alert").textContent).toBe(says);
    }
  });

  test("a sign-in that waited for an OAuth callback (under /api/) goes on to it with a full load", async () => {
    const state = seedState({ me: null });
    const signedIn = seedState().me;
    const { auth } = createFakeAuth({ onSignIn: () => (state.me = signedIn) });
    const { api } = authApi(ACCOUNT, { state });
    const callback = "/api/app/github-app/callback?state=s&code=c&installation_id=7";
    const assign = spyOn(window.location, "assign").mockImplementation(() => {});
    try {
      const { router } = await renderApp(`/login?redirect=${encodeURIComponent(callback)}`, { api, auth });
      await type("E-mail", "marina@acme.com.br");
      await press(/^Continuar(?! com)/);
      await type("Senha", "correct horse");
      await press(/^Entrar/);
      expect(assign).toHaveBeenCalledWith(callback);
      expect(router.state.location.pathname).toBe("/login");
    } finally {
      assign.mockRestore();
    }
  });
});

describe("Google para um e-mail com senha não confirmada", () => {
  const BACK = "/login?error=account_not_linked&email=ana%40acme.com";
  const UNCONFIRMED =
    "Este e-mail já tem uma conta com senha que ainda não foi confirmada. Entre com a senha ou crie uma nova pelo e-mail.";

  test("says so with the address filled in, and makes a new password by email from there, never a new confirmation", async () => {
    const { api, state } = authApi(ACCOUNT, { reset: true });
    const { auth, calls } = createFakeAuth();
    await renderApp(BACK, { api, auth });
    await settle(6);
    expect(state.calls.some((c) => c.method === "account.signInOptions")).toBe(false);
    const field = screen().getByLabelText("E-mail") as HTMLInputElement;
    // The address is right: the field isn't marked wrong.
    expect([field.value, field.getAttribute("aria-invalid")]).toEqual(["ana@acme.com", null]);
    expect(screen().getByRole("alert").textContent).toBe(`${UNCONFIRMED}Criar uma senha nova`);

    await press("Criar uma senha nova");
    expect(heading()).toBe("Te mando um link para criar outra senha.");
    // The pressed link is gone with its step: the keyboard lands on the address, which is already filled in.
    const address = screen().getByLabelText("E-mail") as HTMLInputElement;
    expect([address.value, document.activeElement === address]).toEqual(["ana@acme.com", true]);
    expect(screen().queryByRole("alert")).toBeNull();
    await press(/^Enviar link/);
    expect(calls.map((c) => c.method)).toEqual(["requestPasswordReset"]);
    expect((calls[0]?.args[0] as { email: string } | undefined)?.email).toBe("ana@acme.com");
    expect(heading()).toBe("Pronto. Mandei o link para ana@acme.com.");
  });

  test("Continuar asks the password", async () => {
    const { api } = authApi(ACCOUNT, { reset: true });
    await renderApp(BACK, { api, auth: createFakeAuth().auth });
    await settle(6);
    await press(/^Continuar(?! com)/);
    expect(heading()).toBe("Bom te ver de novo.");
    expect(screen().queryByRole("alert")).toBeNull();
  });

  test("a provider that hasn't confirmed its own address is told so, with no new password to make", async () => {
    const { api } = authApi(ACCOUNT, { reset: true });
    await renderApp("/login?error=provider_email_unverified", { api, auth: createFakeAuth().auth });
    await settle(6);
    expect(screen().getByRole("alert").textContent).toBe(
      "Seu provedor de login ainda não confirmou este endereço. Confirme lá, ou entre com o e-mail.",
    );
    expect(screen().queryByRole("button", { name: "Criar uma senha nova" })).toBeNull();
    expect(screen().getByLabelText("E-mail").getAttribute("aria-invalid")).toBeNull();
  });

  test("on a server that sends no email: only the password, and no new one", async () => {
    const { api } = authApi(ACCOUNT);
    await renderApp(BACK, { api, auth: createFakeAuth().auth });
    await settle(6);
    expect(screen().getByRole("alert").textContent).toBe("Este e-mail já tem uma conta com senha. Entre com a senha.");
    expect(screen().queryByRole("button", { name: "Criar uma senha nova" })).toBeNull();
  });
});

describe("Senha nova (link do e-mail)", () => {
  test("saves the new password with the link's token", async () => {
    const { auth, calls } = createFakeAuth();
    await renderApp("/reset-password?token=tok-1", { api: createFakeApi(seedState({ me: null })), auth });
    expect(heading()).toBe("Crie uma senha nova.");
    expect(lead()).toBeNull();
    expect(screen().getByText("Pelo menos 8 caracteres.")).toBeTruthy();
    await type("Crie uma senha nova.", "senha-nova-1");
    await press(/Salvar senha/);
    expect(calls[0]).toEqual({ method: "resetPassword", args: [{ token: "tok-1", newPassword: "senha-nova-1" }] });
    expect(heading()).toBe("Senha nova salva.");
    expect(lead()).toBe("Saímos das suas outras sessões.");
  });

  test("an expired link (no token) asks for another", async () => {
    await renderApp("/reset-password?error=INVALID_TOKEN", {
      api: createFakeApi(seedState({ me: null })),
      auth: createFakeAuth().auth,
    });
    expect(heading()).toBe("Esse link expirou.");
    expect(lead()).toBe("Os links valem por 1 hora.");
    expect(screen().getByRole("link", { name: "Pedir outro link" }).getAttribute("href")).toBe("/login");
  });
});

describe("Aceitar convite", () => {
  const INVITED: InvitationPreview = {
    orgName: "Acme",
    email: "rafael@acme.com.br",
    role: "member",
    kind: "email",
    invitedBy: "Ana Souza",
    agents: [
      { id: ADA_ID, name: "Ada", appearance: { color: "amber", eyes: "dots", accessory: "beanie" } },
      { id: "agent-theo", name: "Theo", appearance: null },
    ],
    account: { exists: false, password: false, providers: [] },
  };
  const EXPIRED = {
    state: "expired" as const,
    orgName: "Acme",
    invitedBy: "Ana Souza",
    at: "2026-10-24T15:00:00.000Z",
  };
  type Fake = ReturnType<typeof seedState>;
  /** An email invitation's page (`/invite/inv`, or `path`), its preview `patch`ed; signed out unless `seed` says. */
  const openInvite = async (
    patch: Partial<InvitationPreview> = {},
    options: {
      seed?: Parameters<typeof seedState>[0];
      auth?: (state: Fake) => ReturnType<typeof createFakeAuth>["auth"];
      path?: string;
    } = {},
  ) => {
    const state = seedState({ me: null, ...options.seed, previews: { inv: { ...INVITED, ...patch } } });
    const r = await renderApp(options.path ?? "/invite/inv", {
      api: createFakeApi(state),
      auth: options.auth?.(state),
    });
    await settle(4);
    return { ...r, state };
  };

  test("an invitation that gives a cargo and agents says them: the cargo in the hello, its agents as who works with you", async () => {
    await openInvite({
      roles: [{ name: "Suporte", color: "teal", icon: "headset" }],
      yours: 1,
      agents: [
        { id: "agent-max", name: "Max", appearance: { color: "teal", eyes: "dots", accessory: "headset" } },
        { id: ADA_ID, name: "Ada", appearance: { color: "amber", eyes: "dots", accessory: "beanie" } },
      ],
    });
    expect(heading()).toBe("Oi. Ana chamou você para a Acme, como Suporte.");
    const org = document.querySelector(".invite__org")?.textContent;
    expect(org).toContain("Max vai trabalhar com você");
    expect(org).not.toContain("trabalham lá");
    // The invitation's first agent is the host.
    expect(document.querySelector(".auth__ask .ac-avatar")?.getAttribute("data-accessory")).toBe("headset");
  });

  test("a new address: its name, then a password; signing up accepts and opens the workspace", async () => {
    const { auth, calls } = createFakeAuth();
    // Opened from its email: the link carries the proof only the message has (ADR 0090).
    const proof = "p".repeat(43);
    const { state, router } = await openInvite(
      {},
      {
        path: `/invite/inv?mail=${proof}`,
        seed: { authConfig: { termsUrl: "/termos", privacyUrl: "/privacidade" } },
        auth: (fake) => {
          const signUp = auth.signUp;
          auth.signUp = async (input, humanCheck) => {
            fake.me = seedState().me;
            return signUp(input, humanCheck);
          };
          return auth;
        },
      },
    );
    // The workspace above the host: who invited, and the faces and names of who works there.
    const org = document.querySelector(".invite__org")?.textContent;
    expect(org).toContain("Convite de Ana Souza");
    expect(org).toContain("Ada e Theo trabalham lá");
    // The host is the workspace's first agent, as it looks there.
    expect(document.querySelector(".auth__ask .ac-avatar")?.getAttribute("data-accessory")).toBe("beanie");
    expect(heading()).toBe("Oi. Ana chamou você para a Acme.");
    expect(lead()).toBe("Para começar: como o time te chama?");
    // The address can't change: the invitation is for it.
    const who = document.querySelector(".auth__who");
    expect(who?.textContent).toBe("rafael@acme.com.br");
    expect(who?.getAttribute("title")).toBe("O convite vale só para este e-mail.");
    expect(screen().getByRole("link", { name: "Termos" }).getAttribute("href")).toBe("/termos");
    expect(
      screen()
        .getByRole("button", { name: /^Continuar(?! com)/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    await type("Seu nome", "Rafael Costa");
    await press(/^Continuar(?! com)/, 2);
    expect(heading()).toBe("Boa, Rafael. Agora uma senha.");
    expect(lead()).toBe("Com ela você entra na Acme agora e nas próximas vezes.");
    expect(screen().getByRole("button", { name: "Entrar na Acme" }).hasAttribute("disabled")).toBe(true);
    await type("Crie uma senha", "senha-exemplo");
    await press("Entrar na Acme", 10);
    // The invitation's token and its email's proof go along: the address is proved, so no "confirm your email"
    // follows, and accepting confirms it (ADR 0090).
    expect(calls.filter((c) => c.method === "signUp").map((c) => c.args)).toEqual([
      [
        {
          name: "Rafael Costa",
          email: "rafael@acme.com.br",
          password: "senha-exemplo",
          invitation: { token: "inv", mail: proof },
        },
      ],
    ]);
    expect(state.calls.filter((c) => c.method === "orgs.acceptInvitation").map((c) => c.args)).toEqual([
      ["inv", proof],
    ]);
    expect(router.state.location.pathname.startsWith(`/org/${ORG_ID}`)).toBe(true);
  });

  test("a new address whose password is the name typed: back on the name, no account", async () => {
    const { auth, calls } = createFakeAuth();
    await openInvite({}, { auth: () => auth });
    await type("Seu nome", "Fake#Pass1");
    expect(screen().getByText("Isso parece uma senha. Aqui vai o seu nome.")).toBeTruthy();
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "Fake#Pass1");
    await press("Entrar na Acme", 10);
    expect(calls.some((c) => c.method === "signUp")).toBe(false);
    expect(heading()).toBe("Oi. Ana chamou você para a Acme.");
    expect(screen().getByRole("alert").textContent).toBe("Esse é o seu nome? É igual à senha que você digitou.");
  });

  test("a personal workspace's invitation goes by whose it is, never by its name (ADR 0159)", async () => {
    await openInvite({ orgName: "Pessoal", mode: "personal" });
    // On top: whose workspace it is, which already says who invited.
    const org = document.querySelector(".invite__org")?.textContent ?? "";
    expect(org).toContain("Workspace de Ana Souza");
    expect(org).not.toContain("Pessoal");
    expect(org).not.toContain("Convite de");
    expect(heading()).toBe("Oi. Ana chamou você para entrar.");
    expect(lead()).toBe("Para começar: como os agentes devem te chamar?");
    await type("Seu nome", "Rafael Costa");
    await press(/^Continuar(?! com)/, 2);
    expect(lead()).toBe("Com ela você entra agora e nas próximas vezes.");
    expect(screen().getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Pessoal");
  });

  test("an account with a password: only its password, Esqueci a senha in place, its provider too; then in", async () => {
    let tries = 0;
    const { auth, calls } = createFakeAuth();
    const { state, router } = await openInvite(
      { account: { exists: true, password: true, providers: ["github"] } },
      {
        seed: { authConfig: { passwordReset: true } },
        auth: (fake) => {
          const signIn = auth.signIn;
          auth.signIn = async (input, humanCheck) => {
            if (++tries === 1) {
              calls.push({ method: "signIn", args: [input] });
              return { ok: false, status: 401, message: "Invalid" };
            }
            fake.me = seedState().me;
            return signIn(input, humanCheck);
          };
          return auth;
        },
      },
    );
    expect(heading()).toBe("Bom te ver de novo.");
    expect(lead()).toBe("Ana chamou você para a Acme. Sua senha, e você já entra.");
    expect(screen().queryByLabelText("Seu nome")).toBeNull();
    expect(screen().getByRole("button", { name: /Continuar com GitHub/ })).toBeTruthy();
    await type("Senha", "senha-errada");
    await press("Entrar na Acme");
    expect(heading()).toBe("Hmm, essa senha não bateu.");
    expect(lead()).toBeNull();
    expect(screen().getByLabelText("Senha").getAttribute("aria-invalid")).toBe("true");
    expect(state.calls.some((c) => c.method === "orgs.acceptInvitation")).toBe(false);

    // Esqueci a senha: the sign-in's own reset, in place, for the invited address.
    await press("Esqueci a senha", 2);
    expect(heading()).toBe("Te mando um link para criar outra senha.");
    await press(/^Enviar link/);
    expect(calls.find((c) => c.method === "requestPasswordReset")?.args).toEqual([
      { email: "rafael@acme.com.br", redirectTo: `${window.location.origin}/reset-password` },
    ]);
    expect(heading()).toBe("Pronto. Mandei o link para rafael@acme.com.br.");
    await press("Voltar para entrar", 2);
    await type("Senha", "senha-certa");
    await press("Entrar na Acme", 10);
    expect(calls.filter((c) => c.method === "signIn").map((c) => c.args[0])).toEqual([
      { email: "rafael@acme.com.br", password: "senha-errada" },
      { email: "rafael@acme.com.br", password: "senha-certa" },
    ]);
    expect(state.calls.filter((c) => c.method === "orgs.acceptInvitation")).toHaveLength(1);
    expect(router.state.location.pathname.startsWith(`/org/${ORG_ID}`)).toBe(true);
  });

  test("a provider signs in or up and comes back here to accept; an account with no password gets only its own", async () => {
    const { auth, calls } = createFakeAuth();
    try {
      await openInvite({}, { auth: () => auth });
      await press(/Continuar com GitHub/);
      cleanup();

      await openInvite({ account: { exists: true, password: false, providers: ["github"] } }, { auth: () => auth });
      expect(heading()).toBe("Ana chamou você para a Acme.");
      expect(lead()).toBe("Sua conta entra com GitHub. Continue por aqui.");
      expect(screen().queryByLabelText("Senha")).toBeNull();
      await press(/Continuar com GitHub/);
      expect(calls).toEqual([
        { method: "signInSocial", args: ["github", "/invite/inv?join=1"] },
        { method: "signInSocial", args: ["github", "/invite/inv?join=1"] },
      ]);
    } finally {
      storage.remove(STORAGE_KEYS.lastSignIn);
    }
  });

  test("signed in as the invited address: one step; back from a provider's sign-in, accepted by itself", async () => {
    // The fake's Walter is the one invited here.
    const mine = { email: "walter@acme.com.br" };
    const { state, router } = await openInvite(mine, { seed: { me: seedState().me } });
    expect(heading()).toBe("Ana chamou você para a Acme.");
    expect(lead()).toBe("Você está como walter@acme.com.br. É só entrar.");
    expect(screen().getByRole("button", { name: "Não é você? Sair" })).toBeTruthy();
    await press("Entrar na Acme", 10);
    expect(state.calls.filter((c) => c.method === "orgs.acceptInvitation").map((c) => c.args)).toEqual([["inv"]]);
    expect(router.state.location.pathname.startsWith(`/org/${ORG_ID}`)).toBe(true);
    cleanup();

    const back = await openInvite(mine, { seed: { me: seedState().me }, path: "/invite/inv?join=1" });
    await settle(10);
    expect(back.state.calls.filter((c) => c.method === "orgs.acceptInvitation")).toHaveLength(1);
    expect(back.router.state.location.pathname.startsWith(`/org/${ORG_ID}`)).toBe(true);
  });

  test("signed in as someone else: whose invitation it is, and signing in as that address happens right here", async () => {
    const { auth, calls } = createFakeAuth();
    const { router } = await openInvite(
      { account: { exists: true, password: true, providers: [] } },
      { seed: { me: seedState().me }, auth: () => auth },
    );
    expect(heading()).toBe("Este convite é para rafael@acme.com.br.");
    expect(lead()).toBe("Você está como walter@acme.com.br. Entre com o e-mail do convite e você já cai na Acme.");
    await press("Entrar como rafael@acme.com.br");
    expect(calls.map((c) => c.method)).toEqual(["signOut"]);
    expect(heading()).toBe("Bom te ver de novo.");
    expect(document.querySelector(".auth__who")?.textContent).toBe("rafael@acme.com.br");
    expect(router.state.location.pathname).toBe("/invite/inv");
  });

  test("accepting refused: said in the invited person's words, never the server's", async () => {
    const state = seedState({ previews: { inv: { ...INVITED, email: "walter@acme.com.br" } } });
    const api = createFakeApi(state);
    api.orgs.acceptInvitation = async () => {
      throw new ApiError(409, "org.members_full", "Members limit reached");
    };
    await renderApp("/invite/inv", { api });
    await settle(4);
    await press("Entrar na Acme");
    expect(screen().getByRole("alert").textContent).toBe(
      "Todas as vagas deste workspace estão ocupadas agora. Peça a quem convidou você para abrir uma vaga.",
    );
  });

  test("a full workspace says so before any account is made; a paused one's invitation takes nobody", async () => {
    await openInvite({ full: true });
    expect(heading()).toBe("A Acme está com todas as vagas ocupadas agora.");
    expect(lead()).toBe(
      "Seu convite continua valendo. Peça a quem convidou você para abrir uma vaga, e você entra por este mesmo link.",
    );
    expect(document.querySelector(".invite button, .invite input")).toBeNull();
    cleanup();

    await openInvite({ closed: true, invitedBy: null, agents: [] });
    expect(heading()).toBe("Este link não funciona mais");
    expect(lead()).toBe("Peça um novo a quem mandou.");
    expect(document.querySelector(".invite button, .invite input")).toBeNull();
  });

  test("an invitation that no longer opens says what happened: used (open the workspace), or nothing to go on", async () => {
    const used = { state: "accepted" as const, orgId: ORG_ID, orgName: "Acme", at: "2026-10-12T15:00:00.000Z" };
    const { router } = await renderApp("/invite/used", {
      api: createFakeApi(seedState({ invitationStates: { used } })),
    });
    await settle(4);
    expect(heading()).toBe("Você já está na Acme.");
    expect(lead()).toBe("Este convite já foi usado, em 12 out. É só abrir.");
    await press("Abrir a Acme", 10);
    expect(router.state.location.pathname.startsWith(`/org/${ORG_ID}`)).toBe(true);
    cleanup();

    // A member of a personal workspace: never its name (ADR 0159).
    const mine = seedState({ invitationStates: { used: { ...used, orgName: "Pessoal" } } });
    const membership = mine.me?.organizations[0];
    if (membership) membership.mode = "personal";
    await renderApp("/invite/used", { api: createFakeApi(mine) });
    await settle(4);
    expect(heading()).toBe("Você já entrou.");
    expect(screen().getByRole("button", { name: "Abrir" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("Pessoal");
    cleanup();

    // Signed out: signing in on the way.
    const out = await renderApp("/invite/used", {
      api: createFakeApi(seedState({ me: null, invitationStates: { used } })),
    });
    await settle(4);
    await press("Abrir a Acme");
    expect(out.router.state.location.pathname).toBe("/login");
    expect(out.router.state.location.search).toEqual({ redirect: `/org/${ORG_ID}` });
    cleanup();

    // Cancelled, or never one: only that it doesn't work.
    await renderApp("/invite/nope", { api: createFakeApi(seedState({ me: null })) });
    await settle(4);
    expect(heading()).toBe("Este convite não vale mais.");
    expect(lead()).toBe("Pode ter sido cancelado. Fale com quem te convidou.");
    expect(document.querySelector(".invite button")).toBeNull();
  });

  test("expired: asks whoever invited for a new one, by name, where email goes out", async () => {
    const state = seedState({ me: null, invitationStates: { old: EXPIRED } });
    await renderApp("/invite/old", { api: createFakeApi(state) });
    await settle(4);
    expect(heading()).toBe("Este convite expirou em 24 out.");
    expect(lead()).toBe("Ana pode mandar outro. Quer que eu peça?");
    expect(document.querySelector(".invite__org")?.textContent).toContain("Convite de Ana Souza");
    await press("Pedir um novo convite");
    expect(state.calls.filter((c) => c.method === "invites.requestNew").map((c) => c.args)).toEqual([["old"]]);
    expect(lead()).toBe("Pronto. Ana recebeu seu pedido por e-mail.");
    expect(screen().getByRole("button", { name: "Pedido enviado" }).hasAttribute("disabled")).toBe(true);
  });

  test("an invitation the server didn't answer for is asked again, never 'não vale mais'", async () => {
    const state = seedState({ me: null });
    state.previewFails = [new NetworkError(new TypeError("Failed to fetch"))];
    await renderApp("/invite/valid", { api: createFakeApi(state) });
    await settle(6);
    expect(state.previewFails).toEqual([]);
    expect(lead()).toBe("Para começar: como o time te chama?");
  });

  test("a replaced or cancelled invitation: asking fails, and the page says so instead of a request nobody got", async () => {
    const state = seedState({ me: null, invitationStates: { old: EXPIRED } });
    state.requestNewError = new ApiError(404, "not_found", "Invitation not found");
    await renderApp("/invite/old", { api: createFakeApi(state) });
    await settle(4);
    await press("Pedir um novo convite");
    expect(screen().getByRole("alert").textContent).toMatch(/trocado por um convite mais novo ou cancelado/);
    expect(screen().queryByRole("button", { name: "Pedido enviado" })).toBeNull();
    expect(screen().getByRole("button", { name: "Pedir um novo convite" }).hasAttribute("disabled")).toBe(false);
  });

  test("expired, on a server that sends no email: whom to ask, and no button for a request nobody would get", async () => {
    const state = seedState({ me: null, authConfig: { passwordReset: false }, invitationStates: { old: EXPIRED } });
    await renderApp("/invite/old", { api: createFakeApi(state) });
    await settle(4);
    expect(heading()).toBe("Este convite expirou em 24 out.");
    expect(lead()).toBe("Peça um novo a Ana.");
    expect(screen().queryByRole("button", { name: "Pedir um novo convite" })).toBeNull();
    expect(state.calls.some((c) => c.method === "invites.requestNew")).toBe(false);
  });
});

describe("A verificação contra robôs (agentes.chat Cloud)", () => {
  const SITE_KEY = "1x00000000000000000000BB";
  afterEach(removeTurnstile);

  /** A fake API with the bot check on, and the sign-in options' calls recorded with their token. */
  const checkedApi = (options: SignInOptions, refuse?: ApiError) => {
    const state = seedState({ me: null, authConfig: { turnstileSiteKey: SITE_KEY, passwordReset: true } });
    const api = createFakeApi(state);
    api.account.signInOptions = async (input, humanCheck) => {
      state.calls.push({ method: "account.signInOptions", args: [input, humanCheck] });
      if (refuse) throw refuse;
      return options;
    };
    return { api, state };
  };
  const lookups = (state: { calls: { method: string; args: unknown[] }[] }) =>
    state.calls.filter((c) => c.method === "account.signInOptions").map((c) => c.args);

  test("no site key: nothing loads from Cloudflare, and calls go without a token", async () => {
    installTurnstile();
    const { api, state } = authApi(NEW);
    const { auth, calls } = createFakeAuth();
    await renderApp("/signup", { api, auth });
    await type("E-mail", "walter@acme.com.br");
    await press(/^Continuar(?! com)/);
    await type("Seu nome", "Walter");
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "senha-longa");
    await press(/Criar conta/);
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull();
    expect(document.querySelector(".human-check")).toBeNull();
    expect(lookups(state)).toEqual([[{ email: "walter@acme.com.br" }]]);
    expect(calls.find((c) => c.method === "signUp")?.args.length).toBe(1);
  });

  test("with a site key: Cloudflare's script once, a widget per step for its action, its token on each call, then a fresh one", async () => {
    const cf = installTurnstile();
    const { api, state } = checkedApi(ACCOUNT);
    const { auth, calls } = createFakeAuth({ signIn: { ok: false, status: 401, message: "Invalid" } });
    await renderApp("/login", { api, auth });
    await settle();
    expect(cf.scripts().map((s) => s.getAttribute("src"))).toEqual([
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    ]);
    expect(cf.widgets[0]?.options).toMatchObject({
      sitekey: SITE_KEY,
      action: "email-lookup",
      appearance: "interaction-only",
      size: "flexible",
      language: "pt-br",
      "refresh-expired": "auto",
      "response-field": false,
    });

    await type("E-mail", "marina@acme.com.br");
    await press(/^Continuar(?! com)/);
    expect(lookups(state)).toEqual([[{ email: "marina@acme.com.br" }, "w1-1"]]);
    // A token passes one check: the widget was reset. The password step has its own, for signing in.
    expect(cf.resets).toEqual(["w1"]);
    expect(cf.widgets.map((w) => [w.options.action, w.removed])).toEqual([
      ["email-lookup", true],
      ["sign-in", false],
    ]);
    await type("Senha", "senha-errada");
    await press(/^Entrar/);
    expect(calls.at(-1)?.args).toEqual([{ email: "marina@acme.com.br", password: "senha-errada" }, "w2-1"]);
    expect(cf.resets).toEqual(["w1", "w2"]);
    await type("Senha", "senha-certa");
    await press(/^Entrar/);
    expect(calls.at(-1)?.args[1]).toBe("w2-2");
    // Still one script for the whole page.
    expect(cf.scripts().length).toBe(1);
  });

  test("the script doesn't load (a blocker): the call says so, and the server's refusal reads plainly", async () => {
    installTurnstile({ loads: false });
    const blocked = new ApiError(
      403,
      "human_check_blocked",
      "The bot check didn't load. Try another browser or network.",
    );
    const { api, state } = checkedApi(ACCOUNT, blocked);
    await renderApp("/login", { api, auth: createFakeAuth().auth });
    await type("E-mail", "marina@acme.com.br");
    await press(/^Continuar(?! com)/);
    // Sent once: another try can't load the check either.
    expect(lookups(state)).toEqual([[{ email: "marina@acme.com.br" }, "unavailable"]]);
    expect(screen().getByRole("alert").textContent).toContain(
      "A verificação não carregou. Tente outro navegador ou outra rede.",
    );
    expect(heading()).toBe("Oi. Qual é o seu e-mail?");
  });

  test("sign-up refused by the check: tried once more with a fresh token, then said plainly, never as a closed sign-up", async () => {
    const cf = installTurnstile();
    const { api } = checkedApi(NEW);
    const { auth, calls } = createFakeAuth({
      signUp: { ok: false, status: 403, code: "human_check", message: "Couldn't confirm a person is asking." },
    });
    await renderApp("/signup", { api, auth });
    await type("E-mail", "walter@acme.com.br");
    await press(/^Continuar(?! com)/);
    await type("Seu nome", "Walter");
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "senha-longa");
    await press(/Criar conta/);
    expect(calls.filter((c) => c.method === "signUp").map((c) => c.args[1])).toEqual(["w2-1", "w2-2"]);
    expect(screen().getByRole("alert").textContent).toContain(
      "Não conseguimos confirmar que você é uma pessoa. Tente de novo.",
    );
    expect(heading()).toBe("Boa, Walter. Agora uma senha.");
    expect(cf.widgets.at(-1)?.options.action).toBe("sign-up");
  });

  test("too many tries reads in the person's words, not the server's", async () => {
    installTurnstile();
    const { api } = checkedApi(NEW);
    const { auth } = createFakeAuth({ signUp: { ok: false, status: 429, message: "Too many requests" } });
    await renderApp("/signup", { api, auth });
    await type("E-mail", "walter@acme.com.br");
    await press(/^Continuar(?! com)/);
    await type("Seu nome", "Walter");
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "senha-longa");
    await press(/Criar conta/);
    expect(screen().getByRole("alert").textContent).toContain(
      "Muitas tentativas. Espere alguns minutos e tente de novo.",
    );
  });

  test("an email invitation's sign-up, and an invitation link's code, carry the token", async () => {
    installTurnstile();
    const invited: InvitationPreview = { orgName: "Acme", email: "marina@acme.com.br", role: "member", kind: "email" };
    const state = seedState({
      me: null,
      authConfig: { turnstileSiteKey: SITE_KEY, passwordReset: true },
      previews: { inv: invited },
    });
    const { auth, calls } = createFakeAuth();
    await renderApp("/invite/inv", { api: createFakeApi(state), auth });
    await settle();
    // The name guards nothing; the password that makes the account does.
    expect(document.querySelector(".invite .human-check")).toBeNull();
    await type("Seu nome", "Marina");
    await press(/^Continuar(?! com)/, 2);
    expect(document.querySelector(".invite .human-check")).toBeTruthy();
    await type("Crie uma senha", "senha-exemplo");
    await press("Entrar na Acme");
    expect(calls.find((c) => c.method === "signUp")?.args[1]).toBe("w1-1");
    cleanup();
    removeTurnstile();

    const cf = installTurnstile();
    state.previews = { lnk: { orgName: "Acme", email: "", role: "member", kind: "link", invitedBy: "Marina" } };
    await renderApp("/invite/lnk", { api: createFakeApi(state) });
    await settle();
    await type("Seu e-mail", "walter@acme.com.br");
    await press(/^Continuar/);
    expect(state.calls.find((c) => c.method === "invites.sendCode")?.args).toEqual([
      "lnk",
      { email: "walter@acme.com.br" },
      "w1-1",
    ]);
    expect(cf.widgets.every((w) => w.options.action === "ask-code")).toBe(true);
  });

  test("an email invitation's sign-up is busy while the check waits for its token: a second press signs up nobody", async () => {
    const cf = installTurnstile({ gives: false });
    const invited: InvitationPreview = { orgName: "Acme", email: "marina@acme.com.br", role: "member", kind: "email" };
    const state = seedState({
      me: null,
      authConfig: { turnstileSiteKey: SITE_KEY, passwordReset: true },
      previews: { inv: invited },
    });
    const { auth, calls } = createFakeAuth();
    await renderApp("/invite/inv", { api: createFakeApi(state), auth });
    await settle();
    await type("Seu nome", "Marina");
    await press(/^Continuar(?! com)/, 2);
    await type("Crie uma senha", "senha-exemplo");
    await press("Entrar na Acme");
    const enter = screen().getByRole("button", { name: "Entrar na Acme" });
    expect(enter.getAttribute("aria-busy")).toBe("true");
    expect(enter.hasAttribute("disabled")).toBe(true);
    // A submit that reaches the form anyway, as Enter would.
    await act(async () => fireEvent.submit(enter.closest("form") as HTMLFormElement));
    expect(calls.filter((c) => c.method === "signUp")).toEqual([]);

    cf.give("w1");
    await settle(6);
    expect(calls.filter((c) => c.method === "signUp").map((c) => c.args[1])).toEqual(["w1-1"]);
    expect(state.calls.filter((c) => c.method === "orgs.acceptInvitation").length).toBe(1);
  });
});

describe("Onboarding: the workspace's name", () => {
  /** `billingUrl`: the Cloud's billing service, as `/api/auth/config` says it. */
  const start = async (
    patch: Partial<ReturnType<typeof seedState>> = {},
    { billingUrl = null }: { billingUrl?: string | null } = {},
  ) => {
    // A new account: no workspace, and no agent until one is made.
    const state = seedState({ agents: [], ...patch });
    if (state.me) state.me.organizations = [];
    state.authConfig = { workspaceComputer: false, billingUrl, ...patch.authConfig };
    const api = createFakeApi(state);
    const r = await renderApp("/onboarding", { api });
    // First what it is for (ADR 0159): a company or team names it next. Where no workspace may be made, no question.
    const team = screen().queryByRole("radio", { name: /Para meu time/ });
    if (team) {
      await click(team, 8);
      await click(button("Continuar"), 8);
    }
    return { ...r, api, state };
  };
  const button = (name: string | RegExp) => screen().getByRole("button", { name });
  /** What it is for: a company or team, then its name (ADR 0159). */
  const toName = async () => {
    await click(screen().getByRole("radio", { name: /Para meu time/ }), 8);
    await click(button("Continuar"), 8);
  };
  async function click(el: HTMLElement, rounds = 4) {
    await act(async () => fireEvent.click(el));
    await settle(rounds);
  }
  const next = () => click(button("Continuar"), 8);
  const calls = (state: ReturnType<typeof seedState>, method: string) => state.calls.filter((c) => c.method === method);

  test("the name, step 1 on the rail, Lodi's line on its horizon, never a guide among the presets", async () => {
    await start();
    expect(screen().getByRole("heading", { name: "Como se chama o seu workspace?" })).toBeTruthy();
    expect(screen().getByRole("navigation", { name: "Passos para começar" })).toBeTruthy();
    expect(document.querySelector(".onb__say")?.textContent).toContain("Eu sou o Lodi.");
    expect(document.body.textContent).not.toContain("Oi, eu sou a Ada");
    // A name is no misspelling.
    expect(screen().getByLabelText("Nome").getAttribute("spellcheck")).toBe("false");
    expect(button("Continuar").hasAttribute("disabled")).toBe(true);
  });

  test("the step's actions: a bar always in view, its notes above it", async () => {
    sessionStorage.setItem("agentes.confirmation.sent", "walter@acme.com.br");
    await start();
    const bar = document.querySelector(".onb__actions") as HTMLElement;
    // Where the link went is the step's last line, above the bar.
    const note = screen()
      .getByText(/Mandamos um link de confirmação/)
      .closest(".onb__note") as HTMLElement;
    expect(bar.contains(note)).toBe(false);
    expect(note.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect([...bar.children].map((b) => b.textContent)).toEqual([expect.stringMatching(/^Continuar/)]);
    // Right under the step, it holds the screen's bottom only while the step is taller than the screen, clear of a
    // phone's home bar, and a field being typed in scrolls clear of it.
    const css = readFileSync(join(import.meta.dir, "../src/pages/onboarding.css"), "utf8");
    const rule = (selector: string, from = 0) => css.slice(css.indexOf(`${selector} {`, from)).split("}")[0] ?? "";
    expect(rule("\n.onb__actions")).toContain("position: sticky");
    expect(rule("\n.onb__actions")).toContain("bottom: 0");
    expect(rule("\n.onb__body")).not.toMatch(/(^|\n)\s*margin:/);
    expect(rule("\n.onb__actions")).toContain("margin: 0 calc(-1 * var(--onb-gutter))");
    expect(rule("\n.onb__cols")).toContain("--onb-gutter: clamp(16px, 4vw, 32px)");
    expect(rule("\n.onb__actions")).toContain(
      "padding: var(--space-1) var(--onb-gutter) calc(env(safe-area-inset-bottom, 0px) + var(--space-6))",
    );
    expect(rule("\n.onb__actions")).toContain("background: var(--pane)");
    // The onboarding scrolls itself, never the document (the Linux app doesn't wheel-scroll the document there).
    const layout = readFileSync(join(import.meta.dir, "../src/layout.css"), "utf8");
    const onb = layout.slice(layout.indexOf("\n.onb {")).split("}")[0] ?? "";
    expect(onb).toContain("height: var(--onb-h, 100dvh)");
    expect(onb).toContain("overflow-y: auto");
    expect(onb).toContain("scroll-padding-bottom: 104px");
    expect(css).not.toContain("100vw - 100%");
  });

  test("Sair: the account signs out, to sign-in", async () => {
    const { auth, calls: authCalls } = createFakeAuth();
    const state = seedState({ agents: [] });
    if (state.me) state.me.organizations = [];
    const signOut = auth.signOut;
    auth.signOut = async () => {
      await signOut();
      state.me = null;
    };
    const { router } = await renderApp("/onboarding", { api: createFakeApi(state), auth });
    await settle(4);
    // In the account menu on the rail (Radix: keyboard).
    const me = button("Sua conta");
    me.focus();
    await act(async () => {
      fireEvent.keyDown(me, { key: "Enter" });
      fireEvent.keyUp(me, { key: "Enter" });
    });
    await settle(2);
    await click(screen().getByRole("menuitem", { name: "Sair" }), 6);
    expect(authCalls.map((c) => c.method)).toEqual(["signOut"]);
    expect(router.state.location.pathname).toBe("/login");
  });

  test("where new workspaces take an invitation: says so, with whom to ask, and doesn't continue", async () => {
    const seeded = seedState();
    const user = { ...(seeded.me?.user ?? { id: "u", name: "Ana", email: "ana@acme.com", image: null }) };
    const { state } = await start({
      me: { user: { ...user, canCreateWorkspace: false, emailVerified: true }, organizations: [] },
      authConfig: { supportEmail: "suporte@agentes.chat" },
    });
    expect([...document.querySelectorAll(".onb__note")].map((n) => n.textContent)).toEqual([
      "Novos workspaces precisam de convite por enquanto. Peça um em suporte@agentes.chat.",
    ]);
    // It stops at what the workspace is for (ADR 0159): the answer is picked, and Continuar stays off.
    expect(
      screen()
        .getByRole("radio", { name: /Para meu time/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(button("Continuar").hasAttribute("disabled")).toBe(true);
    expect(screen().queryByLabelText("Nome")).toBeNull();
    expect(calls(state, "orgs.create")).toEqual([]);
  });

  test("held there with the address unconfirmed: early access counts once it is, so a new link is at hand", async () => {
    const state = seedState();
    if (!state.me) throw new Error("no me");
    state.me.organizations = [];
    state.me.user = { ...state.me.user, canCreateWorkspace: false, emailVerified: false };
    state.authConfig = { ...state.authConfig, supportEmail: "suporte@agentes.chat" };
    const { auth, calls: authCalls } = createFakeAuth();
    await renderApp("/onboarding", { api: createFakeApi(state), auth });
    await settle(4);
    expect([...document.querySelectorAll(".onb__note")].map((n) => n.textContent)).toEqual([
      "Novos workspaces precisam de convite por enquanto. Peça um em suporte@agentes.chat.",
      "Já tem convite? Confirme seu e-mail primeiro.Mandar outro link",
    ]);
    await click(button("Mandar outro link"), 4);
    expect(authCalls).toEqual([{ method: "sendVerificationEmail", args: ["walter@acme.com.br"] }]);
    expect(button("Continuar").hasAttribute("disabled")).toBe(true);
  });

  test("a workspace refused: why, with how to contest it on agentes.chat Cloud; elsewhere the plain line", async () => {
    for (const [cloud, says] of [
      [
        true,
        "Você não pode criar um workspace enquanto a sua conta ou um dos seus workspaces estiver com restrição. Para contestar, escreva para legal@agentes.chat.",
      ],
      [false, "Você não pode criar um workspace agora."],
    ] as const) {
      const { api } = await start();
      api.orgs.create = async () => {
        throw new ApiError(403, "org.create_refused", "You can't create a workspace right now", {
          ...(cloud ? { cloud } : {}),
        });
      };
      await type("Nome", "Acme Saúde");
      await next();
      expect(document.querySelector(".ac-toast")?.textContent).toContain(says);
      expect(screen().getByRole("heading", { name: "Como se chama o seu workspace?" })).toBeTruthy();
      cleanup();
    }
  });

  test("every step starts at one top: Back on the rail wordmark's line, clear of the desktop app's drag strip", () => {
    const sheet = (path: string) => readFileSync(join(import.meta.dir, "../src", path), "utf8");
    const css = sheet("pages/onboarding.css");
    const desktop = sheet("desktop.css");
    const rule = (from: string, selector: string) => from.slice(from.indexOf(`${selector} {`)).split("}")[0] ?? "";
    const tokens = readFileSync(join(import.meta.dir, "../../../packages/ui/src/styles/tokens.css"), "utf8");
    // A length in px, through the kit's token where the rule names one (`var(--control-h-sm)`).
    const px = (decls: string, prop: string) => {
      const value = decls.match(new RegExp(`\\n\\s*${prop}: ([^;\\s]+)`))?.[1] ?? "";
      const token = value.match(/^var\((--[\w-]+)\)$/)?.[1];
      const raw = token ? tokens.match(new RegExp(`${token}: (-?[\\d.]+)px`))?.[1] : value.match(/^(-?[\d.]+)px/)?.[1];
      return Number(raw);
    };
    // No room above the step that follows what's in it, centring it or pinned as it opens.
    const rows = css.match(/\.onb__body[^{]*::before \{[^}]*\}/g) ?? [];
    expect(rows.filter((r) => /auto|--onb-lead/.test(r))).toEqual([]);
    // Back's middle (the column's top padding, its top margin and half its height) on the middle of the 22px logo's
    // lowercase letters, 16px under its top (the rail's padding), where the label reads on the wordmark's line.
    const railTop = px(rule(sheet("layout.css"), "\n.onb__rail"), "padding");
    const top = px(rule(css, "\n.onb__body"), "padding");
    const back = rule(css, "\n.onb__back");
    expect(top + px(back, "margin") + px(back, "height") / 2).toBe(railTop + 16);
    // The first step has no Back: a row of its height and margins keeps its room. A phone keeps its first step under
    // the step bar.
    const row = rule(css, "@media (min-width: 761px) {\n  .onb__body:not(:has(> .onb__back))::before");
    expect(row).toContain('content: ""');
    expect(px(row, "height")).toBe(px(back, "height"));
    expect(back).toContain(`margin: ${row.match(/\n\s*margin: ([^;]+);/)?.[1]}`);
    // Under the Mac's buttons the column moves down with the rail; a window narrow enough for the step bar doesn't.
    const mac = 'html[data-desktop="mac"]:not([data-fullscreen])';
    expect(rule(desktop, `\n${mac} .onb__rail`)).toContain("padding-top: calc(var(--titlebar-h) + 8px)");
    expect(rule(desktop, `@media (min-width: 761px) {\n  ${mac} .onb__body`)).toContain(
      `padding-top: calc(var(--titlebar-h) + 8px + ${top - railTop}px)`,
    );
    // Where the window isn't dragged from the page (full screen, Windows' and Linux's own title bars), no drag strip
    // lies over Back.
    expect(
      rule(desktop, '\nhtml:is([data-fullscreen], [data-desktop="windows"], [data-desktop="linux"]) .titlebar-strip'),
    ).toContain("display: none");
  });

  test("owning a workspace that waits for its plan: another is refused, with the way to that one's plan", async () => {
    const left: string[] = [];
    setNavigateAway((url) => left.push(url));
    const { api, state } = await start({}, { billingUrl: "https://billing.example.com" });
    api.orgs.create = async () => {
      throw new ApiError(403, "org.create_unpaid", "You already have a workspace waiting for a plan", {
        orgId: "org-unpaid",
      });
    };
    await type("Nome", "Beta");
    await next();
    expect(screen().getByRole("heading", { name: "Como se chama o seu workspace?" })).toBeTruthy();
    const said =
      "Você já tem um workspace esperando um plano do agentes.chat. Escolha o plano dele antes de criar outro.";
    expect(screen().getByRole("alert").textContent).toBe(said);
    // Said once, in place: no toast says it again.
    expect(document.body.textContent?.split(said)).toHaveLength(2);
    await click(button("Ver planos do agentes.chat"), 6);
    expect(calls(state, "orgs.billingLink")[0]?.args).toEqual(["org-unpaid", "new_workspace"]);
    expect(left).toEqual(["https://billing.example.com/link?t=new_workspace"]);
  });

  test("back on the question with a workspace that waits for its plan: the refusal opens that workspace", async () => {
    const state = seedState();
    const mine = state.me?.organizations[0];
    if (!mine) throw new Error("no workspace");
    const api = createFakeApi(state);
    api.orgs.create = async () => {
      throw new ApiError(403, "org.create_unpaid", "You already have a workspace waiting for a plan", {
        orgId: mine.id,
      });
    };
    const { router } = await renderApp("/onboarding", { api });
    await settle(4);
    await click(screen().getByRole("radio", { name: /Para mim/ }), 8);
    await next();
    expect(screen().getByRole("alert")).toBeTruthy();
    await click(button(`Abrir ${mine.name}`), 8);
    expect(router.state.location.pathname.startsWith(`/org/${mine.id}`)).toBe(true);
  });

  test("the confirmation email: where it went, a new link, and once it's confirmed no line", async () => {
    const state = seedState();
    if (!state.me) throw new Error("no me");
    state.me.organizations = [];
    state.me.user.emailVerified = false;
    // This tab signed up with this address.
    sessionStorage.setItem("agentes.confirmation.sent", "walter@acme.com.br");
    try {
      const { auth, calls } = createFakeAuth();
      await renderApp("/onboarding", { api: createFakeApi(state), auth });
      await settle(4);
      const note = () => document.querySelector(".onb__note")?.textContent;
      expect(note()).toBe("Mandamos um link de confirmação para walter@acme.com.br.Mandar outro link");
      // Nothing waits for it.
      expect(button("Continuar").hasAttribute("disabled")).toBe(true);
      await toName();
      await type("Nome", "Acme");
      expect(button("Continuar").hasAttribute("disabled")).toBe(false);

      // Didn't get it, or it ran out: a new one, once.
      await click(button("Mandar outro link"), 4);
      expect(calls).toEqual([{ method: "sendVerificationEmail", args: ["walter@acme.com.br"] }]);
      expect(document.body.textContent).toContain("Mandamos outro link para walter@acme.com.br.");
      expect(note()).toBe("Mandamos um link de confirmação para walter@acme.com.br.");

      // The link opened in another tab, which said so: back here the line is gone, and this tab forgets it was sent.
      state.me = { ...state.me, user: { ...state.me.user, emailVerified: true } };
      await act(async () => window.dispatchEvent(new Event("visibilitychange")));
      await settle(6);
      expect(document.querySelector(".onb__note")).toBeNull();
      expect(sessionStorage.getItem("agentes.confirmation.sent")).toBeNull();
    } finally {
      sessionStorage.clear();
    }
  });

  test("no confirmation line where this tab sent none (a Google sign-up, another tab)", async () => {
    const state = seedState();
    if (!state.me) throw new Error("no me");
    state.me.organizations = [];
    state.me.user.emailVerified = false;
    await renderApp("/onboarding", { api: createFakeApi(state) });
    await settle(4);
    expect(document.querySelector(".onb__note")).toBeNull();
    await toName();
    expect(screen().getByRole("heading", { name: "Como se chama o seu workspace?" })).toBeTruthy();
    expect(document.querySelector(".onb__note")).toBeNull();
  });

  test("workspace: the time zone in words, its reason behind its ⓘ, with no line under the field", async () => {
    await start();
    // Its name as people say it (the IANA id goes to the API only).
    const zone = [...document.querySelectorAll(".onb__help")].find((p) => p.textContent?.startsWith("Fuso horário"));
    expect(zone?.textContent).toMatch(/^Fuso horário: .+ · trocar$/);
    expect(zone?.textContent).not.toMatch(/\w\/\w/);
    await click(button("trocar"), 2);
    const about = button("Sobre Fuso horário");
    const why = document.getElementById(about.getAttribute("aria-describedby") ?? "");
    expect(why?.textContent).toBe("Para rotinas e lembretes. Detectado pelo seu navegador.");
    expect(why?.hidden).toBe(true);
    expect(document.querySelector(".ac-field__example")).toBeNull();
  });
});
