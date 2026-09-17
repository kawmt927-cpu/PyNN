//! Quota provider adapters (Cursor-only MVP).

mod cursor;
mod generic_http;

use async_trait::async_trait;
use chrono::Utc;

use crate::config::AppConfig;

#[allow(unused_imports)]
pub use crate::config::resolve_secret;
use crate::models::QuotaSnapshot;

pub use cursor::CursorPersonalProvider;
pub use generic_http::GenericHttpProvider;

#[async_trait]
pub trait QuotaProvider: Send + Sync {
    fn id(&self) -> &str;
    async fn fetch(&self) -> QuotaSnapshot;
}

pub async fn fetch_all_builtin(config: &AppConfig) -> Vec<QuotaSnapshot> {
    let mut rows = Vec::new();

    // Cursor-only MVP: personal usage row (+ optional custom HTTP sources).
    let cursor = CursorPersonalProvider::from_config(config);
    rows.push(cursor.fetch().await);

    for custom in &config.custom_providers {
        if !custom.enabled {
            continue;
        }
        let p = GenericHttpProvider::new(custom.clone());
        rows.push(p.fetch().await);
    }

    rows
}

pub fn placeholder_failure(
    id: &str,
    display_name: &str,
    message: &str,
    fallback_url: Option<&str>,
    experimental: bool,
) -> QuotaSnapshot {
    QuotaSnapshot {
        id: id.into(),
        display_name: display_name.into(),
        primary_value: None,
        secondary_value: None,
        unit: None,
        ok: false,
        error_message: Some(message.into()),
        fallback_url: fallback_url.map(|s| s.into()),
        experimental,
        updated_at: Utc::now(),
    }
}

pub fn missing_secret_snapshot(
    id: &str,
    display_name: &str,
    secret_ref: &str,
    fallback_url: Option<&str>,
    experimental: bool,
) -> QuotaSnapshot {
    placeholder_failure(
        id,
        display_name,
        &format!("未配置会话（{secret_ref}）。请开启「自动从浏览器/Cursor 读取会话」，或紧急粘贴。仓库不存放密钥。"),
        fallback_url,
        experimental,
    )
}

/// Shared HTTP client helper.
pub(crate) fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("desktop-companion/0.1")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .expect("http client")
}
