//! agentes.chat for macOS, Windows and Linux: the main window on the server open now (agentes.chat or a
//! server of the person's own, `servers`), the welcome window that finds one, and, only while agents work on
//! this computer for a server of the person's own, the runners it spawns (one per organization), the menu bar
//! popover and Preferences' tabs for this computer. On every system it can also run agentes.chat itself, as
//! its child (`local_server`, with this computer as its agents' computer, `host_sync`). Rust stays thin:
//! windows, the tray, the server list, links, the children, single instance, start at login, notifications,
//! native dialogs and self-update. Everything else lives in the runner and the server (TypeScript) and in the
//! web view.

mod app_icon;
mod cover;
mod deep_link;
mod discover;
mod dock;
mod graphics;
mod host_sync;
mod local_server;
mod main_window;
mod menus;
mod notch;
mod prepare;
mod runners;
mod servers;
mod tailscale;
mod tray;
mod window_state;
mod workspaces;

use std::io::{self, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, RunEvent, Url, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_positioner::{Position, WindowExt};
use tauri_plugin_updater::UpdaterExt;

use runners::{RunnerInfo, Runners};

const WINDOWS: &[&str] = &["popover", "welcome", "prefs"];

/// When the popover last hid because it lost focus: a click on the tray icon blurs it first,
/// and that same click must not open it again.
struct PopoverClock(Mutex<Option<Instant>>);

#[derive(Serialize)]
struct AppInfo {
    version: String,
    os: &'static str,
    arch: &'static str,
    /// The system's own version where it is read (macOS: `15.1`).
    system: Option<String>,
    /// How Linux draws the app, the line people copy (graphics.rs).
    graphics: Option<String>,
}

/// The providers' own sign-in pages the runner gets from `claude auth login` / `codex login --device-auth`
/// (ADR 0041): the account dialog's "Open the link" when the browser didn't open by itself.
fn is_sign_in_url(url: &str) -> bool {
    const PREFIXES: &[&str] = &[
        "https://claude.com/cai/oauth/authorize?",
        "https://claude.ai/oauth/authorize?",
        "https://auth.openai.com/codex/device",
    ];
    PREFIXES.iter().any(|p| url.starts_with(p))
}

/// The app's own builds ("Download version …" in Updates), whichever server it opens.
fn is_app_download(url: &str) -> bool {
    url.starts_with("https://app.agentes.chat/api/desktop/download/")
}

/// The help pages on the docs site ("Which one to choose?", "How folders work"), whichever server it opens:
/// `https://agentes.chat/docs/<page>`, or under a language folder (`/pt/docs/<page>`).
fn is_help_page(url: &str) -> bool {
    let Some(path) = url.strip_prefix("https://agentes.chat/") else {
        return false;
    };
    let path = match path.split_once('/') {
        Some((lang, rest)) if lang.len() == 2 && lang.bytes().all(|b| b.is_ascii_lowercase()) => rest,
        _ => path,
    };
    path.starts_with("docs/")
}

pub(crate) fn present(app: &AppHandle, name: &str) -> Result<(), String> {
    if !WINDOWS.contains(&name) {
        return Err(format!("unknown window: {name}"));
    }
    let window = match app.get_webview_window(name) {
        Some(window) => window,
        None => make_window(app, name)?,
    };
    if name == "popover" {
        // Right under the menu bar icon.
        let _ = window.move_window(Position::TrayCenter);
    }
    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    let _ = app.emit("window://shown", name);
    Ok(())
}

/// Welcome and Preferences are made when they open and go when they close (`"create": false` in
/// tauri.conf.json): each is a whole web view, kept alive for nothing otherwise.
const MADE_ON_OPEN: &[&str] = &["welcome", "prefs"];

fn make_window(app: &AppHandle, name: &str) -> Result<tauri::WebviewWindow, String> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == name)
        .ok_or("window not found")?
        .clone();
    let window = tauri::WebviewWindowBuilder::from_config(app, &config)
        .and_then(|b| b.build())
        .map_err(|e| e.to_string())?;
    // On Windows and Linux a new window starts with the bundle's icon: the person's pick (ADR 0179).
    app_icon::show(app);
    // Named in the app's language (the Dock's list, the Window menu): never a second "agentes.chat".
    let key = match name {
        "welcome" => Some("windowWelcome"),
        "prefs" => Some("windowPrefs"),
        _ => None,
    };
    if let Some(title) = key.and_then(|k| menus::labels(app).get(k).cloned()) {
        let _ = window.set_title(&title);
    }
    Ok(window)
}

/// A panel (the menu bar's popover, the notch's island) stays out of the Window menu and the Dock's list of
/// windows: only the app's real windows are listed there, each by its own name.
#[cfg(target_os = "macos")]
pub(crate) fn keep_out_of_window_list(ns_window: *mut std::ffi::c_void) {
    use objc2::{msg_send, runtime::AnyObject};
    // SAFETY: an NSWindow pointer from Tauri, used on the main thread.
    unsafe {
        if let Some(w) = (ns_window as *mut AnyObject).as_ref() {
            let _: () = msg_send![w, setExcludedFromWindowsMenu: true];
        }
    }
}

/// The launch argument start at login passes, so a login start stays in the menu bar.
const AUTOSTART_ARG: &str = "--autostart";

/// "Open the app": the main window on the server open now, or the first run while there is none. A setup whose
/// window was closed comes back where it is (still running, or on the step that failed).
pub(crate) fn open_app(app: &AppHandle) {
    let hidden_setup = app.get_webview_window("welcome").is_some_and(|w| !w.is_visible().unwrap_or(true));
    if servers::current(app).is_some() && !hidden_setup {
        let _ = main_window::open(app, None);
    } else {
        let _ = present(app, "welcome");
    }
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(crate) fn toggle_popover(app: &AppHandle) {
    let Some(window) = app.get_webview_window("popover") else { return };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let clock = app.state::<PopoverClock>();
    let just_hid = clock
        .0
        .lock()
        .ok()
        .and_then(|at| *at)
        .map(|at| at.elapsed() < Duration::from_millis(300))
        .unwrap_or(false);
    if !just_hid {
        let _ = present(app, "popover");
    }
}

/// The children finish their work: every runner gets `shutdown` and a few seconds, and the server here
/// drains (at most 25 s), side by side.
fn stop_children(app: &AppHandle) {
    let server = {
        let app = app.clone();
        std::thread::spawn(move || local_server::shutdown(&app))
    };
    app.state::<Runners>().shutdown_all();
    let _ = server.join();
}

/// A program the app starts opens no console window of its own on Windows (the runner, the server and the
/// tools they call are console programs, and the app has no console to lend them). Nothing elsewhere.
pub(crate) fn no_console(command: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// How a program the app waited on ended: its exit code (None when the app ended it), what it printed (1 MB of
/// each at most), and why the app ended it, if it did.
pub(crate) struct Ran {
    pub code: Option<i32>,
    pub out: String,
    pub err: String,
    pub cut: Option<Cut>,
}

#[derive(Debug, PartialEq)]
pub(crate) enum Cut {
    /// It ran past its limit.
    TooLong,
    /// Cancel, or the app quitting.
    Stopped,
}

/// What `run_watched` does next, from what the program printed so far.
pub(crate) enum Watch {
    /// Keeps waiting, up to the wait it was given.
    Wait,
    /// Keeps waiting, up to this long from its start.
    WaitUpTo(Duration),
    /// Ends it now (`Cut::Stopped`).
    Stop,
}

/// The one way the app waits on a program (Tailscale, the server's `migrate` and database moves, `host --once`):
/// until it ends, `wait` passes or `stop` says so, checked every 50 ms; a cut kills it. Its output is read while
/// it runs: a pipe holds 64 KB, and `tailscale status --json` on a large tailnet prints more, so a reader after
/// the exit would never see it end. A program it started that outlives it keeps the pipes open until it ends too.
pub(crate) fn run_program(command: &mut Command, wait: Duration, stop: &dyn Fn() -> bool) -> io::Result<Ran> {
    run_watched(command, wait, &mut |_| if stop() { Watch::Stop } else { Watch::Wait })
}

/// `run_program`, with `watch` asked every 50 ms, given what the program printed so far (both outputs, as they
/// came), whether to wait longer or end it: `tailscale serve` names the page for allowing HTTPS and then waits
/// there until it is allowed.
pub(crate) fn run_watched(
    command: &mut Command,
    wait: Duration,
    watch: &mut dyn FnMut(&str) -> Watch,
) -> io::Result<Ran> {
    let mut child = no_console(command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let (sent, arrived) = mpsc::channel::<Vec<u8>>();
    let reader = |pipe: Option<Box<dyn Read + Send>>, sent: mpsc::Sender<Vec<u8>>| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            if let Some(pipe) = pipe {
                let mut pipe = pipe.take(1024 * 1024);
                let mut chunk = [0u8; 8192];
                loop {
                    match pipe.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(n) => {
                            bytes.extend_from_slice(&chunk[..n]);
                            let _ = sent.send(chunk[..n].to_vec());
                        }
                        Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
                        Err(_) => break,
                    }
                }
            }
            String::from_utf8_lossy(&bytes).into_owned()
        })
    };
    let out = reader(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>), sent.clone());
    let err = reader(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>), sent);
    let started = Instant::now();
    let mut so_far = String::new();
    let (code, cut) = loop {
        while let Ok(chunk) = arrived.try_recv() {
            so_far.push_str(&String::from_utf8_lossy(&chunk));
        }
        let cut = match child.try_wait() {
            Ok(Some(status)) => break (status.code(), None),
            Ok(None) => match watch(&so_far) {
                Watch::Stop => Cut::Stopped,
                Watch::Wait if started.elapsed() <= wait => {
                    std::thread::sleep(Duration::from_millis(50));
                    continue;
                }
                Watch::WaitUpTo(longer) if started.elapsed() <= wait.max(longer) => {
                    std::thread::sleep(Duration::from_millis(50));
                    continue;
                }
                _ => Cut::TooLong,
            },
            // It can't be asked.
            Err(_) => Cut::TooLong,
        };
        let _ = child.kill();
        let _ = child.wait();
        break (None, Some(cut));
    };
    Ok(Ran { code, out: out.join().unwrap_or_default(), err: err.join().unwrap_or_default(), cut })
}

/// Graceful quit: the children stop, then the app exits.
fn begin_quit(app: AppHandle) {
    let runners = app.state::<Runners>();
    if runners.is_quitting() {
        return;
    }
    if let Some(window) = app.get_window(main_window::LABEL) {
        window_state::remember(&window, false);
    }
    for name in WINDOWS.iter().chain([&main_window::LABEL, &notch::LABEL]) {
        if let Some(window) = app.get_window(name) {
            let _ = window.hide();
        }
    }
    std::thread::spawn(move || {
        stop_children(&app);
        app.exit(0);
    });
}

#[tauri::command]
fn runners_list(runners: tauri::State<'_, Runners>) -> Vec<RunnerInfo> {
    runners.list()
}

#[tauri::command]
fn runner_send(runners: tauri::State<'_, Runners>, home_id: String, line: String) -> Result<(), String> {
    runners.send(&home_id, &line)
}

#[tauri::command]
fn runner_add(app: AppHandle, runners: tauri::State<'_, Runners>) -> Result<String, String> {
    runners.add(&app)
}

#[tauri::command]
async fn runner_remove(app: AppHandle, home_id: String) -> Result<(), String> {
    // Stopping waits for the runner to finish: off the main thread.
    tauri::async_runtime::spawn_blocking(move || app.state::<Runners>().remove(&app, &home_id))
        .await
        .map_err(|e| e.to_string())?
}

/// A page of a server this app opens goes to the main window, on that server; a provider's sign-in page, the
/// app's own downloads and the help pages open in the person's browser. Nothing else. Async, as every command
/// that may make a window (`server_choose`).
#[tauri::command]
async fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if url.len() > 4096 || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("not a link the app opens".into());
    }
    if is_sign_in_url(&url) || is_app_download(&url) || is_help_page(&url) {
        return app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string());
    }
    let page: Url = url.parse().map_err(|_| "not a URL")?;
    main_window::show_url(&app, page)
}

#[tauri::command]
fn reveal_folder(app: AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.is_absolute() || !p.is_dir() {
        return Err("not a folder".into());
    }
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    let picked = app.dialog().file().blocking_pick_folder()?;
    picked.into_path().ok().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn set_tray_state(app: AppHandle, state: String) -> Result<(), String> {
    tray::set_state(&app, &state)
}

/// Async: Welcome and Preferences are made here (`server_choose`).
#[tauri::command]
async fn show_window(app: AppHandle, name: String) -> Result<(), String> {
    present(&app, &name)
}

#[tauri::command]
fn hide_window(app: AppHandle, name: String) -> Result<(), String> {
    if !WINDOWS.contains(&name.as_str()) {
        return Err(format!("unknown window: {name}"));
    }
    let Some(window) = app.get_webview_window(&name) else { return Ok(()) };
    if MADE_ON_OPEN.contains(&name.as_str()) {
        // `destroy` skips CloseRequested, where a setup on screen ends with its window.
        prepare::closed(&app, &name);
        window.destroy().map_err(|e| e.to_string())?;
    } else {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    begin_quit(app);
}

#[tauri::command]
fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        system: prepare::system_version(),
        graphics: graphics::system().map(|s| s.line()),
    }
}

#[tauri::command]
fn autostart_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn autostart_set(app: AppHandle, on: bool) -> Result<(), String> {
    let launcher = app.autolaunch();
    let result = if on { launcher.enable() } else { launcher.disable() };
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

/// The update being checked for or downloaded now: Cancel drops it (nothing is installed until it is whole).
#[derive(Default)]
struct UpdateDownload(Mutex<Option<Box<dyn Fn() + Send>>>);

const UPDATE_PROGRESS_EVENT: &str = "update://progress";

/// Downloads the newer version, with its progress to Preferences, then installs it (signed with the key built
/// into the app, checked by the plugin), stops the runners and relaunches. `false`: nothing newer to install.
/// Err "cancelled": Cancel dropped the check or the download.
#[tauri::command]
async fn update_install(app: AppHandle) -> Result<bool, String> {
    // Windows runs the installer and ends the app at once, and the installer can't replace the files of a
    // runner or a server still running: they stop first there (then the plugin's own cleanup, which this
    // replaces).
    let before_exit = app.clone();
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(30))
        // The plugin's requests never time out by themselves: a download that receives nothing for a minute
        // fails, while a slow one that still moves goes on (the limit resets on every read).
        .configure_client(|client| client.read_timeout(Duration::from_secs(60)))
        .on_before_exit(move || {
            stop_children(&before_exit);
            before_exit.cleanup_before_exit();
        })
        .build()
        .map_err(|e| e.to_string())?;
    let progress = app.clone();
    // The check and the download are one task: Preferences shows Cancel from the click, and the check can take
    // its 30 s.
    let task = tauri::async_runtime::spawn(async move {
        let Some(mut update) = updater.check().await? else {
            return Ok(None);
        };
        // The 30 s are the check's: a download of any length is fine while it keeps moving.
        update.timeout = None;
        let (mut got, mut said) = (0u64, None::<u64>);
        let on_chunk = move |chunk: usize, total: Option<u64>| {
            got += chunk as u64;
            // Once per percent, or per MB without a size: never once per chunk.
            let step = total.map_or(got / 1_048_576, |t| got * 100 / t.max(1));
            if said != Some(step) {
                said = Some(step);
                let _ = progress.emit_to("prefs", UPDATE_PROGRESS_EVENT, (got, total));
            }
        };
        let bytes = update.download(on_chunk, || {}).await?;
        Ok::<_, tauri_plugin_updater::Error>(Some((update, bytes)))
    });
    let abort = task.inner().abort_handle();
    let download = app.state::<UpdateDownload>();
    if let Ok(mut current) = download.0.lock() {
        *current = Some(Box::new(move || abort.abort()));
    }
    let done = task.await;
    if let Ok(mut current) = download.0.lock() {
        *current = None;
    }
    let (update, bytes) = match done {
        Ok(Ok(Some(found))) => found,
        Ok(Ok(None)) => return Ok(false),
        Ok(Err(e)) => return Err(e.to_string()),
        Err(_) => return Err("cancelled".into()),
    };
    // Windows: the installer runs and the app ends here.
    update.install(bytes).map_err(|e| e.to_string())?;
    // The runners and the server here finish their work first, as when quitting; then the new app opens
    // (and starts the server here's new version, `local_server`).
    tauri::async_runtime::spawn_blocking(move || {
        stop_children(&app);
        app.restart();
    });
    Ok(true)
}

/// Preferences' Cancel while an update downloads.
#[tauri::command]
fn update_cancel(download: tauri::State<'_, UpdateDownload>) {
    if let Some(abort) = download.0.lock().ok().and_then(|mut current| current.take()) {
        abort();
    }
}

/// Turns the notch on or off (Preferences › General; the popover applies the saved choice at start).
#[tauri::command]
async fn notch_set(app: AppHandle, on: bool) -> Result<(), String> {
    notch::set_enabled(&app, on)
}

#[tauri::command]
async fn notch_info(app: AppHandle) -> Result<Option<notch::NotchInfo>, String> {
    notch::info(&app)
}

#[tauri::command]
async fn notch_place(app: AppHandle, width: f64, height: f64) -> Result<Option<notch::NotchInfo>, String> {
    notch::place(&app, width, height)
}

/// The app was "agentes" before it became "agentes.chat", and the login item is named after the app: the old
/// one goes and, if it was on, the new one takes its place.
fn migrate_login_item(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    if let Ok(home) = app.path().home_dir() {
        let old = home.join("Library/LaunchAgents/agentes.plist");
        if old.exists() && std::fs::remove_file(&old).is_ok() {
            let _ = app.autolaunch().enable();
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

pub fn run() {
    let builder = tauri::Builder::default()
        // First: a second launch brings the running app's window back; one carrying a link (Windows,
        // Linux) goes to the deep-link plugin first (`deep_link.rs` shows it).
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if !deep_link::in_args(&argv) {
                open_app(app);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![AUTOSTART_ARG])))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        // Without its click script: it takes every `target="_blank"` link in every page and asks over IPC, which
        // the site may not do, so the click did nothing. The main window routes those itself (`on_new_window`).
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Runners::default())
        .manage(PopoverClock(Mutex::new(None)))
        .manage(servers::Servers::default())
        .manage(local_server::LocalServer::default())
        .manage(host_sync::HostSync::default())
        .manage(deep_link::PendingLink::default())
        .manage(main_window::Bridge::default())
        .manage(main_window::Notices::default())
        .manage(workspaces::Workspaces::default())
        .manage(workspaces::WelcomeMode::default())
        .manage(menus::Zoom::default())
        .manage(cover::Cover::default())
        .manage(dock::Dock::default())
        .manage(menus::MenuParts::default())
        .manage(window_state::LastSaved::default())
        .manage(prepare::Resumed::default())
        .manage(UpdateDownload::default())
        .invoke_handler(tauri::generate_handler![
            runners_list,
            runner_send,
            runner_add,
            runner_remove,
            open_external,
            reveal_folder,
            pick_folder,
            set_tray_state,
            show_window,
            hide_window,
            quit_app,
            app_info,
            autostart_get,
            autostart_set,
            notify,
            update_install,
            update_cancel,
            notch_set,
            notch_info,
            notch_place,
            servers::servers_get,
            servers::server_choose,
            servers::server_remove,
            servers::server_sign_out,
            discover::discover,
            deep_link::link_take,
            deep_link::pair_link_info,
            local_server::local_server_status,
            local_server::local_server_install,
            local_server::local_server_cancel,
            local_server::local_server_start,
            local_server::local_server_stop,
            local_server::local_server_restart,
            local_server::local_server_reach,
            local_server::local_server_reach_stop,
            local_server::local_server_usage,
            local_server::local_server_backup,
            local_server::local_server_backups_set,
            local_server::local_server_restore,
            local_server::keep_running,
            local_server::open_system_settings,
            local_server::local_server_diagnostics,
            local_server::local_server_sync,
            tailscale::tailscale_status,
            tailscale::tailscale_open,
            tray::tray_visible,
            main_window::this_mac,
            main_window::this_mac_reply,
            main_window::this_mac_listening,
            main_window::notify_site_set,
            main_window::pair_ask,
            workspaces::workspaces_get,
            workspaces::site_fetch,
            workspaces::welcome_mode_take,
            workspaces::welcome_add,
            menus::app_menu_set,
            menus::context_menu,
            cover::page_ready,
            cover::cover_retry,
            cover::cover_hide,
            cover::cover_server,
            cover::cover_details,
            prepare::screen_access,
            prepare::screen_request,
            prepare::disk_access,
            prepare::network_ask,
            prepare::privacy_open,
            prepare::setup_state_get,
            prepare::setup_state_set
        ])
        .on_menu_event(|app, event| menus::on_event(app, event.id().as_ref()))
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(false) if window.label() == "popover" => {
                let _ = window.hide();
                if let Ok(mut at) = window.app_handle().state::<PopoverClock>().0.lock() {
                    *at = Some(Instant::now());
                }
            }
            WindowEvent::Focused(true) if window.label() == main_window::LABEL => {
                main_window::focused(window.app_handle());
            }
            WindowEvent::Focused(false) if window.label() == main_window::LABEL => {
                main_window::keep_lights(window.app_handle());
            }
            // Closing it while agentes.chat is being set up only hides it: the setup goes on (Cancel stops it).
            WindowEvent::CloseRequested { api, .. }
                if window.label() == "welcome" && local_server::setting_up(window.app_handle()) =>
            {
                api.prevent_close();
                let _ = window.hide();
            }
            // Welcome and Preferences really close (made again when they open), and a setup on screen ends with them.
            WindowEvent::CloseRequested { .. } if MADE_ON_OPEN.contains(&window.label()) => {
                prepare::closed(window.app_handle(), window.label());
            }
            WindowEvent::CloseRequested { api, .. } => {
                // The other windows are made once and only hidden; quitting goes through "Quit".
                api.prevent_close();
                if window.label() == main_window::LABEL {
                    window_state::remember(window, false);
                    // Some Linux desktops show no tray icon: there the window stays in reach, minimized.
                    #[cfg(target_os = "linux")]
                    {
                        let _ = window.minimize();
                        return;
                    }
                    // ⌘W in full screen: out of full screen first, so no empty Space stays behind.
                    #[cfg(not(target_os = "linux"))]
                    if main_window::in_full_screen(window) {
                        let _ = window.set_fullscreen(false);
                        let window = window.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_millis(700));
                            let _ = window.hide();
                        });
                        return;
                    }
                }
                let _ = window.hide();
            }
            WindowEvent::Moved(_) if window.label() == main_window::LABEL => window_state::remember(window, true),
            WindowEvent::Resized(_) if window.label() == main_window::LABEL => {
                window_state::remember(window, true);
                // Full screen in or out: the page's title bar keeps or drops the room for the buttons.
                main_window::fit_page(window.app_handle());
            }
            WindowEvent::ThemeChanged(theme) if window.label() == main_window::LABEL => {
                let color = main_window::backdrop(*theme);
                let _ = window.set_background_color(Some(color));
                if let Some(page) = window.app_handle().get_webview(main_window::LABEL) {
                    let _ = page.set_background_color(Some(color));
                }
            }
            _ => {}
        })
        .setup(|app| {
            let handle = app.handle().clone();
            // Before the tray (it lists them).
            servers::load(&handle);
            tray::create(&handle)?;
            #[cfg(target_os = "macos")]
            if let Some(ns) = handle.get_webview_window("popover").and_then(|w| w.ns_window().ok()) {
                keep_out_of_window_list(ns);
            }
            migrate_login_item(&handle);
            // Start at login written before the flag existed: write it again, now with the flag.
            let launcher = handle.autolaunch();
            if launcher.is_enabled().unwrap_or(false) {
                let _ = launcher.enable();
            }
            // The server here first (its own homes start with the rest); nothing starts without homes (no
            // workspace lets its agents work on this computer yet).
            local_server::load(&handle);
            app.state::<Runners>().start_all(&handle);
            host_sync::start(&handle);
            // Every server's workspaces, for the site's menu and Preferences (ADR 0154).
            workspaces::start(&handle);
            main_window::stop_from_notices(&handle);
            deep_link::setup(&handle);
            // Started at login: in the background (the popover, the tray). Opened by hand: the main window on
            // the server open now, or the first run while there is none. Opened again by macOS in the middle of a
            // setup (the "Quit & Reopen" after a permission): the main window on the page it showed, and the setup's
            // window over it.
            let at_login = std::env::args().any(|a| a == AUTOSTART_ARG);
            let resume = prepare::resume(&handle, at_login);
            if servers::current(&handle).is_none() {
                let _ = present(&handle, "welcome");
            } else if !at_login {
                let _ = main_window::open(&handle, resume.as_ref().and_then(|r| r.page.clone()));
            }
            if let Some(resume) = resume {
                let _ = present(&handle, resume.window);
            }
            // The app icon picked on this computer (ADR 0179).
            app_icon::show(&handle);
            Ok(())
        });
    // After long in the background macOS may end a window's page to free memory, which leaves it blank:
    // it loads again (the site opens from the disk cache, so it is back at once).
    #[cfg(target_os = "macos")]
    let builder = builder.on_web_content_process_terminate(|webview| {
        if webview.label() == main_window::LABEL {
            cover::show(webview.app_handle(), std::time::Duration::ZERO);
        }
        let _ = webview.reload();
    });
    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building agentes.chat");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            if !app.state::<Runners>().is_shut_down() {
                api.prevent_exit();
                begin_quit(app.clone());
            }
        }
        // A click on the Dock icon: bring the app's window back.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => {
            // A click on a notification of the server here brings the app forward: the popover, which says why.
            if local_server::take_notice_click() {
                let _ = present(app, "popover");
            } else {
                open_app(app);
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn what_opens_in_the_browser() {
        assert!(is_sign_in_url("https://claude.ai/oauth/authorize?client_id=x"));
        assert!(is_app_download("https://app.agentes.chat/api/desktop/download/0.6.0/agentes_0.6.0_universal.dmg"));
        assert!(!is_app_download("https://app.agentes.chat.evil.com/api/desktop/download/x"));
        assert!(!is_sign_in_url("https://claude.ai.evil.com/oauth/authorize?"));
        assert!(is_help_page("https://agentes.chat/docs/run-on-your-computer#who"));
        assert!(is_help_page("https://agentes.chat/pt/docs/computers#folders"));
        assert!(!is_help_page("https://agentes.chat.evil.com/docs/x"));
        assert!(!is_help_page("https://agentes.chat@evil.com/docs/x"));
        assert!(!is_help_page("https://agentes.chat/docsx"));
        assert!(!is_help_page("https://agentes.chat/pricing"));
        assert!(!is_help_page("https://agentes.chat/a/b/docs/x"));
    }

    #[cfg(unix)]
    #[test]
    fn a_program_ends_on_its_own_runs_out_of_time_or_is_stopped() {
        use std::sync::atomic::{AtomicBool, Ordering::SeqCst};
        let sh = |script: &str| {
            let mut command = Command::new("/bin/sh");
            command.args(["-c", script]);
            command
        };
        // On its own: its code and both outputs, read while it runs (more than a pipe holds).
        let ran = run_program(
            &mut sh("head -c 200000 /dev/zero | tr '\\000' a; echo done >&2; exit 3"),
            Duration::from_secs(5),
            &|| false,
        )
        .unwrap();
        assert_eq!((ran.code, ran.cut, ran.out.len(), ran.err.as_str()), (Some(3), None, 200_000, "done\n"));
        // Out of time: ended, what it printed kept.
        let started = Instant::now();
        let ran = run_program(&mut sh("echo early; exec sleep 5"), Duration::from_millis(300), &|| false).unwrap();
        assert_eq!((ran.code, ran.cut, ran.out.as_str()), (None, Some(Cut::TooLong), "early\n"));
        assert!(started.elapsed() < Duration::from_secs(2));
        // Stopped (Cancel, quitting): at once, whatever its limit.
        let stop = AtomicBool::new(false);
        std::thread::scope(|s| {
            s.spawn(|| {
                std::thread::sleep(Duration::from_millis(150));
                stop.store(true, SeqCst);
            });
            let started = Instant::now();
            let ran = run_program(&mut sh("exec sleep 5"), Duration::from_secs(60), &|| stop.load(SeqCst)).unwrap();
            assert_eq!(ran.cut, Some(Cut::Stopped));
            assert!(started.elapsed() < Duration::from_secs(2));
        });
    }

    #[cfg(unix)]
    #[test]
    fn a_watched_run_waits_longer_once_asked_and_stops_when_told() {
        let sh = |script: &str| {
            let mut command = Command::new("/bin/sh");
            command.args(["-c", script]);
            command
        };
        // It names a page, then takes longer than the first wait: the watcher gives it more time.
        let script = "echo 'visit https://login.tailscale.com/f/serve?node=abc'; sleep 1; echo done";
        let mut seen = None;
        let ran = run_watched(&mut sh(script), Duration::from_millis(300), &mut |so_far: &str| {
            match so_far.split_whitespace().find(|w| w.starts_with("https://")) {
                Some(url) => {
                    seen.get_or_insert(url.to_string());
                    Watch::WaitUpTo(Duration::from_secs(5))
                }
                None => Watch::Wait,
            }
        })
        .unwrap();
        assert_eq!((ran.code, ran.cut), (Some(0), None), "it finished on its own");
        assert!(ran.out.ends_with("done\n"));
        assert_eq!(seen.as_deref(), Some("https://login.tailscale.com/f/serve?node=abc"));
        // Told to stop: it ends at once, well before its own end.
        let started = Instant::now();
        let ran = run_watched(&mut sh("exec sleep 5"), Duration::from_secs(10), &mut |_| Watch::Stop).unwrap();
        assert_eq!(ran.cut, Some(Cut::Stopped));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
