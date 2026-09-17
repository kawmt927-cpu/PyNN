//! App config + secret references (env / keychain). No secrets in repo.
//! Cursor-only MVP — Kimi credential paths deferred / not compiled in.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::models::GenericHttpProviderConfig;
use crate::secrets::{self, SecretSource, CURSOR_API_KEY, CURSOR_USAGE_SESSION};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    /// Cursor API key for Cloud Agents: env or keychain.
    pub cursor_api_key_ref: String,
    /// Personal Cursor usage session (semi-official dashboard).
    pub cursor_usage_session_ref: String,
    /// Personal Cursor usage is experimental (dashboard-style). Opt-in.
    pub cursor_usage_experimental: bool,
    pub custom_providers: Vec<GenericHttpProviderConfig>,
    pub agent_poll_seconds: u64,
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

/// Status for settings UI (no secret values).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsStatus {
    pub cursor_api_key_configured: bool,
    pub cursor_api_key_source: SecretSource,
    pub cursor_usage_session_configured: bool,
    pub cursor_usage_session_source: SecretSource,
    pub notify_when_unfocused: bool,
}

pub fn settings_status(config: &AppConfig) -> SettingsStatus {
    let api_store = secrets::secret_source(CURSOR_API_KEY);
    let api_configured = api_store != SecretSource::None
        || resolve_secret(&config.cursor_api_key_ref).is_some()
        || env_token("CURSOR_API_KEY").is_some();

    let usage_store = secrets::secret_source(CURSOR_USAGE_SESSION);
    let usage_configured = usage_store != SecretSource::None
        || resolve_cursor_usage_session(config).is_some();

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
        cursor_usage_session_source: if usage_store != SecretSource::None {
            usage_store
        } else if env_token("CURSOR_USAGE_SESSION_TOKEN").is_some() {
            SecretSource::Env
        } else {
            SecretSource::None
        },
        notify_when_unfocused: config.notify_when_unfocused,
    }
}

/// Resolve Cursor API key: settings store → config ref → env.
pub fn resolve_cursor_api_key(config: &AppConfig) -> Option<String> {
    if let Some(v) = secrets::get_secret(CURSOR_API_KEY) {
        return Some(v);
    }
    if let Some(v) = resolve_secret(&config.cursor_api_key_ref) {
        return Some(v);
    }
    env_token("CURSOR_API_KEY")
}

/// Resolve Cursor personal usage session: settings → config ref → env.
pub fn resolve_cursor_usage_session(config: &AppConfig) -> Option<String> {
    if let Some(v) = secrets::get_secret(CURSOR_USAGE_SESSION) {
        return Some(v);
    }
    if let Some(v) = resolve_secret(&config.cursor_usage_session_ref) {
        return Some(v);
    }
    env_token("CURSOR_USAGE_SESSION_TOKEN")
}

/// Load `desktop-companion/.env` if present (does not override existing env).
pub fn load_dotenv() {
    let _ = dotenvy::dotenv();
    if let Ok(cwd) = std::env::current_dir() {
        let _ = dotenvy::from_path(cwd.join(".env"));
    }
}
