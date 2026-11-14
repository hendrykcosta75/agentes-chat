/**
 * The host for a plain browser (`bun run dev`): fake runners and servers in memory instead of the Tauri
 * shell, so the screens can be designed and checked without building the app. One page shows one window at
 * a time; `showWindow` switches it (the dev bar does too) and keeps the fake state.
 *
 * Scenarios (`?scenario=`): `first` (a Mac, nothing chosen yet), `windows` and `linux` (the same there),
 * `cloud` (agentes.chat, nothing on this computer), `selfhost` (the default: a server on Tailscale with two
 * organizations whose agents work here), `link` (a claim link waiting) and `here` (agentes.chat runs on this
 * computer, its organization's agents too); `?link=` makes any scenario start with that link waiting. A pair link
 * (`agenteschat://pair?server=…&link=ABCDEFGH`) joins Estúdio Norte once its maker lets it in, `HGFEDCBA`'s maker
 * says no, and any other code expired.
 * `?mac=ready`: Screen Recording and Full Disk Access allowed already (with Local Network asked, Prepare this Mac
 * is skipped).
 * Servers answer by host: agentes.tail1234.ts.net, agentes.chat and http://127.0.0.1:4310 are servers;
 * noowner.tail1234.ts.net waits for its owner; old.example.com is too old; chat.example.com doesn't answer;
 * anything else isn't agentes.chat. `?found=0` makes discovery find nothing.
 * The server here: `?phase=` (starting, updating, stopped, failing), `?reach=1`, `?back=<version>` (an update
 * went back), `?run=0` (it stopped running here, its data kept), `?usage=0` (usage statistics off),
 * `?tailscale=` (on, off, missing), `?installed=terminal` (one from the terminal; `&claim=1` waits for its owner,
 * `&serving=0` isn't running), `?fail=` (database, start, account, reach: that setup step fails), `?hold=<step>`
 * (setting up stops there). Cancel ends a setup at once, held or not (it rejects with "cancelled", as the app's
 * does). An update downloads in about 1.5 s with its progress, and Cancel drops it.
 */
import { CLOUD_SERVER, isLoopback, readInstance, type ServerCheck } from "@agenteschat/client/lib/server";
import type { Candidate } from "../control/first-run";
import {
  type LocalPhase,
  type LocalServerStatus,
  NO_SERVER,
  type ReachStage,
  type ServeProblem,
  type SetupStep,
  type StepChange,
  setupSteps,
  type Tailnet,
} from "../control/local-server";
import type { LinkInfo } from "../control/pair";
import type { MacPermission, SetupState } from "../control/permissions";
import type { Platform } from "../control/platform";
import type { ServerList, ServerWorkspace, ServerWorkspaces } from "../control/server";
import type { ThisMacRequest } from "../control/this-mac";
import type { TrayState } from "../control/tray";
import { acmeSeed, FAKE_LINKS, FAKE_SERVER, FakeRunner, horizonteSeed } from "../dev/fake-runner";
import { createFakeSite, type FakeSite } from "../dev/fake-site";
import type { AppInfo, Host, RunnerInfo, RunnerStateChange, WindowName } from "./types";

export type Scenario = "first" | "windows" | "linux" | "cloud" | "selfhost" | "link" | "here";
export const SCENARIOS: readonly Scenario[] = ["first", "windows", "linux", "cloud", "selfhost", "link", "here"];

/** The fake server here's options (`?phase=`, `?reach=1`, …, see above). */
export interface HereOptions {
  phase?: LocalPhase;
  reach?: boolean;
  back?: string | null;
  run?: boolean;
  usage?: boolean;
  tailscale?: Tailnet["state"];
  installed?: "terminal";
  claim?: boolean;
  serving?: boolean;
  fail?: SetupStep;
  /** Why reach didn't turn on (`?reason=`; HTTPS off by default). */
  reason?: ServeProblem["reason"];
  hold?: SetupStep;
  /** Each setup step's time in ms (the tests' 10); a little over a second by default. */
  pace?: number;
}

const LOCAL_URL = "http://127.0.0.1:4310";
const TAILNET_URL = "https://ana-mac.tail1234.ts.net";

export interface FakeHost extends Host {
  window: WindowName;
  readonly runners: Map<string, FakeRunner>;
  readonly tray: TrayState;
  readonly list: ServerList;
  /** The server's devices API behind `siteFetch`. */
  readonly site: FakeSite;
  onDev(cb: () => void): () => void;
  setVersion(version: string): void;
  /**
   * This Mac's permissions: Screen Recording, Full Disk Access, the Local Network prompts raised, the setup kept, the
   * panes opened.
   */
  readonly mac: {
    screen: boolean;
    disk: boolean;
    networkAsks: number;
    setup: SetupState | null;
    panes: (MacPermission | "microphone")[];
  };
  /** The site in the main window asks this computer (ADR 0036): resolves with the popover's reply. */
  askThisMac(request: ThisMacRequest): Promise<{ ok: boolean; data: unknown }>;
}

/**
 * The first server's workspaces: the two this computer works for in `selfhost`, and Estúdio Norte, which it doesn't
 * yet. Every other server has Oficina.
 */
const FIRST_ORGS: ServerWorkspace[] = [
  { id: "org_acme", name: "Acme", logo: null, unread: 0, waiting: 0, pair: true },
  { id: "org_horizonte", name: "Horizonte", logo: null, unread: 0, waiting: 0, pair: true },
  { id: "o-norte", name: "Estúdio Norte", logo: null, unread: 3, waiting: 0, pair: true },
];

/** A 14" MacBook Pro's notch. */
const FAKE_NOTCH = { width: 186, height: 32 };
/** A claim link as the setup prints it, for the `link` scenario. */
const CLAIM_LINK = `agenteschat://connect?server=${encodeURIComponent(FAKE_SERVER)}&claim=b3duZXItY2xhaW0tYWJjZGVmZ2hpamtsbW5vcHFy`;

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

/** What each fake server answers to `GET /api/instance` (the host decides); `waits`: the link's server has no owner yet. */
function fakeCheck(server: string, waits: boolean): ServerCheck {
  const host = new URL(server).host;
  if (host === "chat.example.com" || host === "127.0.0.1:4399") return { ok: false, server, problem: "unreachable" };
  if (host === "noowner.tail1234.ts.net") return readInstance(server, instance(server, { ownerClaim: true }));
  if (host === "old.example.com") return readInstance(server, instance(server, { api: 0, minApi: 0 }));
  if (server === FAKE_SERVER || server === CLOUD_SERVER || server === "http://127.0.0.1:4310")
    return readInstance(server, instance(server, waits && server === FAKE_SERVER ? { ownerClaim: true } : {}));
  return readInstance(server, { status: "ok" });
}

export function createFakeHost(
  initial: WindowName,
  scenario: Scenario,
  options: {
    link?: string | null;
    found?: boolean;
    here?: HereOptions;
    someCommands?: boolean;
    welcomeAdd?: boolean;
    /** Screen Recording and Full Disk Access allowed already (`?mac=ready`). */
    macReady?: boolean;
  } = {},
): FakeHost {
  const runners = new Map<string, FakeRunner>();
  const lineListeners = new Set<(homeId: string, line: string) => void>();
  const stateListeners = new Set<(c: RunnerStateChange) => void>();
  const shownListeners = new Set<(n: WindowName) => void>();
  const devListeners = new Set<() => void>();
  const thisMacListeners = new Set<(id: number, request: ThisMacRequest) => void>();
  const thisMacReplies = new Map<number, (reply: { ok: boolean; data: unknown }) => void>();
  let thisMacAsked = 0;
  let signIns = 0;
  /** Servers the app signed out of (`signOutServer`): listed with no workspaces. */
  const signedOut = new Set<string>();
  let tray: TrayState = "idle";
  let autostart = true;
  let version = "0.6.0";
  const platform: Platform = scenario === "windows" ? "windows" : scenario === "linux" ? "linux" : "mac";
  const here = options.here ?? {};
  const tailnet: Tailnet =
    here.tailscale === "missing"
      ? { state: "missing" }
      : here.tailscale === "off"
        ? { state: "off", app: platform === "mac" }
        : { state: "on", device: "ana-mac.tail1234.ts.net" };
  const running = scenario === "here" && here.run !== false;
  let local: LocalServerStatus = {
    ...NO_SERVER,
    bundled: true,
    dir: "/Users/voce/.agentes",
    usage: here.usage !== false,
    ...(scenario === "here"
      ? {
          installed: "app" as const,
          run: running,
          owner: true,
          phase: running ? (here.phase ?? "running") : "off",
          url: LOCAL_URL,
          publicUrl: here.reach ? TAILNET_URL : LOCAL_URL,
          reach: !!here.reach,
          version: "1.4.0",
          backTo: here.back ?? null,
          awake: running,
          backups: {
            nightly: true,
            copyTo: null,
            files: [
              { path: "/Users/voce/.agentes/backups/agentes-2026-10-25-030000.tar.gz", at: Date.UTC(2026, 9, 25, 6) },
            ],
            problem: null,
          },
        }
      : here.installed === "terminal"
        ? {
            installed: "terminal" as const,
            url: LOCAL_URL,
            version: "1.4.0",
            serving: here.serving !== false,
            claim: here.claim && here.serving !== false ? "b3duZXItY2xhaW0tYWJjZGVmZ2hpamtsbW5vcHFy" : null,
          }
        : { systemName: "Ana Souza" }),
  };
  const localListeners = new Set<(s: LocalServerStatus) => void>();
  const stepListeners = new Set<(c: StepChange) => void>();
  const reachListeners = new Set<(s: ReachStage) => void>();
  const sayReach = (stage: ReachStage) => {
    for (const l of reachListeners) l(stage);
  };
  let reachStopped = false;
  const progressListeners = new Set<(got: number, total: number | null) => void>();
  let cancelSetup: (() => void) | null = null;
  let dropUpdate: (() => void) | null = null;
  const setLocal = (next: Partial<LocalServerStatus>) => {
    local = { ...local, ...next };
    for (const l of localListeners) l(local);
    devChanged();
  };
  const list: ServerList =
    scenario === "cloud"
      ? { current: CLOUD_SERVER, servers: [CLOUD_SERVER] }
      : scenario === "selfhost"
        ? { current: FAKE_SERVER, servers: [FAKE_SERVER, CLOUD_SERVER] }
        : running
          ? { current: local.publicUrl, servers: [local.publicUrl ?? LOCAL_URL] }
          : { current: null, servers: [] };
  let link: string | null = options.link ?? (scenario === "link" ? CLAIM_LINK : null);
  const waits = link?.includes("claim=") ?? false;
  const devChanged = () => {
    for (const l of devListeners) l();
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const spawn = (homeId: string, seed: ReturnType<typeof acmeSeed> | null) => {
    const runner = new FakeRunner(
      homeId,
      seed,
      (line) => {
        for (const l of lineListeners) l(homeId, line);
      },
      () => signIns++,
    );
    runners.set(homeId, runner);
    setTimeout(() => {
      runner.start();
      for (const l of stateListeners) l({ homeId, running: true, removed: false });
    }, 30);
  };

  if (scenario === "selfhost") {
    spawn("a1b2c3d4", acmeSeed());
    // `?commands=some`: the second organization joined with commands turned off.
    const horizonte = horizonteSeed();
    if (options.someCommands) horizonte.access.tools.commands = false;
    spawn("e5f6a7b8", horizonte);
    signIns = 2;
  }
  if (running) {
    spawn("0e7c1d2a-0000-4000-8000-000000000001", acmeSeed());
    for (const r of runners.values()) r.server = LOCAL_URL;
    signIns = 1;
  }

  const orgsOf = (i: number): ServerWorkspace[] =>
    i === 0 ? FIRST_ORGS : [{ id: `o-${i}`, name: "Oficina", logo: null, unread: 1, waiting: 0, pair: true }];
  const site = createFakeSite(
    (orgId) => {
      const ids = [...runners.values()].map((r) => r.ids()).find((i) => i?.orgId === orgId);
      return ids ? { machineId: ids.machineId, name: ids.name } : null;
    },
    (orgId, userCode) => {
      const org = list.servers.flatMap((_, i) => orgsOf(i)).find((o) => o.id === orgId);
      const runner = [...runners.values()].find((r) => r.pendingCode === userCode);
      return org && runner ? runner.confirm({ id: org.id, name: org.name }) : null;
    },
  );

  const host: FakeHost = {
    window: initial,
    fake: true,
    platform,
    runners,
    list,
    site,
    get tray() {
      return tray;
    },
    listRunners: async (): Promise<RunnerInfo[]> =>
      [...runners.keys()].map((homeId) => ({
        homeId,
        dir: `/Users/voce/.agentes-runner/orgs/${homeId}`,
        running: true,
        hello: {
          type: "hello",
          control: 1,
          version: "0.1.0",
          protocol: 10,
          home: `/Users/voce/.agentes-runner/orgs/${homeId}`,
        },
      })),
    send: async (homeId, line) => {
      const r = runners.get(homeId);
      if (!r) throw new Error("not running");
      r.handle(line);
    },
    addRunner: async () => {
      const id = Math.random().toString(16).slice(2, 10);
      spawn(id, null);
      return id;
    },
    removeRunner: async (homeId) => {
      runners.get(homeId)?.stop();
      runners.delete(homeId);
      for (const l of stateListeners) l({ homeId, running: false, removed: true });
    },
    onLine: (cb) => {
      lineListeners.add(cb);
      return () => lineListeners.delete(cb);
    },
    onRunnerState: (cb) => {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    onShown: (cb) => {
      shownListeners.add(cb);
      return () => shownListeners.delete(cb);
    },
    openExternal: async (url) => {
      console.info("[fake] open:", url);
    },
    servers: async () => ({ current: list.current, servers: [...list.servers] }),
    chooseServer: async (server, page) => {
      if (!list.servers.includes(server)) list.servers.push(server);
      list.current = server;
      console.info("[fake] main window on", server + (page ?? ""));
      devChanged();
    },
    workspaces: async (): Promise<ServerWorkspaces[]> =>
      list.servers.map((server, i) => ({
        server,
        signedIn: !signedOut.has(server),
        agentsHere: !isLoopback(server),
        orgs: signedOut.has(server) ? [] : orgsOf(i),
      })),
    // The fake reads nothing again by itself: an offer never takes the one window over while designing.
    onWorkspaces: () => () => {},
    pairLinkInfo: async (_server, code): Promise<LinkInfo> => {
      await wait(300);
      if (code !== FAKE_LINKS.live && code !== FAKE_LINKS.denied) throw "link_expired";
      return {
        org: "Estúdio Norte",
        by: "Sam Rivera",
        kind: "computer",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        computer: "Sam's MacBook Pro",
      };
    },
    askToPair: async () => true,
    welcomeMode: async () => (options.welcomeAdd ? "add" : null),
    addWorkspace: async () => {
      options.welcomeAdd = true;
      await host.showWindow("welcome");
    },
    siteFetch: async (server, method, path, body) => {
      if (!list.servers.includes(server)) throw "not a server of this app";
      return site.answer(method, path, body);
    },
    removeServer: async (server) => {
      list.servers = list.servers.filter((s) => s !== server);
      if (list.current === server) list.current = list.servers[0] ?? null;
      devChanged();
    },
    signOutServer: async (server) => {
      signedOut.add(server);
      devChanged();
    },
    discover: async (): Promise<Candidate[]> => {
      await wait(1200);
      if (options.found === false) return [];
      return [
        { server: "http://127.0.0.1:4310", where: "here" },
        { server: FAKE_SERVER, where: "tailnet" },
      ];
    },
    checkServer: async (server) => {
      await wait(700);
      return fakeCheck(server, waits);
    },
    takeLink: async () => {
      const taken = link;
      link = null;
      return taken;
    },
    onLink: () => () => {},
    revealFolder: async (path) => {
      console.info("[fake] show in Finder:", path);
    },
    pickFolder: async () => {
      const picks = ["/Users/voce/Documents/Notas", "/Users/voce/Projects/Personal/site", "/Users/voce/Desktop/Fotos"];
      return picks[Math.floor(Math.random() * picks.length)] ?? null;
    },
    setTrayState: async (state) => {
      if (tray !== state) {
        tray = state;
        devChanged();
      }
    },
    setTrayVisible: async () => {},
    showWindow: async (name) => {
      host.window = name;
      devChanged();
      for (const l of shownListeners) l(name);
    },
    hideWindow: async (name) => {
      console.info("[fake] hide", name);
    },
    quit: async () => {
      console.info("[fake] quit");
    },
    appInfo: async (): Promise<AppInfo> => ({
      version,
      os: platform === "mac" ? "macos" : platform,
      arch: platform === "mac" ? "aarch64" : "x86_64",
      system: platform === "mac" ? "15.5" : null,
      graphics:
        platform === "linux"
          ? "Ubuntu 26.04 LTS · wayland (GNOME) · WebKitGTK 2.50.4 · Intel (i915) · CPU · AppImage"
          : null,
    }),
    autostart: async () => autostart,
    setAutostart: async (on) => {
      autostart = on;
    },
    // No main window in the browser: only tests ask (`askThisMac`).
    onThisMac: (cb) => {
      thisMacListeners.add(cb);
      return () => thisMacListeners.delete(cb);
    },
    thisMacReply: async (id, ok, data) => {
      thisMacReplies.get(id)?.({ ok, data });
      thisMacReplies.delete(id);
    },
    askThisMac: (request) =>
      new Promise((resolve) => {
        const id = ++thisMacAsked;
        thisMacReplies.set(id, resolve);
        for (const l of thisMacListeners) l(id, request);
      }),
    // No menu bar in the browser.
    setAppMenu: async () => {},
    onMenuAction: () => () => {},
    thisMacListening: async () => {},
    setSiteNotify: async () => {},
    onBadge: (cb) => {
      const timer = setTimeout(() => cb({ waiting: 3, unread: 5 }), 50);
      return () => clearTimeout(timer);
    },
    notify: async (title, body) => {
      console.info("[fake] notification:", title, "—", body);
    },
    // Nothing installs in a browser: once downloaded, the manual way.
    installUpdate: () =>
      new Promise<boolean>((resolve, reject) => {
        const total = 48_000_000;
        let got = 0;
        const timer = setInterval(() => {
          got = Math.min(total, got + total / 10);
          for (const l of progressListeners) l(got, total);
          if (got < total) return;
          clearInterval(timer);
          dropUpdate = null;
          setTimeout(() => resolve(false), 300);
        }, 150);
        dropUpdate = () => {
          clearInterval(timer);
          dropUpdate = null;
          reject("cancelled");
        };
      }),
    cancelUpdate: async () => dropUpdate?.(),
    onUpdateProgress: (cb) => {
      progressListeners.add(cb);
      return () => progressListeners.delete(cb);
    },
    setNotch: async (on) => {
      console.info("[fake] notch:", on ? "on" : "off");
    },
    notchInfo: async () => FAKE_NOTCH,
    notchPlace: async () => FAKE_NOTCH,
    resize: async () => {},
    localServer: async () => local,
    onLocalServer: (cb) => {
      localListeners.add(cb);
      return () => localListeners.delete(cb);
    },
    onSetupStep: (cb) => {
      stepListeners.add(cb);
      return () => stepListeners.delete(cb);
    },
    installLocalServer: async (choice) => {
      const say = (change: StepChange) => {
        for (const l of stepListeners) l(change);
      };
      const cancelled = new Promise<never>((_, reject) => {
        cancelSetup = () => reject("cancelled");
      });
      cancelled.catch(() => {});
      for (const step of setupSteps(choice.reach)) {
        say({ step, state: "active" });
        await Promise.race([
          cancelled,
          here.hold === step ? new Promise(() => {}) : wait(here.pace ?? (step === "database" ? 1400 : 800)),
        ]);
        if (step === "reach" && (here.fail === "reach" || tailnet.state !== "on")) {
          const reason: ServeProblem =
            here.reason === "operator" || here.reason === "serve"
              ? { reason: here.reason }
              : { reason: "https", url: null };
          say({ step, state: "warn", reason });
          continue;
        }
        if (here.fail === step) {
          say({ step, state: "failed" });
          throw new Error(step);
        }
        say({ step, state: "done" });
      }
      const reach = choice.reach && tailnet.state === "on" && here.fail !== "reach";
      setLocal({
        installed: "app",
        run: true,
        owner: true,
        phase: "running",
        url: LOCAL_URL,
        publicUrl: reach ? TAILNET_URL : LOCAL_URL,
        reach,
        usage: choice.usage,
        version: "1.4.0",
      });
      cancelSetup = null;
      await host.chooseServer(local.publicUrl ?? LOCAL_URL, "/desktop/handover#token=fake");
    },
    cancelLocalSetup: async () => cancelSetup?.(),
    startLocalServer: async () => {
      setLocal({ run: true, phase: "starting", backTo: null, held: false, heldUntil: null });
      await wait(1200);
      setLocal({ phase: "running" });
    },
    stopLocalServer: async (forget, minutes) => {
      await wait(600);
      setLocal({
        phase: forget ? "off" : "stopped",
        run: !forget,
        held: !forget,
        heldUntil: !forget && minutes ? Date.now() + minutes * 60_000 : null,
      });
      if (forget) await host.removeServer(local.publicUrl ?? LOCAL_URL);
    },
    restartLocalServer: async () => {
      setLocal({ phase: "starting" });
      await wait(1200);
      setLocal({ phase: "running" });
    },
    setLocalReach: async (on) => {
      reachStopped = false;
      if (on) sayReach({ stage: "sharing" });
      await wait(900);
      if (on && tailnet.state !== "on") return { ok: false, problem: { reason: "serve" } };
      if (on && here.fail === "reach") {
        // Tailscale asks for HTTPS to be allowed and waits: until "Stop waiting", or a few seconds as if never allowed.
        sayReach({ stage: "approve", url: "https://login.tailscale.com/f/serve?node=fake" });
        for (let i = 0; i < 40 && !reachStopped; i++) await wait(100);
        return { ok: false, problem: reachStopped ? { reason: "stopped" } : { reason: "https", url: null } };
      }
      sayReach({ stage: "restarting" });
      setLocal({ phase: "starting" });
      await wait(900);
      setLocal({ phase: "running" });
      const url = on ? TAILNET_URL : LOCAL_URL;
      list.servers = list.servers.map((s) => (s === local.publicUrl ? url : s));
      if (list.current === local.publicUrl) list.current = url;
      setLocal({ reach: on, publicUrl: url });
      return { ok: true, url };
    },
    setLocalUsage: async (on) => {
      setLocal({ phase: "starting", usage: on });
      await wait(900);
      setLocal({ phase: "running" });
    },
    backupLocalServer: async () => {
      await wait(1100);
      const path = "/Users/voce/.agentes/backups/agentes-2026-10-25-101500.tar.gz";
      setLocal({
        backups: { ...local.backups, files: [{ path, at: Date.now() }, ...local.backups.files].slice(0, 2) },
      });
      return path;
    },
    setLocalBackups: async (nightly, copyTo) => {
      setLocal({ backups: { ...local.backups, nightly, copyTo } });
    },
    restoreLocalServer: async () => {
      setLocal({ phase: "starting" });
      await wait(1500);
      setLocal({ phase: "running" });
    },
    keepRunning: async () => ({ autoLogin: false, autoRestart: false }),
    openSystemSettings: async (page) => {
      console.info("[fake] open System Settings:", page);
    },
    localDiagnostics: async () => `agentes.chat app ${version} (macos aarch64)\nserver here: ${local.phase}`,
    syncLocalHomes: async () => {},
    onLocalReach: (cb) => {
      reachListeners.add(cb);
      return () => reachListeners.delete(cb);
    },
    stopLocalReach: async () => {
      reachStopped = true;
    },
    tailscale: async () => tailnet,
    openTailscale: async (page) => {
      console.info("[fake] open Tailscale:", page);
    },
    onNewHostHome: () => () => {},
    // Screen Recording and Full Disk Access take effect once the app opens again, as on a Mac.
    mac: {
      screen: options.macReady === true,
      disk: options.macReady === true,
      networkAsks: 0,
      setup: null,
      panes: [],
    },
    screenAccess: async () => platform !== "mac" || host.mac.screen,
    requestScreenAccess: async () => host.mac.screen,
    diskAccess: async () => platform !== "mac" || host.mac.disk,
    askLocalNetwork: async () => {
      host.mac.networkAsks++;
    },
    openPrivacy: async (pane) => {
      host.mac.panes.push(pane);
    },
    setupState: async () => host.mac.setup,
    setSetupState: async (state) => {
      host.mac.setup = state && { ...state, resumed: false };
    },
    onDev: (cb) => {
      devListeners.add(cb);
      return () => devListeners.delete(cb);
    },
    setVersion: (v) => {
      version = v;
    },
  };
  return host;
}
