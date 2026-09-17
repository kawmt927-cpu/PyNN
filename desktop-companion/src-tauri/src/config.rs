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
    /// Kimi Code / membership token: env `KIMI_CODE_TOKEN` (primary quota).
    pub kimi_code_token_ref: String,
    /// Moonshot open-platform key: env `MOONSHOT_API_KEY`.
    pub moonshot_api_key_ref: String,
    /// Domestic default; switch for international.
    pub moonshot_base_url: String,
    pub kimi_code_base_url: String,
    pub custom_providers: Vec<GenericHttpProviderConfig>,
    pub agent_poll_seconds: u64,
    pub quota_poll_seconds: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            cursor_api_key_ref: "env:CURSOR_API_KEY".into(),
            cursor_usage_experimental: true,
            kimi_code_token_ref: "env:KIMI_CODE_TOKEN".into(),
            moonshot_api_key_ref: "env:MOONSHOT_API_KEY".into(),
            moonshot_base_url: "https://api.moonshot.cn".into(),
            kimi_code_base_url: "https://api.kimi.com/coding/v1".into(),
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
        return Some(v);
    }
    if secret_ref.starts_with("keychain:") {
        // TODO: macOS Keychain / Windows Credential Manager
        None
    } else {
        None
    }
}
