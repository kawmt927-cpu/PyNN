//! App config + secret references (env / keychain). No secrets in repo.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::models::GenericHttpProviderConfig;
use crate::secrets::{self, SecretSource, CURSOR_API_KEY, KIMI_AUTH, MOONSHOT_API_KEY};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Cursor API key for Cloud Agents: env or keychain.
    pub cursor_api_key_ref: String,
    /// Personal Cursor usage is experimental (dashboard-style). Opt-in.
    pub cursor_usage_experimental: bool,
    /// Kimi **member** session (= cookie `kimi-auth`).
    pub kimi_auth_token_ref: String,
    /// Moonshot open-platform key.
    pub moonshot_api_key_ref: String,
    /// Domestic default; switch for international.
    pub moonshot_base_url: String,
    pub custom_providers: Vec<GenericHttpProviderConfig>,
    pub agent_poll_seconds: u64,
    pub quota_poll_seconds: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            cursor_api_key_ref: format!("keychain:{CURSOR_API_KEY}"),
            cursor_usage_experimental: true,
            // Prefer in-app keychain; resolve_kimi_member_token still falls back to env.
            kimi_auth_token_ref: format!("keychain:{KIMI_AUTH}"),
            moonshot_api_key_ref: format!("keychain:{MOONSHOT_API_KEY}"),
            moonshot_base_url: "https://api.moonshot.cn".into(),
            custom_providers: vec![],
            agent_poll_seconds: 10,
            quota_poll_seconds: 120,
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

/// Consumer membership Access Token for GetSubscriptionStats (NOT Code API key).
///
/// Order: **in-app settings store** (`keychain:kimi-auth`) → configured ref →
/// env `KIMI_AUTH_TOKEN` / aliases.
pub fn resolve_kimi_member_token(primary_ref: &str) -> Option<(String, &'static str)> {
    // 1) Settings store first (always), regardless of ref string.
    if let Some(v) = secrets::get_secret(KIMI_AUTH) {
        let src = match secrets::secret_source(KIMI_AUTH) {
            SecretSource::Keychain => "settings",
            SecretSource::LocalVault => "settings",
            _ => "settings",
        };
        return Some((v, src));
    }

    // 2) Configured ref (env:… or other keychain id).
    if !primary_ref.ends_with(KIMI_AUTH) {
        if let Some(v) = resolve_secret(primary_ref) {
            let src = if primary_ref.starts_with("env:") {
                "env"
            } else {
                "settings"
            };
            return Some((v, src));
        }
    } else if let Some(name) = primary_ref.strip_prefix("env:") {
        if let Some(v) = env_token(name) {
            return Some((v, "env"));
        }
    }

    // 3) Standard env fallbacks.
    for (name, label) in [
        ("KIMI_AUTH_TOKEN", "env"),
        ("KIMI_WEB_TOKEN", "env_alias"),
        ("KIMI_ACCESS_TOKEN", "env_alias"),
    ] {
        if let Some(v) = env_token(name) {
            return Some((v, label));
        }
    }
    None
}

/// Status for settings UI (no secret values).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsStatus {
    pub kimi_auth_configured: bool,
    pub kimi_auth_source: SecretSource,
    pub cursor_api_key_configured: bool,
    pub moonshot_api_key_configured: bool,
    /// Effective membership source after resolve (settings / env / none).
    pub kimi_effective_source: String,
}

pub fn settings_status(config: &AppConfig) -> SettingsStatus {
    let kimi_store = secrets::secret_source(KIMI_AUTH);
    let kimi_configured = kimi_store != SecretSource::None
        || resolve_kimi_member_token(&config.kimi_auth_token_ref).is_some();

    let effective = resolve_kimi_member_token(&config.kimi_auth_token_ref)
        .map(|(_, s)| s.to_string())
        .unwrap_or_else(|| "none".into());

    SettingsStatus {
        kimi_auth_configured: kimi_configured,
        kimi_auth_source: if kimi_store != SecretSource::None {
            kimi_store
        } else if effective.starts_with("env") {
            SecretSource::Env
        } else {
            SecretSource::None
        },
        cursor_api_key_configured: secrets::has_secret(CURSOR_API_KEY)
            || resolve_secret(&config.cursor_api_key_ref).is_some()
            || env_token("CURSOR_API_KEY").is_some(),
        moonshot_api_key_configured: secrets::has_secret(MOONSHOT_API_KEY)
            || resolve_secret(&config.moonshot_api_key_ref).is_some()
            || env_token("MOONSHOT_API_KEY").is_some(),
        kimi_effective_source: effective,
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

/// Resolve Moonshot key: settings store → config ref → env.
pub fn resolve_moonshot_api_key(config: &AppConfig) -> Option<String> {
    if let Some(v) = secrets::get_secret(MOONSHOT_API_KEY) {
        return Some(v);
    }
    if let Some(v) = resolve_secret(&config.moonshot_api_key_ref) {
        return Some(v);
    }
    env_token("MOONSHOT_API_KEY")
}

/// Load `desktop-companion/.env` if present (does not override existing env).
pub fn load_dotenv() {
    let _ = dotenvy::dotenv();
    if let Ok(cwd) = std::env::current_dir() {
        let _ = dotenvy::from_path(cwd.join(".env"));
    }
}
