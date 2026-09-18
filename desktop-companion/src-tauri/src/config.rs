//! App config + secret references (env / keychain). No secrets in repo.
//! Cursor-only MVP — Spending session + local IDE status. API Key deferred.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::models::GenericHttpProviderConfig;
use crate::secrets::{self, SecretSource, CURSOR_API_KEY, CURSOR_USAGE_SESSION};
use crate::session_auto;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    /// Deferred: Cursor API key for optional Cloud Agents.
    pub cursor_api_key_ref: String,
    /// Spending / dashboard session (cookie or JWT) — primary quota auth.
    pub cursor_usage_session_ref: String,
    /// Kept for back-compat; Spending fetch always attempted when session present.
    pub cursor_usage_experimental: bool,
    /// When true, also poll Cloud Agents API (requires API Key). Default false.
    pub cloud_agents_enabled: bool,
    /// How to obtain Spending auth:
    /// - `auto` — Cursor IDE → browser → saved/manual/env
    /// - `auto_cursor` — Cursor IDE state.vscdb only (+ saved fallback)
    /// - `auto_browser` — Chromium cookie DB (+ saved fallback)
    /// - `manual` — pasted / env only
    pub session_auth_mode: String,
    /// Browser preference when auto_browser / auto: `auto` | `chrome` | `arc` | `edge` | `brave`
    pub browser_cookie_source: String,
    pub custom_providers: Vec<GenericHttpProviderConfig>,
    pub agent_poll_seconds: u64,
    /// Quota / Spending refresh interval (also re-reads auto session).
    pub quota_poll_seconds: u64,
    /// When true, emit notification stubs on Done / NeedsInput / Failed while unfocused.
    pub notify_when_unfocused: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            cursor_api_key_ref: format!("keychain:{CURSOR_API_KEY}"),
            cursor_usage_session_ref: format!("keychain:{CURSOR_USAGE_SESSION}"),
            cursor_usage_experimental: true,
            cloud_agents_enabled: false,
            // Default: automatic — prefer Cursor IDE login (same as Open Spending).
            session_auth_mode: "auto".into(),
            browser_cookie_source: "auto".into(),
            custom_providers: vec![],
            agent_poll_seconds: 10,
            quota_poll_seconds: 120,
            notify_when_unfocused: true,
        }
    }
}

fn config_path() -> PathBuf {
    secrets::app_data_dir_public().join("config.json")
}

/// Load persisted config (secret refs only) or defaults.
pub fn load_app_config() -> AppConfig {
    let path = config_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return AppConfig::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_app_config(config: &AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建配置目录: {e}"))?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("无法写入配置: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Resolve `env:NAME` or `keychain:ID`. Never logs values.
pub fn resolve_secret(secret_ref: &str) -> Option<String> {
    if let Some(name) = secret_ref.strip_prefix("env:") {
        let v = std::env::var(name).ok()?;
        if v.trim().is_empty() {
            return None;
        }
        return Some(v.trim().to_string());
    }
    if let Some(id) = secret_ref.strip_prefix("keychain:") {
        return secrets::get_secret(id);
    }
    None
}

fn env_token(name: &str) -> Option<String> {
    std::env::var(name).ok().and_then(|v| {
        let t = v.trim().to_string();
        if t.is_empty() {
            None
        } else {
            Some(t)
        }
    })
}

fn stored_usage_session(config: &AppConfig) -> Option<String> {
    if let Some(v) = secrets::get_secret(CURSOR_USAGE_SESSION) {
        return Some(v);
    }
    if let Some(v) = resolve_secret(&config.cursor_usage_session_ref) {
        return Some(v);
    }
    env_token("CURSOR_USAGE_SESSION_TOKEN")
}

/// Status for settings UI (no secret values).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsStatus {
    pub cursor_api_key_configured: bool,
    pub cursor_api_key_source: SecretSource,
    pub cursor_usage_session_configured: bool,
    pub cursor_usage_session_source: SecretSource,
    /// Where the *effective* session would come from on next fetch (may be auto).
    pub session_auth_mode: String,
    pub browser_cookie_source: String,
    pub auto_session_available: bool,
    pub auto_session_source_label: Option<String>,
    pub auto_session_detail: Option<String>,
    pub quota_poll_seconds: u64,
    pub cloud_agents_enabled: bool,
    pub notify_when_unfocused: bool,
}

pub fn settings_status(config: &AppConfig) -> SettingsStatus {
    let api_store = secrets::secret_source(CURSOR_API_KEY);
    let api_configured = api_store != SecretSource::None
        || resolve_secret(&config.cursor_api_key_ref).is_some()
        || env_token("CURSOR_API_KEY").is_some();

    let usage_store = secrets::secret_source(CURSOR_USAGE_SESSION);
    let stored = stored_usage_session(config);
    let usage_configured = stored.is_some() || resolve_cursor_usage_session(config).is_some();

    let (auto_ok, auto_label, auto_detail) = match config.session_auth_mode.as_str() {
        "manual" => (false, None, Some("手动模式：仅用已保存/粘贴会话".into())),
        mode => {
            let probe = match mode {
                "auto_cursor" => {
                    vec![match session_auto::obtain_cursor_ide_session() {
                        Ok(r) => session_auto::AutoSessionAttempt {
                            ok: true,
                            source_label: r.source_label,
                            detail: "可用".into(),
                        },
                        Err(e) => session_auto::AutoSessionAttempt {
                            ok: false,
                            source_label: "Cursor IDE".into(),
                            detail: e,
                        },
                    }]
                }
                "auto_browser" => {
                    vec![match session_auto::obtain_browser_session(&config.browser_cookie_source)
                    {
                        Ok(r) => session_auto::AutoSessionAttempt {
                            ok: true,
                            source_label: r.source_label,
                            detail: "可用".into(),
                        },
                        Err(e) => session_auto::AutoSessionAttempt {
                            ok: false,
                            source_label: "浏览器".into(),
                            detail: e,
                        },
                    }]
                }
                _ => session_auto::probe_auto_sources(&config.browser_cookie_source),
            };
            let ok = probe.iter().any(|a| a.ok);
            let label = probe.iter().find(|a| a.ok).map(|a| a.source_label.clone());
            let detail = Some(
                probe
                    .iter()
                    .map(|a| {
                        format!(
                            "{}：{}",
                            a.source_label,
                            if a.ok { "可用" } else { a.detail.as_str() }
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(" · "),
            );
            (ok, label, detail)
        }
    };

    SettingsStatus {
        cursor_api_key_configured: api_configured,
        cursor_api_key_source: if api_store != SecretSource::None {
            api_store
        } else if env_token("CURSOR_API_KEY").is_some() {
            SecretSource::Env
        } else {
            SecretSource::None
        },
        cursor_usage_session_configured: usage_configured,
        cursor_usage_session_source: if auto_ok {
            SecretSource::Auto
        } else if usage_store != SecretSource::None {
            usage_store
        } else if env_token("CURSOR_USAGE_SESSION_TOKEN").is_some() {
            SecretSource::Env
        } else {
            SecretSource::None
        },
        session_auth_mode: config.session_auth_mode.clone(),
        browser_cookie_source: config.browser_cookie_source.clone(),
        auto_session_available: auto_ok,
        auto_session_source_label: auto_label,
        auto_session_detail: auto_detail,
        quota_poll_seconds: config.quota_poll_seconds,
        cloud_agents_enabled: config.cloud_agents_enabled,
        notify_when_unfocused: config.notify_when_unfocused,
    }
}

/// Resolve Cursor API key: settings store → config ref → env. (Deferred path.)
pub fn resolve_cursor_api_key(config: &AppConfig) -> Option<String> {
    if let Some(v) = secrets::get_secret(CURSOR_API_KEY) {
        return Some(v);
    }
    if let Some(v) = resolve_secret(&config.cursor_api_key_ref) {
        return Some(v);
    }
    env_token("CURSOR_API_KEY")
}

/// Resolve Spending session: auto sources (per mode) → saved keychain/vault → env.
/// Re-read on every call so scheduled refresh picks up rotated cookies/tokens.
/// Never logs values.
pub fn resolve_cursor_usage_session(config: &AppConfig) -> Option<String> {
    match config.session_auth_mode.as_str() {
        "auto_cursor" => session_auto::obtain_cursor_ide_session()
            .ok()
            .map(|r| r.token)
            .or_else(|| stored_usage_session(config)),
        "auto_browser" => session_auto::obtain_browser_session(&config.browser_cookie_source)
            .ok()
            .map(|r| r.token)
            .or_else(|| stored_usage_session(config)),
        "manual" => stored_usage_session(config),
        // "auto" and unknown → full cascade
        _ => session_auto::obtain_auto_session(&config.browser_cookie_source)
            .ok()
            .map(|r| r.token)
            .or_else(|| stored_usage_session(config)),
    }
}

/// Load `desktop-companion/.env` if present (does not override existing env).
pub fn load_dotenv() {
    let _ = dotenvy::dotenv();
    if let Ok(cwd) = std::env::current_dir() {
        let _ = dotenvy::from_path(cwd.join(".env"));
    }
}
