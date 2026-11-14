import type { ServerCheck } from "@agenteschat/client/lib/server";
import type { HelloLine } from "../control/client";
import type { Candidate } from "../control/first-run";
import type {
  KeepRunning,
  LocalChoice,
  LocalServerStatus,
  ReachResult,
  ReachStage,
  StepChange,
  Tailnet,
} from "../control/local-server";
import type { LinkInfo } from "../control/pair";
import type { MacPermission, SetupState } from "../control/permissions";
import type { Platform } from "../control/platform";
import type { ServerList, ServerWorkspaces } from "../control/server";
import type { ThisMacRequest } from "../control/this-mac";
import type { TrayState } from "../control/tray";

/** The app's windows (Tauri labels). */
export type WindowName = "popover" | "welcome" | "prefs" | "notch";
export const WINDOW_NAMES: readonly WindowName[] = ["popover", "welcome", "prefs", "notch"];

/** One organization home and its runner child, as the Rust side knows it. */
export interface RunnerInfo {
  homeId: string;
  dir: string;
  running: boolean;
  hello: HelloLine | null;
}

export interface RunnerStateChange {
  homeId: string;
  running: boolean;
  /** The home was deleted (left the organization). */
  removed: boolean;
}

/** The MacBook's notch, in points. */
export interface NotchInfo {
  width: number;
  height: number;
}

export interface AppInfo {
  version: string;
  /** Rust's name: `macos`, `windows` or `linux`. */
  os: string;
  /** Rust's name: `aarch64` or `x86_64`. */
  arch: string;
  /** The system's own version where the app reads it (macOS: `15.1`). */
  system?: string | null;
  /** Linux: how it draws the app, one line to copy ("Ubuntu 26.04 LTS · wayland (GNOME) · WebKitGTK 2.50.4 · …"). */
  graphics?: string | null;
}

/** A server's answer to `siteFetch`: its status and body as text. */
export interface SiteAnswer {
  status: number;
  body: string;
}

/** What the site last put on the Dock's badge (`this_mac` `badge`). */
export interface BadgeCounts {
  waiting: number;
  unread: number;
}

/**
 * What the web view may ask of the app around it: the Tauri shell in the real app, an in-browser fake
 * in development (`bun run dev`). Nothing here reaches the file system or a shell beyond these calls.
 */
export interface Host {
  readonly window: WindowName;
  /** The in-browser fake (design work), not the real app. */
  readonly fake: boolean;
  /** This computer's system: the copy's `{{device}}` and each system's own ways (tray, title bar). */
  readonly platform: Platform;
  listRunners(): Promise<RunnerInfo[]>;
  send(homeId: string, line: string): Promise<void>;
  /** A new, empty organization home with its runner started; resolves with its id. */
  addRunner(): Promise<string>;
  /** Stops the home's runner and deletes the home (the agents' folders stay). */
  removeRunner(homeId: string): Promise<void>;
  onLine(cb: (homeId: string, line: string) => void): () => void;
  onRunnerState(cb: (change: RunnerStateChange) => void): () => void;
  /** A window was brought up (`show_window`). */
  onShown(cb: (name: WindowName) => void): () => void;
  /**
   * A page of a server this app opens goes to the main window (switching to that server); a provider's
   * sign-in page opens in the person's browser. Nothing else opens.
   */
  openExternal(url: string): Promise<void>;
  /** The servers this app opens, and the one open now (`servers.json`). */
  servers(): Promise<ServerList>;
  /**
   * Opens the main window on `server`, which joins the list and becomes the one open now; on `page` when
   * given (`/login`, `/signup`, a link's handover or owner page).
   */
  chooseServer(server: string, page?: string): Promise<void>;
  /** Every server's workspaces, as the app last read them with each one's session (ADR 0154). */
  workspaces(): Promise<ServerWorkspaces[]>;
  /** The app read the workspaces again and something changed. */
  onWorkspaces(cb: () => void): () => void;
  /**
   * A pair link's workspace and maker, asked of its server by the app without a session (the welcome window only);
   * rejects with `link_expired` (unknown, used or expired) or `unreachable`.
   */
  pairLinkInfo(server: string, code: string): Promise<LinkInfo>;
  /** The system's own dialog before Preferences pairs this computer with `org` on `server`: false when declined. */
  askToPair(server: string, org: string): Promise<boolean>;
  /**
   * One request to a server of the app's list with the main window's session there (Preferences and the welcome
   * window): this computer's devices, who can use them, a phone's Stop and confirming this computer's own pairing
   * code (`site_fetch` in workspaces.rs allows only those).
   */
  siteFetch(server: string, method: string, path: string, body?: string): Promise<SiteAnswer>;
  /** How the welcome window opens, taken once: `add` from the site's "Add a workspace", else null. */
  welcomeMode(): Promise<"add" | null>;
  /** The welcome window in its adding mode ("Add a workspace", from Preferences). */
  addWorkspace(): Promise<void>;
  /** Takes `server` out of the list (the server and the account there stay as they are). */
  removeServer(server: string): Promise<void>;
  /** Signs the app out of `server`, which stays in the list (signed out); a window on it goes to its sign-in. */
  signOutServer(server: string): Promise<void>;
  /** Where a server may be: this computer and the person's Tailscale network, not checked yet. */
  discover(): Promise<Candidate[]>;
  /** Whether `server` is an agentes.chat server this app can use (`GET /api/instance`). */
  checkServer(server: string): Promise<ServerCheck>;
  /** The connect link (`agenteschat://connect…`) waiting for an answer, taken once; null when none. */
  takeLink(): Promise<string | null>;
  /** A connect link arrived (the welcome window takes it). */
  onLink(cb: () => void): () => void;
  /** Shows a local folder in Finder. */
  revealFolder(path: string): Promise<void>;
  pickFolder(): Promise<string | null>;
  setTrayState(state: TrayState): Promise<void>;
  /** The menu bar icon on a Mac (Windows and Linux always keep theirs, `tray.rs`). */
  setTrayVisible(show: boolean): Promise<void>;
  showWindow(name: WindowName): Promise<void>;
  hideWindow(name: WindowName): Promise<void>;
  quit(): Promise<void>;
  appInfo(): Promise<AppInfo>;
  autostart(): Promise<boolean>;
  setAutostart(on: boolean): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  /**
   * Downloads the newer version (its progress at `onUpdateProgress`), installs it and relaunches the app; false when
   * there is nothing to install. Rejects with "cancelled" after `cancelUpdate`.
   */
  installUpdate(): Promise<boolean>;
  /** Drops the download under way: nothing is installed until it is whole. */
  cancelUpdate(): Promise<void>;
  /** The download's bytes so far, and its size when the server says it. */
  onUpdateProgress(cb: (got: number, total: number | null) => void): () => void;
  /** Creates (on) or destroys (off) the notch window. */
  setNotch(on: boolean): Promise<void>;
  /** The notch of this Mac's screen; null without one (an external display alone). */
  notchInfo(): Promise<NotchInfo | null>;
  /** Sizes and shows the notch window over the notch (0 × 0 hides it); null when there's no notch. */
  notchPlace(width: number, height: number): Promise<NotchInfo | null>;
  /** The current window's size in points (the popover follows its content). */
  resize(width: number, height: number): Promise<void>;
  /** The site in the main window asking this computer (the popover answers, `this_mac` in main_window.rs). */
  onThisMac(cb: (id: number, request: ThisMacRequest) => void): () => void;
  thisMacReply(id: number, ok: boolean, data: unknown): Promise<void>;
  /**
   * The menu bar's labels, the tray menu's on Windows and Linux and the pairing dialog's, in the app's
   * language (only the popover sets them; `app_menu_set` in menus.rs).
   */
  setAppMenu(labels: Record<string, string>): Promise<void>;
  /** A menu choice the popover owns (`menu://action`). */
  onMenuAction(cb: (action: MenuAction) => void): () => void;
  /** The popover listens for the site's requests now (requests sent before that wait, main_window.rs). */
  thisMacListening(): Promise<void>;
  /** Preferences › "Let me know about messages and requests": whether the site's notifications show. */
  setSiteNotify(on: boolean): Promise<void>;
  /** The Dock's counts whenever the site changes them. */
  onBadge(cb: (counts: BadgeCounts) => void): () => void;
  /** The server here (`local_server.rs`): whether this build carries it, what `~/.agentes` holds, its state. */
  localServer(): Promise<LocalServerStatus>;
  onLocalServer(cb: (status: LocalServerStatus) => void): () => void;
  /**
   * "Run agentes.chat on this computer": sets it up, starts it, makes the owner, makes this computer its agents'
   * computer, turns reach on when asked, and opens the main window there, signed in. Rejects with the step that
   * failed, or "cancelled" after `cancelLocalSetup`; each step's progress arrives at `onSetupStep`.
   */
  installLocalServer(choice: LocalChoice): Promise<void>;
  /** Cancel while it is set up: what it started stops and the database it made goes, then it rejects. */
  cancelLocalSetup(): Promise<void>;
  onSetupStep(cb: (change: StepChange) => void): () => void;
  startLocalServer(): Promise<void>;
  /**
   * Stops it, and it stays stopped (also when the app opens again) until Start, or for `minutes` and then it starts
   * by itself. `forget`: the app no longer runs it here (its data stays).
   */
  stopLocalServer(forget: boolean, minutes?: number): Promise<void>;
  restartLocalServer(): Promise<void>;
  /** Reach from the person's other devices (Tailscale), on or off; the main window follows the address. */
  setLocalReach(on: boolean): Promise<ReachResult>;
  /** What `setLocalReach` is doing while it takes. */
  onLocalReach(cb: (stage: ReachStage) => void): () => void;
  /** Stops waiting for HTTPS to be allowed in the tailnet (`setLocalReach` then answers `stopped`). */
  stopLocalReach(): Promise<void>;
  /** The usage-statistics switch (`TELEMETRY` in its settings; it starts again). */
  setLocalUsage(on: boolean): Promise<void>;
  /** "Back up now": the file it wrote. */
  backupLocalServer(): Promise<string>;
  /** The nightly backup's switch and the "Copy to" folder (null: none). */
  setLocalBackups(nightly: boolean, copyTo: string | null): Promise<void>;
  /** The server here goes back to one of its backups; rejects with `start` when that backup didn't start. */
  restoreLocalServer(file: string): Promise<void>;
  /** Automatic login and start after a power failure (macOS). */
  keepRunning(): Promise<KeepRunning>;
  /** System Settings at Users & Groups or Energy (macOS). */
  openSystemSettings(page: "users" | "energy"): Promise<void>;
  /** What "Copy details" copies. */
  localDiagnostics(): Promise<string>;
  /** The server here's homes again, with new tokens for the organizations in `rotate`. */
  syncLocalHomes(rotate: string[]): Promise<void>;
  /** Tailscale on this computer. */
  tailscale(): Promise<Tailnet>;
  /** Tailscale's app (a Mac), its download page, or the admin page where HTTPS is turned on. */
  openTailscale(page: "app" | "download" | "https"): Promise<void>;
  /** A home the server here's sync just made (its first tools go on, `firstTools`). */
  onNewHostHome(cb: (homeId: string) => void): () => void;
  /** macOS: whether the app may record the screen (asks nothing). True elsewhere. */
  screenAccess(): Promise<boolean>;
  /** macOS: the system's Screen Recording prompt, the first time; it takes effect once the app opens again. */
  requestScreenAccess(): Promise<boolean>;
  /** macOS: whether the app has Full Disk Access (asks nothing, and no prompt can ask for it). True elsewhere. */
  diskAccess(): Promise<boolean>;
  /** macOS: a short Bonjour browse, which raises the Local Network prompt the first time. Nothing says the answer. */
  askLocalNetwork(): Promise<void>;
  /** System Settings › Privacy & Security on the permission's own list (the microphone: for voice messages). */
  openPrivacy(pane: MacPermission | "microphone"): Promise<void>;
  /** The setup macOS may quit the app in the middle of, kept until it is finished (`prepare.rs`). */
  setupState(): Promise<SetupState | null>;
  /** Keeps it (with the main window's page, to open there again) or, null, forgets it. */
  setSetupState(state: SetupState | null): Promise<void>;
}

export type MenuAction =
  | "updates"
  | "quit"
  | "requests"
  | "thisMac"
  | "servers"
  | "pause1h"
  | "pauseTomorrow"
  | "pauseManual"
  | "resume"
  // The Mac's Servers › this computer's server › Restart (menus.rs `here_menu`).
  | "hereRestart";
