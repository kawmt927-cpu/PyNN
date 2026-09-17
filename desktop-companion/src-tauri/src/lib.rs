mod agents;
mod config;
mod models;
mod providers;

use std::sync::Mutex;

use chrono::Utc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State,
};

use config::AppConfig;
use models::{AgentUiStatus, CompanionState, GenericHttpProviderConfig};

struct AppState {
    config: Mutex<AppConfig>,
}

#[tauri::command]
async fn get_companion_state(state: State<'_, AppState>) -> Result<CompanionState, String> {
    let config = state
        .config
        .lock()
        .map_err(|_| "config lock".to_string())?
        .clone();

    let quotas = providers::fetch_all_builtin(&config).await;
    let (agent_status, agents) = agents::poll_cloud_agents(&config).await;

    Ok(CompanionState {
        agent_status,
        agents,
        quotas,
        last_updated: Utc::now(),
    })
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
    Ok(())
}

#[tauri::command]
fn remove_custom_provider(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut cfg = state.config.lock().map_err(|_| "config lock".to_string())?;
    cfg.custom_providers.retain(|p| p.id != id);
    Ok(())
}

#[tauri::command]
fn demo_cycle_tray_status(status: String) -> AgentUiStatus {
    match status.as_str() {
        "working" => AgentUiStatus::Working,
        "done" => AgentUiStatus::Done,
        "needs-input" => AgentUiStatus::NeedsInput,
        "failed" => AgentUiStatus::Failed,
        _ => AgentUiStatus::Unknown,
    }
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示面板", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "刷新", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &refresh, &quit])?;

    let icon = app
        .default_window_icon()
        .expect("default window icon")
        .clone();

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("Desktop Companion")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            config: Mutex::new(AppConfig::default()),
        })
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_companion_state,
            get_app_config,
            list_custom_providers,
            upsert_custom_provider,
            remove_custom_provider,
            demo_cycle_tray_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
