import { describe, expect, test } from "bun:test";
import { connectLink, parseConnectLink, readInstance, type ServerCheck } from "@agenteschat/client/lib/server";
import { LOCALES } from "@agenteschat/i18n/locale";
import { menuBarShown } from "../src/control/dock";
import {
  connectOutcome,
  escapeAction,
  foundServers,
  INSTALL_COMMAND,
  linkView,
  ownAddresses,
  ownServerScreen,
  PROBLEM_TEXT,
  terminalStartCommand,
  typedServer,
} from "../src/control/first-run";
import { MAX_MENU_LABEL, menuLabels } from "../src/control/menu-labels";
import { platformOf } from "../src/control/platform";
import { createDesktopI18n, loadDesktopI18n } from "../src/i18n";

const BOX = "https://agentes.tail1234.ts.net";
const TOKEN = "Qm9vdHN0cmFwLXRva2VuLTEyMzQ1Njc4OTBhYmNkZWY";
const CLAIM = "b3duZXItY2xhaW0tYWJjZGVmZ2hpamtsbW5vcHFyc3R1";

const instance = (url: string, over: Record<string, unknown> = {}) => ({
  name: "agentes.chat",
  version: "1.4.0",
  api: 1,
  minApi: 1,
  url,
  signIn: { email: true, google: false, github: false, apple: false },
  signup: "invite",
  ...over,
});
const ok = (server: string, over: Record<string, unknown> = {}): ServerCheck =>
  readInstance(server, instance(server, over));
const down = (server: string): ServerCheck => ({ ok: false, server, problem: "unreachable" });

describe("which screen", () => {
  test("your own server: the two ways where both exist, else straight to Connect", () => {
    expect(ownServerScreen(true)).toBe("own");
    // A build without the server (development): no card that can't work.
    expect(ownServerScreen(false)).toBe("connect");
  });

  test("the system from the web view's own user agent", () => {
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("mac");
    expect(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/130.0")).toBe("windows");
    expect(platformOf("Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15")).toBe("linux");
  });

  test("the setup's command", () => {
    expect(INSTALL_COMMAND).toBe("curl -fsSL https://agentes.chat/install | sh");
  });

  test("Esc: back a screen, or the window closes; never while agentes.chat is being set up here", () => {
    expect(escapeAction(2, false)).toBe("back");
    expect(escapeAction(0, false)).toBe("close");
    expect(escapeAction(2, true)).toBe("stay");
    expect(escapeAction(0, true)).toBe("stay");
  });
});

describe("discovery", () => {
  test("only servers that answered, by their own address, once each, this computer first", () => {
    const candidates = [
      { server: "http://127.0.0.1:4310", where: "here" as const },
      { server: "http://127.0.0.1:3000", where: "here" as const },
      { server: `${BOX}`, where: "tailnet" as const },
      { server: "https://agentes-mini.tail1234.ts.net", where: "tailnet" as const },
    ];
    // The one on 4310 says its own address is the tailnet one: listed once, as found here.
    const checks = [ok(BOX), down("http://127.0.0.1:3000"), ok(BOX), null];
    expect(foundServers(candidates, checks)).toEqual([{ server: BOX, where: "here" }]);
    expect(foundServers(candidates, [])).toEqual([]);
  });

  test("one that answered with a problem is listed with it, never hidden; one that isn't agentes.chat isn't", () => {
    const mini = "https://agentes-mini.tail1234.ts.net";
    const candidates = [
      { server: "http://127.0.0.1:4310", where: "here" as const },
      { server: mini, where: "tailnet" as const },
      { server: "https://other.tail1234.ts.net", where: "tailnet" as const },
    ];
    const checks: ServerCheck[] = [
      ok("http://127.0.0.1:4310", { ownerClaim: true }),
      { ok: false, server: mini, problem: "server-too-old" },
      { ok: false, server: "https://other.tail1234.ts.net", problem: "not-agentes" },
    ];
    expect(foundServers(candidates, checks)).toEqual([
      { server: "http://127.0.0.1:4310", where: "here", problem: "no-owner" },
      { server: mini, where: "tailnet", problem: "server-too-old" },
    ]);
  });
});

describe("a typed address", () => {
  test("https anywhere, plain http only on this computer, anything else is no address", () => {
    expect(typedServer("agentes.tail1234.ts.net")).toEqual({ ok: true, server: BOX });
    expect(typedServer("http://127.0.0.1:4310")).toEqual({ ok: true, server: "http://127.0.0.1:4310" });
    expect(typedServer("http://192.168.1.20:3000")).toEqual({ ok: false, problem: "http", host: "192.168.1.20:3000" });
    expect(typedServer("agentes chat")).toEqual({ ok: false, problem: "invalid", host: "agentes chat" });
  });

  test("after the check: used, confirmed in large type when its own address is another host, or a problem", () => {
    expect(connectOutcome(BOX, ok(BOX))).toEqual({ kind: "use", server: BOX });
    expect(connectOutcome("https://192-168-1-2.sslip.io", ok(BOX))).toEqual({ kind: "confirm", server: BOX });
    expect(connectOutcome(BOX, down(BOX))).toEqual({
      kind: "problem",
      problem: "unreachable-tailnet",
      host: "agentes.tail1234.ts.net",
    });
    expect(connectOutcome(BOX, ok(BOX, { ownerClaim: true }))).toEqual({
      kind: "problem",
      problem: "no-owner",
      host: "agentes.tail1234.ts.net",
    });
  });

  test("this computer's own agentes.chat opens at once at the address people use, never a sheet about another host", () => {
    const own = ownAddresses({ url: "http://127.0.0.1:4310", publicUrl: BOX });
    expect(own).toEqual(["http://127.0.0.1:4310", BOX]);
    expect(connectOutcome("http://127.0.0.1:4310", ok(BOX), own)).toEqual({ kind: "use", server: BOX });
    expect(connectOutcome("http://127.0.0.1:4310", ok(BOX))).toEqual({ kind: "confirm", server: BOX });
    expect(ownAddresses(null)).toEqual([]);
  });

  test("Tailscale is named only for a server on a Tailscale network", () => {
    const elsewhere = "https://chat.example.com";
    expect(connectOutcome(elsewhere, down(elsewhere))).toEqual({
      kind: "problem",
      problem: "unreachable",
      host: "chat.example.com",
    });
    for (const lng of ["en", "pt-BR"] as const) {
      const i18n = createDesktopI18n(lng, "mac");
      expect(i18n.t(PROBLEM_TEXT.unreachable, { host: "chat.example.com" })).not.toContain("Tailscale");
      expect(i18n.t(PROBLEM_TEXT["unreachable-tailnet"], { host: "box.tail1234.ts.net" })).toContain("Tailscale");
      expect(i18n.t(PROBLEM_TEXT["no-owner"], { host: "box" })).not.toContain("#claim");
    }
  });

  test("starting one installed from the terminal: its folder only when it isn't the default one", () => {
    expect(terminalStartCommand("/Users/ana/.agentes")).toBe("agentes-server");
    expect(terminalStartCommand("/home/ana/.agentes")).toBe("agentes-server");
    expect(terminalStartCommand("C:\\Users\\ana\\.agentes")).toBe("agentes-server");
    expect(terminalStartCommand("/srv/agentes")).toBe('agentes-server --data "/srv/agentes"');
  });

  test("nothing answering on this computer is said as such, not as a Tailscale problem", () => {
    const here = "http://127.0.0.1:4310";
    expect(connectOutcome(here, down(here))).toEqual({
      kind: "problem",
      problem: "unreachable-here",
      host: "127.0.0.1:4310",
    });
    const raw = connectLink(here);
    expect(linkView(parseConnectLink(raw, { allowHttp: "loopback" }), down(here), null)).toEqual({
      kind: "problem",
      server: here,
      problem: "unreachable-here",
    });
    for (const lng of ["en", "pt-BR"] as const) {
      const i18n = createDesktopI18n(lng, "mac");
      const text = i18n.t(PROBLEM_TEXT["unreachable-here"], { host: "127.0.0.1:4310" });
      expect(text).toContain("127.0.0.1:4310");
      expect(text).not.toContain("Tailscale");
    }
  });
});

describe("a link to a server", () => {
  const link = (opts: { token?: string; claim?: string } = {}) => parseConnectLink(connectLink(BOX, opts));

  test("plain: the question, nothing changed yet; the server open now: no sheet", () => {
    expect(linkView(link(), "checking", null)).toEqual({ kind: "checking", server: BOX });
    expect(linkView(link(), ok(BOX), null)).toEqual({
      kind: "ask",
      server: BOX,
      question: "question",
      button: "connect",
      leave: null,
    });
    expect(linkView(link(), ok(BOX), "https://app.agentes.chat")).toMatchObject({ kind: "ask", leave: "agentes.chat" });
    expect(linkView(link(), ok(BOX), BOX)).toEqual({ kind: "front", server: BOX });
  });

  test("a one-time sign-in: asked even on the server open now, opening the handover page", () => {
    expect(linkView(link({ token: TOKEN }), ok(BOX), BOX)).toEqual({
      kind: "ask",
      server: BOX,
      question: "questionSignIn",
      button: "connect",
      page: `/desktop/handover#token=${TOKEN}`,
      leave: null,
    });
  });

  test("a claim: the owner page while the server waits for its owner; ignored once it has one", () => {
    expect(linkView(link({ claim: CLAIM }), ok(BOX, { ownerClaim: true }), "https://app.agentes.chat")).toEqual({
      kind: "ask",
      server: BOX,
      question: "questionClaim",
      button: "continue",
      page: `/owner#claim=${CLAIM}`,
      leave: "agentes.chat",
    });
    expect(linkView(link({ claim: CLAIM }), ok(BOX), null)).toMatchObject({ kind: "ask", question: "question" });
    // A server waiting for its owner, without the claim: the installer's link is needed.
    expect(linkView(link(), ok(BOX, { ownerClaim: true }), null)).toEqual({
      kind: "problem",
      server: BOX,
      problem: "no-owner",
    });
  });

  test("a problem keeps its words; junk is no link", () => {
    expect(linkView(link(), down(BOX), null)).toEqual({ kind: "problem", server: BOX, problem: "unreachable-tailnet" });
    expect(linkView(parseConnectLink("agenteschat://chat/123"), "checking", null)).toEqual({ kind: "notALink" });
  });
});

describe("the menu bar and the labels Rust shows", () => {
  test("the menu bar icon: the person's choice, else while agents work here", () => {
    expect(menuBarShown(null, false)).toBe(false);
    expect(menuBarShown(null, true)).toBe(true);
    expect(menuBarShown(true, false)).toBe(true);
    expect(menuBarShown(false, true)).toBe(false);
  });

  // Rust refuses the whole set when one label is too long, so every language counts, not only the two written here.
  test("every label fits what Rust takes, in every language and on every system", async () => {
    for (const { code: lng } of LOCALES) {
      for (const platform of ["mac", "windows", "linux"] as const) {
        const labels = menuLabels((await loadDesktopI18n(lng, platform)).t);
        expect(Object.keys(labels).length).toBeLessThanOrEqual(100);
        for (const [key, value] of Object.entries(labels)) {
          expect({ key, ok: key.length <= 40 && value.length > 0 && [...value].length <= MAX_MENU_LABEL }).toEqual({
            key,
            ok: true,
          });
          expect(value).not.toContain("{{");
        }
        expect(labels.pairTitle).toContain("{org}");
        expect(labels.pairBody).toContain("{host}");
        // Another server's new notifications (ADR 0154): Rust fills the count in.
        expect(labels.workspaceNewsMany).toContain("{count}");
        expect(labels.workspaceNewsOne).not.toContain("{count}");
        expect(labels.serversCloud).toBe("agentes.chat");
      }
    }
  });
});
