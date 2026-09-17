//! App config + secret references (env / keychain placeholders). No secrets in repo.

use serde::{Deserialize, Serialize};

use crate::models::GenericHttpProviderConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Cursor API key for Cloud Agents: env `CURSOR_API_KEY` or keychain later.
    pub cursor_api_key_ref: String,
    /// Personal Cursor usage is experimental (dashboard-style). Opt-in.
    pub cursor_usage_experimental: bool,
    /// Kimi **member** session (= cookie `kimi-auth`): env `KIMI_AUTH_TOKEN`.
    pub kimi_auth_token_ref: String,
    /// Moonshot open-platform key: env `MOONSHOT_API_KEY`.
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
            cursor_api_key_ref: "env:CURSOR_API_KEY".into(),
            cursor_usage_experimental: true,
            kimi_auth_token_ref: "env:KIMI_AUTH_TOKEN".into(),
            moonshot_api_key_ref: "env:MOONSHOT_API_KEY".into(),
            moonshot_base_url: "https://api.moonshot.cn".into(),
            custom_providers: vec![],
            agent_poll_seconds: 10,
            quota_poll_seconds: 120,
        }
    }
}

/// Resolve `env:NAME` or return None for keychain stubs until wired.
pub fn resolve_secret(secret_ref: &str) -> Option<String> {
    if let Some(name) = secret_ref.strip_prefix("env:") {
        let v = std::env::var(name).ok()?;
        if v.trim().is_empty() {
            return None;
        }
        return Some(v.trim().to_string());
    }
    if secret_ref.starts_with("keychain:") {
        // TODO: macOS Keychain / Windows Credential Manager
        None
    } else {
        None
    }
}

/// Consumer membership Access Token for GetSubscriptionStats (NOT Code API key).
///
/// Order: configured ref → aliases `KIMI_WEB_TOKEN` / `KIMI_ACCESS_TOKEN`.
pub fn resolve_kimi_member_token(primary_ref: &str) -> Option<(String, &'static str)> {
    if let Some(v) = resolve_secret(primary_ref) {
        return Some((v, "env"));
    }
    for name in ["KIMI_WEB_TOKEN", "KIMI_ACCESS_TOKEN"] {
        if let Ok(v) = std::env::var(name) {
            let t = v.trim();
            if !t.is_empty() {
                return Some((t.to_string(), "env_alias"));
            }
        }
    }
    None
}

/// Load `desktop-companion/.env` if present (does not override existing env).
pub fn load_dotenv() {
    let _ = dotenvy::dotenv();
    if let Ok(cwd) = std::env::current_dir() {
        let _ = dotenvy::from_path(cwd.join(".env"));
    }
}
