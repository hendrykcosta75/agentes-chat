import { checkServer } from "@agenteschat/client/lib/server";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Candidate } from "../control/first-run";
import type {
  KeepRunning,
  LocalServerStatus,
  ReachResult,
  ReachStage,
  StepChange,
  Tailnet,
} from "../control/local-server";
import type { LinkInfo } from "../control/pair";
import type { SetupState } from "../control/permissions";
import { platformOf } from "../control/platform";
import type { ServerList, ServerWorkspaces } from "../control/server";
import type { ThisMacRequest } from "../control/this-mac";
import type { TrayState } from "../control/tray";
import {
  type AppInfo,
  type BadgeCounts,
  type Host,
  type MenuAction,
  type NotchInfo,
  type RunnerInfo,
  type RunnerStateChange,
  type SiteAnswer,
  WINDOW_NAMES,
  type WindowName,
} from "./types";

/** Tauri's `listen` is async; this returns a plain unsubscribe that also works before it resolves. */
function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  let off: UnlistenFn | null = null;
  let stopped = false;
  void listen<T>(event, (e) => cb(e.payload)).then((fn) => {
    if (stopped) fn();
    else off = fn;
  });
  return () => {
    stopped = true;
    off?.();
  };
}

/** Running inside the Tauri shell (not a plain browser). */
export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function createTauriHost(): Host {
  const label = getCurrentWindow().label;
  const name: WindowName = (WINDOW_NAMES as readonly string[]).includes(label) ? (label as WindowName) : "popover";
  return {
    window: name,
    fake: false,
    platform: platformOf(navigator.userAgent),
    listRunners: () => invoke<RunnerInfo[]>("runners_list"),
    send: (homeId, line) => invoke<void>("runner_send", { homeId, line }),
    addRunner: () => invoke<string>("runner_add"),
    removeRunner: (homeId) => invoke<void>("runner_remove", { homeId }),
    onLine: (cb) => subscribe<{ homeId: string; line: string }>("runner://line", (p) => cb(p.homeId, p.line)),
    onRunnerState: (cb) => subscribe<RunnerStateChange>("runner://state", cb),
    onShown: (cb) => subscribe<WindowName>("window://shown", cb),
    openExternal: (url) => invoke<void>("open_external", { url }),
    servers: () => invoke<ServerList>("servers_get"),
    chooseServer: (server, page) => invoke<void>("server_choose", { server, page: page ?? null }),
    removeServer: (server) => invoke<void>("server_remove", { server }),
    signOutServer: (server) => invoke<void>("server_sign_out", { server }),
    workspaces: () => invoke<ServerWorkspaces[]>("workspaces_get"),
    onWorkspaces: (cb) => subscribe<null>("workspaces://changed", () => cb()),
    pairLinkInfo: (server, code) => invoke<LinkInfo>("pair_link_info", { server, code }),
    askToPair: (server, org) => invoke<boolean>("pair_ask", { server, org }),
    siteFetch: (server, method, path, body) =>
      invoke<SiteAnswer>("site_fetch", { server, method, path, body: body ?? null }),
    welcomeMode: () => invoke<string | null>("welcome_mode_take").then((m) => (m === "add" ? "add" : null)),
    addWorkspace: () => invoke<void>("welcome_add"),
    discover: () => invoke<Candidate[]>("discover"),
    // From the web view itself: every server answers `/api/instance` to any origin (it is public).
    checkServer: (server) => checkServer(server),
    takeLink: () => invoke<string | null>("link_take"),
    onLink: (cb) => subscribe<null>("link://pending", () => cb()),
    revealFolder: (path) => invoke<void>("reveal_folder", { path }),
    pickFolder: () => invoke<string | null>("pick_folder"),
    setTrayState: (state: TrayState) => invoke<void>("set_tray_state", { state }),
    setTrayVisible: (show) => invoke<void>("tray_visible", { show }),
    showWindow: (w) => invoke<void>("show_window", { name: w }),
    hideWindow: (w) => invoke<void>("hide_window", { name: w }),
    quit: () => invoke<void>("quit_app"),
    appInfo: () => invoke<AppInfo>("app_info"),
    autostart: () => invoke<boolean>("autostart_get"),
    setAutostart: (on) => invoke<void>("autostart_set", { on }),
    notify: (title, body) => invoke<void>("notify", { title, body }),
    installUpdate: () => invoke<boolean>("update_install"),
    cancelUpdate: () => invoke<void>("update_cancel"),
    onUpdateProgress: (cb) => subscribe<[number, number | null]>("update://progress", ([got, total]) => cb(got, total)),
    setNotch: (on) => invoke<void>("notch_set", { on }),
    notchInfo: () => invoke<NotchInfo | null>("notch_info"),
    notchPlace: (width, height) => invoke<NotchInfo | null>("notch_place", { width, height }),
    resize: (width, height) => getCurrentWindow().setSize(new LogicalSize(width, height)),
    onThisMac: (cb) =>
      subscribe<{ id: number; request: ThisMacRequest }>("this-mac://request", (p) => cb(p.id, p.request)),
    thisMacReply: (id, ok, data) => invoke<void>("this_mac_reply", { id, ok, data }),
    setAppMenu: (labels) => invoke<void>("app_menu_set", { labels }),
    onMenuAction: (cb) => subscribe<MenuAction>("menu://action", cb),
    thisMacListening: () => invoke<void>("this_mac_listening"),
    setSiteNotify: (on) => invoke<void>("notify_site_set", { on }),
    onBadge: (cb) => subscribe<BadgeCounts>("badge://counts", cb),
    localServer: () => invoke<LocalServerStatus>("local_server_status"),
    onLocalServer: (cb) => subscribe<LocalServerStatus>("local-server://status", cb),
    installLocalServer: (choice) => invoke<void>("local_server_install", { choice }),
    cancelLocalSetup: () => invoke<void>("local_server_cancel"),
    onSetupStep: (cb) => subscribe<StepChange>("local-server://step", cb),
    startLocalServer: () => invoke<void>("local_server_start"),
    stopLocalServer: (forget, minutes) => invoke<void>("local_server_stop", { forget, minutes: minutes ?? null }),
    restartLocalServer: () => invoke<void>("local_server_restart"),
    setLocalReach: (on) => invoke<ReachResult>("local_server_reach", { on }),
    onLocalReach: (cb) => subscribe<ReachStage>("local-server://reach", cb),
    stopLocalReach: () => invoke<void>("local_server_reach_stop"),
    setLocalUsage: (on) => invoke<void>("local_server_usage", { on }),
    backupLocalServer: () => invoke<string>("local_server_backup"),
    setLocalBackups: (nightly, copyTo) => invoke<void>("local_server_backups_set", { nightly, copyTo }),
    restoreLocalServer: (file) => invoke<void>("local_server_restore", { file }),
    keepRunning: () => invoke<KeepRunning>("keep_running"),
    openSystemSettings: (page) => invoke<void>("open_system_settings", { page }),
    localDiagnostics: () => invoke<string>("local_server_diagnostics"),
    syncLocalHomes: (rotate) => invoke<void>("local_server_sync", { rotate }),
    tailscale: () => invoke<Tailnet>("tailscale_status"),
    openTailscale: (page) => invoke<void>("tailscale_open", { page }),
    onNewHostHome: (cb) => subscribe<string>("host://new", cb),
    screenAccess: () => invoke<boolean>("screen_access"),
    requestScreenAccess: () => invoke<boolean>("screen_request"),
    diskAccess: () => invoke<boolean>("disk_access"),
    askLocalNetwork: () => invoke<void>("network_ask"),
    openPrivacy: (pane) => invoke<void>("privacy_open", { pane }),
    setupState: () => invoke<SetupState | null>("setup_state_get"),
    setSetupState: (state) => invoke<void>("setup_state_set", { state }),
  };
}
