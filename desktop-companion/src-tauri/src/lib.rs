mod agents;
mod config;
mod models;
mod notify;
mod providers;
mod secrets;
mod tray_status;

use std::sync::Mutex;
use std::time::Duration;

use chrono::Utc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};

use config::{settings_status, AppConfig, SettingsStatus};
use models::{AgentUiStatus, CompanionState, GenericHttpProviderConfig};
use secrets::{CURSOR_API_KEY, CURSOR_USAGE_SESSION};

struct AppState {
    config: Mutex<AppConfig>,
    last_agent_status: Mutex<Option<AgentUiStatus>>,
}

async fn build_companion_state(config: &AppConfig) -> CompanionState {
    let quotas = providers::fetch_all_builtin(config).await;
    let (agent_status, agents) = agents::poll_cloud_agents(config).await;
    CompanionState {
        agent_status,
        agents,
        quotas,
        last_updated: Utc::now(),
    }
}

fn apply_status_side_effects(app: &AppHandle, state: &AppState, companion: &CompanionState) {
    tray_status::apply_tray_status(app, companion.agent_status);

    let previous = state
        .last_agent_status
        .lock()
        .ok()
        .and_then(|g| *g);
    let notify = state
        .config
        .lock()
        .map(|c| c.notify_when_unfocused)
        .unwrap_or(true);

    notify::maybe_notify_status_change(app, previous, companion.agent_status, notify);

    if let Ok(mut guard) = state.last_agent_status.lock() {
        *guard = Some(companion.agent_status);
    }
}

#[tauri::command]
async fn get_companion_state(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<CompanionState, String> {
    let config = state
        .config
        .lock()
        .map_err(|_| "config lock".to_string())?
        .clone();

    let companion = build_companion_state(&config).await;
    apply_status_side_effects(&app, &state, &companion);
    Ok(companion)
}

#[tauri::command]
fn get_app_config(state: State<'_, AppState>) -> Result<AppConfig, String> {
    state
        .config
        .lock()
        .map(|c| c.clone())
        .map_err(|_| "config lock".to_string())
}

#[tauri::command]
fn get_settings_status(state: State<'_, AppState>) -> Result<SettingsStatus, String> {
    let cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    Ok(settings_status(&cfg))
}

#[tauri::command]
fn save_cursor_api_key(state: State<'_, AppState>, token: String) -> Result<SettingsStatus, String> {
    let t = token.trim();
    if t.is_empty() {
        return Err("内容为空".into());
    }
    secrets::set_secret(CURSOR_API_KEY, t)?;
    let mut cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    cfg.cursor_api_key_ref = format!("keychain:{CURSOR_API_KEY}");
    config::save_app_config(&cfg)?;
    Ok(settings_status(&cfg))
}

#[tauri::command]
fn clear_cursor_api_key(state: State<'_, AppState>) -> Result<SettingsStatus, String> {
    secrets::delete_secret(CURSOR_API_KEY)?;
    let cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    Ok(settings_status(&cfg))
}

#[tauri::command]
fn save_cursor_usage_session(
    state: State<'_, AppState>,
    token: String,
) -> Result<SettingsStatus, String> {
    let t = token.trim();
    if t.is_empty() {
        return Err("内容为空".into());
    }
    secrets::set_secret(CURSOR_USAGE_SESSION, t)?;
    let mut cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    cfg.cursor_usage_session_ref = format!("keychain:{CURSOR_USAGE_SESSION}");
    cfg.cursor_usage_experimental = true;
    config::save_app_config(&cfg)?;
    Ok(settings_status(&cfg))
}

#[tauri::command]
fn clear_cursor_usage_session(state: State<'_, AppState>) -> Result<SettingsStatus, String> {
    secrets::delete_secret(CURSOR_USAGE_SESSION)?;
    let cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    Ok(settings_status(&cfg))
}

#[tauri::command]
fn set_notify_when_unfocused(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<SettingsStatus, String> {
    let mut cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    cfg.notify_when_unfocused = enabled;
    config::save_app_config(&cfg)?;
    Ok(settings_status(&cfg))
}

#[tauri::command]
fn list_custom_providers(state: State<'_, AppState>) -> Result<Vec<GenericHttpProviderConfig>, String> {
    let cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    Ok(cfg.custom_providers.clone())
}

#[tauri::command]
fn upsert_custom_provider(
    state: State<'_, AppState>,
    provider: GenericHttpProviderConfig,
) -> Result<(), String> {
    let mut cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    if let Some(slot) = cfg
        .custom_providers
        .iter_mut()
        .find(|p| p.id == provider.id)
    {
        *slot = provider;
    } else {
        cfg.custom_providers.push(provider);
    }
    let _ = config::save_app_config(&cfg);
    Ok(())
}

#[tauri::command]
fn remove_custom_provider(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    cfg.custom_providers.retain(|p| p.id != id);
    let _ = config::save_app_config(&cfg);
    Ok(())
}

#[tauri::command]
fn demo_cycle_tray_status(app: AppHandle, status: String) -> AgentUiStatus {
    let ui = match status.as_str() {
        "working" => AgentUiStatus::Working,
        "done" => AgentUiStatus::Done,
        "needs-input" => AgentUiStatus::NeedsInput,
        "failed" => AgentUiStatus::Failed,
        _ => AgentUiStatus::Unknown,
    };
    tray_status::apply_tray_status(&app, ui);
    ui
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示面板", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "刷新", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &refresh, &quit])?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(tray_status::status_icon(AgentUiStatus::Unknown))
        .tooltip("Desktop Companion · 未知")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "settings" => {
                show_main_window(app);
                let _ = app.emit("companion://open-settings", ());
            }
            "refresh" => {
                let _ = app.emit("companion://refresh", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn spawn_status_poller(app: &tauri::App) {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // Initial delay so setup finishes.
        tokio::time::sleep(Duration::from_secs(2)).await;
        loop {
            let (poll_secs, config) = {
                let state = handle.state::<AppState>();
                let cfg = state
                    .config
                    .lock()
                    .map(|c| c.clone())
                    .unwrap_or_default();
                (cfg.agent_poll_seconds.max(5), cfg)
            };

            let companion = build_companion_state(&config).await;
            {
                let state = handle.state::<AppState>();
                apply_status_side_effects(&handle, &state, &companion);
            }
            let _ = handle.emit("companion://state", &companion);

            tokio::time::sleep(Duration::from_secs(poll_secs)).await;
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    config::load_dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            config: Mutex::new(AppConfig::default()),
            last_agent_status: Mutex::new(None),
        })
        .setup(|app| {
            // App data dir for config + encrypted secret vault fallback.
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| {
                dirs::data_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("desktop-companion")
            });
            let _ = std::fs::create_dir_all(&data_dir);
            secrets::init_app_data_dir(data_dir);

            // Replace default managed config with persisted refs (no secret values).
            if let Ok(mut guard) = app.state::<AppState>().config.lock() {
                *guard = config::load_app_config();
            }

            setup_tray(app)?;
            spawn_status_poller(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_companion_state,
            get_app_config,
            get_settings_status,
            save_cursor_api_key,
            clear_cursor_api_key,
            save_cursor_usage_session,
            clear_cursor_usage_session,
            set_notify_when_unfocused,
            list_custom_providers,
            upsert_custom_provider,
            remove_custom_provider,
            demo_cycle_tray_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
