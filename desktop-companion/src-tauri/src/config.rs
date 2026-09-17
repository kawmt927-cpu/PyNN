//! App config + secret references (env / keychain / optional local Kimi CLI file).
//! No secrets in repo.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::models::GenericHttpProviderConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Cursor API key for Cloud Agents: env `CURSOR_API_KEY` or keychain later.
    pub cursor_api_key_ref: String,
    /// Personal Cursor usage is experimental (dashboard-style). Opt-in.
    pub cursor_usage_experimental: bool,
    /// Kimi Code / membership token: preferred env `KIMI_CODE_TOKEN` (aliases also tried).
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
        return Some(v.trim().to_string());
    }
    if secret_ref.starts_with("keychain:") {
        // TODO: macOS Keychain / Windows Credential Manager
        None
    } else {
        None
    }
}

/// Kimi Code membership Bearer: Console `sk-kimi-…` API key **or** CLI OAuth access_token.
///
/// Order:
/// 1. Configured secret ref (default `env:KIMI_CODE_TOKEN`)
/// 2. Alias env vars: `KIMI_API_KEY`, `KIMI_CODE_API_KEY`
/// 3. Optional local CLI credential file (`access_token`) — never committed
pub fn resolve_kimi_code_token(primary_ref: &str) -> Option<(String, &'static str)> {
    if let Some(v) = resolve_secret(primary_ref) {
        return Some((v, "env"));
    }
    for name in ["KIMI_API_KEY", "KIMI_CODE_API_KEY"] {
        if let Ok(v) = std::env::var(name) {
            let t = v.trim();
            if !t.is_empty() {
                return Some((t.to_string(), "env_alias"));
            }
        }
    }
    if let Some(v) = read_kimi_cli_access_token() {
        return Some((v, "kimi_cli_file"));
    }
    None
}

fn read_kimi_cli_access_token() -> Option<String> {
    let home = dirs_home()?;
    let candidates = [
        home.join(".kimi/credentials/kimi-code.json"),
        home.join(".kimi-code/credentials/kimi-code.json"),
    ];
    for path in candidates {
        if let Some(token) = parse_access_token_file(&path) {
            return Some(token);
        }
    }
    None
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn parse_access_token_file(path: &std::path::Path) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let token = v.get("access_token")?.as_str()?.trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

/// Load `desktop-companion/.env` if present (does not override existing env).
pub fn load_dotenv() {
    // Prefer CWD (when launched via `npm run tauri dev` from desktop-companion/)
    let _ = dotenvy::dotenv();
    // Also try next to the executable's parent folders for packaged runs later
    if let Ok(cwd) = std::env::current_dir() {
        let _ = dotenvy::from_path(cwd.join(".env"));
    }
}
