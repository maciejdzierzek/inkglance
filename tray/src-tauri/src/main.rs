// InkGlance menu-bar / system-tray app.
//
// Owns the panel server: starts it with the app, stops it on Quit, restarts it on
// demand. If a server already answers on the configured port (for example the
// LaunchAgent service), the app attaches to it instead of starting a second one.
// Shows the number of sessions waiting next to the icon and offers the panel,
// settings and limits in small windows that load the local panel pages.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpStream, UdpSocket};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;

const TRAY_ID: &str = "inkglance";

// ---------------------------------------------------------------- config --------

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")).unwrap_or_default())
}

fn config_dir() -> PathBuf {
    std::env::var("INKGLANCE_CONFIG")
        .ok()
        .and_then(|p| Path::new(&p).parent().map(Path::to_path_buf))
        .unwrap_or_else(|| home().join(".config").join("inkglance"))
}

fn read_json(path: &Path) -> serde_json::Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::Value::Null)
}

#[derive(Clone)]
struct Conf {
    port: u16,
    token: String,
    lang: String,
}

fn read_conf() -> Conf {
    let v = read_json(&config_dir().join("config.json"));
    Conf {
        port: v["port"].as_u64().unwrap_or(4747) as u16,
        token: v["token"].as_str().unwrap_or("").to_string(),
        lang: v["language"].as_str().unwrap_or("en").to_string(),
    }
}

// Optional overrides in ~/.config/inkglance/tray.json:
//   { "serverDir": "/path/to/inkglance", "node": "/path/to/node" }
fn tray_overrides() -> serde_json::Value {
    read_json(&config_dir().join("tray.json"))
}

fn log_path() -> PathBuf {
    if cfg!(target_os = "macos") {
        home().join("Library").join("Logs").join("inkglance.log")
    } else {
        config_dir().join("inkglance.log")
    }
}

// ---------------------------------------------------------------- texts ---------

fn tr(lang: &str, key: &str) -> &'static str {
    let pl = lang == "pl";
    match key {
        "starting" => if pl { "InkGlance: uruchamianie…" } else { "InkGlance: starting…" },
        "offline" => if pl { "InkGlance: serwer nie działa" } else { "InkGlance: server not running" },
        "waiting" => if pl { "czeka" } else { "waiting" },
        "working" => if pl { "pracuje" } else { "working" },
        "idle" => if pl { "bezczynne" } else { "idle" },
        "reader" => if pl { "Adres dla czytnika" } else { "Address for the reader" },
        "open" => if pl { "Otwórz panel" } else { "Open panel" },
        "settings" => if pl { "Ustawienia…" } else { "Settings…" },
        "limits" => if pl { "Limity…" } else { "Limits…" },
        "restart" => if pl { "Uruchom ponownie serwer" } else { "Restart server" },
        "autostart" => if pl { "Uruchamiaj przy logowaniu" } else { "Open at login" },
        "logs" => if pl { "Pokaż dziennik" } else { "Show log" },
        "quit" => if pl { "Zakończ InkGlance" } else { "Quit InkGlance" },
        "external" => if pl { " (usługa systemowa)" } else { " (system service)" },
        _ => "",
    }
}

// ---------------------------------------------------------------- server --------

struct Server {
    child: Option<Child>,
}

fn http_get(port: u16, path: &str) -> Option<String> {
    let mut s = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(800)).ok()?;
    s.set_read_timeout(Some(Duration::from_secs(3))).ok()?;
    write!(s, "GET {path} HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").ok()?;
    let mut buf = String::new();
    s.read_to_string(&mut buf).ok()?;
    let (head, body) = buf.split_once("\r\n\r\n")?;
    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        return None;
    }
    Some(body.to_string())
}

fn healthy(port: u16) -> bool {
    http_get(port, "/health").map(|b| b.trim() == "ok").unwrap_or(false)
}

fn find_node() -> Option<PathBuf> {
    if let Some(p) = tray_overrides()["node"].as_str() {
        return Some(PathBuf::from(p));
    }
    if cfg!(windows) {
        let out = Command::new("where").arg("node").output().ok()?;
        return String::from_utf8_lossy(&out.stdout).lines().next().map(|l| PathBuf::from(l.trim()));
    }
    // Apps started from Finder get a minimal PATH; ask the user's login shell.
    for shell in ["/bin/zsh", "/bin/bash"] {
        if let Ok(out) = Command::new(shell).args(["-ilc", "command -v node"]).stderr(Stdio::null()).output() {
            if let Some(line) = String::from_utf8_lossy(&out.stdout).lines().rev().find(|l| l.trim().starts_with('/')) {
                return Some(PathBuf::from(line.trim()));
            }
        }
    }
    ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
        .iter()
        .map(PathBuf::from)
        .find(|p| p.exists())
}

fn server_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Some(p) = tray_overrides()["serverDir"].as_str() {
        return Some(PathBuf::from(p));
    }
    app.path().resource_dir().ok().map(|d| d.join("server"))
}

fn start_server(app: &AppHandle) {
    let conf = read_conf();
    if healthy(conf.port) {
        return; // a server (e.g. the LaunchAgent service) already runs: attach to it
    }
    let (Some(node), Some(dir)) = (find_node(), server_dir(app)) else { return };
    let log = OpenOptions::new().create(true).append(true).open(log_path());
    let mut cmd = Command::new(node);
    cmd.arg(dir.join("src").join("server.js")).current_dir(&dir);
    if let Ok(f) = log {
        if let Ok(f2) = f.try_clone() {
            cmd.stdout(f).stderr(f2);
        }
    }
    // Claude Code's `claude` binary must be on PATH for the server, as in a terminal.
    if let Ok(out) = Command::new("/bin/zsh").args(["-ilc", "echo $PATH"]).stderr(Stdio::null()).output() {
        if let Some(path) = String::from_utf8_lossy(&out.stdout).lines().last() {
            if path.contains('/') {
                cmd.env("PATH", path.trim());
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    if let Ok(child) = cmd.spawn() {
        app.state::<Mutex<Server>>().lock().unwrap().child = Some(child);
    }
}

fn stop_server(app: &AppHandle) {
    if let Some(mut child) = app.state::<Mutex<Server>>().lock().unwrap().child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn owns_server(app: &AppHandle) -> bool {
    app.state::<Mutex<Server>>().lock().unwrap().child.is_some()
}

fn lan_ip() -> Option<String> {
    // Picks the interface used for outgoing traffic; nothing is sent.
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("192.0.2.1:80").ok()?;
    Some(s.local_addr().ok()?.ip().to_string())
}

fn panel_url(conf: &Conf, path: &str) -> String {
    let sep = if path.contains('?') { '&' } else { '?' };
    format!("http://127.0.0.1:{}{}{}t={}", conf.port, path, sep, conf.token)
}

fn open_window(app: &AppHandle, label: &str, path: &str, title: &str) {
    let conf = read_conf();
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    if let Ok(url) = panel_url(&conf, path).parse() {
        let _ = WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
            .title(title)
            .inner_size(600.0, 820.0)
            .build();
    }
}

// ---------------------------------------------------------------- app -----------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(Server { child: None }))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // menu bar only, no Dock icon

            let lang = read_conf().lang;
            let handle = app.handle().clone();
            start_server(&handle);

            let status = MenuItem::with_id(app, "status", tr(&lang, "starting"), false, None::<&str>)?;
            let reader = MenuItem::with_id(app, "reader", tr(&lang, "reader"), false, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", tr(&lang, "open"), true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", tr(&lang, "settings"), true, None::<&str>)?;
            let limits = MenuItem::with_id(app, "limits", tr(&lang, "limits"), true, None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", tr(&lang, "restart"), true, None::<&str>)?;
            let logs = MenuItem::with_id(app, "logs", tr(&lang, "logs"), true, None::<&str>)?;
            // First run: open at login by default (the usual for menu-bar apps);
            // afterwards the menu checkbox decides.
            let marker = config_dir().join("tray-state.json");
            if !marker.exists() {
                let _ = app.autolaunch().enable();
                let _ = fs::create_dir_all(config_dir());
                let _ = fs::write(&marker, "{\"autostartInitialized\": true}\n");
            }
            let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart = CheckMenuItem::with_id(app, "autostart", tr(&lang, "autostart"), true, autostart_on, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", tr(&lang, "quit"), true, None::<&str>)?;
            let sep = || PredefinedMenuItem::separator(app);
            let menu = Menu::with_items(
                app,
                &[&status, &reader, &sep()?, &open, &settings, &limits, &sep()?, &restart, &logs, &autostart, &sep()?, &quit],
            )?;

            TrayIconBuilder::with_id(TRAY_ID)
                .icon(Image::from_bytes(include_bytes!("../../../assets/tray/iconTemplate@2x.png"))?)
                .icon_as_template(true)
                .tooltip("InkGlance")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    let lang = read_conf().lang;
                    match event.id().as_ref() {
                        "open" => {
                            let _ = app.opener().open_url(panel_url(&read_conf(), "/"), None::<&str>);
                        }
                        "settings" => open_window(app, "settings", "/settings", tr(&lang, "settings")),
                        "limits" => open_window(app, "limits", "/limits", tr(&lang, "limits")),
                        "restart" => {
                            stop_server(app);
                            std::thread::sleep(Duration::from_millis(500));
                            start_server(app);
                        }
                        "logs" => {
                            let _ = app.opener().open_path(log_path().to_string_lossy(), None::<&str>);
                        }
                        "autostart" => {
                            let al = app.autolaunch();
                            let _ = if al.is_enabled().unwrap_or(false) { al.disable() } else { al.enable() };
                        }
                        "quit" => {
                            stop_server(app);
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Status: poll the panel's tiny state endpoint every 10 s.
            std::thread::spawn(move || loop {
                let conf = read_conf();
                let lang = conf.lang.clone();
                let state = http_get(conf.port, &format!("/state?t={}", conf.token))
                    .and_then(|b| serde_json::from_str::<serde_json::Value>(&b).ok());
                let tray = handle.tray_by_id(TRAY_ID);
                match state {
                    Some(v) => {
                        let c = &v["counts"];
                        let (w, k, i) = (c["needsYou"].as_u64().unwrap_or(0), c["working"].as_u64().unwrap_or(0), c["idle"].as_u64().unwrap_or(0));
                        let external = if owns_server(&handle) { "" } else { tr(&lang, "external") };
                        let text = format!("{w} {} · {k} {} · {i} {}{external}", tr(&lang, "waiting"), tr(&lang, "working"), tr(&lang, "idle"));
                        let _ = status.set_text(&text);
                        if let Some(t) = &tray {
                            let _ = t.set_title(if w > 0 { Some(w.to_string()) } else { None::<String> });
                            let _ = t.set_tooltip(Some(format!("InkGlance: {text}")));
                        }
                    }
                    None => {
                        let _ = status.set_text(tr(&lang, "offline"));
                        if let Some(t) = &tray {
                            let _ = t.set_title(Some("!".to_string()));
                        }
                    }
                }
                let port = if conf.port == 80 { String::new() } else { format!(":{}", conf.port) };
                if let Some(ip) = lan_ip() {
                    let _ = reader.set_text(format!("{}: http://{ip}{port}", tr(&lang, "reader")));
                }
                let _ = autostart.set_checked(handle.autolaunch().is_enabled().unwrap_or(false));
                std::thread::sleep(Duration::from_secs(10));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building InkGlance")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                stop_server(app);
            }
            // Closing the last window must not quit a menu-bar app.
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
