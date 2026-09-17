//! Moonshot / Kimi open-platform balance — SECONDARY (official).

use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use crate::config::{resolve_moonshot_api_key, AppConfig};
use crate::models::QuotaSnapshot;
use crate::providers::{
    http_client, missing_secret_snapshot, placeholder_failure, QuotaProvider,
};

pub struct KimiBalanceProvider {
    api_key: Option<String>,
    base_url: String,
    key_ref: String,
}

impl KimiBalanceProvider {
    pub fn from_config(config: &AppConfig) -> Self {
        Self {
            api_key: resolve_moonshot_api_key(config),
            base_url: config.moonshot_base_url.clone(),
            key_ref: config.moonshot_api_key_ref.clone(),
        }
    }
}

#[async_trait]
impl QuotaProvider for KimiBalanceProvider {
    fn id(&self) -> &str {
        "kimi_moonshot_balance"
    }

    async fn fetch(&self) -> QuotaSnapshot {
        let Some(key) = &self.api_key else {
            return missing_secret_snapshot(
                self.id(),
                "Kimi 开放平台余额",
                &self.key_ref,
                Some("https://platform.kimi.com/console"),
                false,
            );
        };

        let url = format!(
            "{}/v1/users/me/balance",
            self.base_url.trim_end_matches('/')
        );
        let res = http_client()
            .get(&url)
            .bearer_auth(key)
            .send()
            .await;

        match res {
            Ok(resp) if resp.status().is_success() => match resp.json::<Value>().await {
                Ok(body) => {
                    let data = body.get("data");
                    let avail = data
                        .and_then(|d| d.get("available_balance"))
                        .and_then(|v| v.as_f64());
                    let cash = data
                        .and_then(|d| d.get("cash_balance"))
                        .and_then(|v| v.as_f64());
                    let voucher = data
                        .and_then(|d| d.get("voucher_balance"))
                        .and_then(|v| v.as_f64());

                    match avail {
                        Some(a) => QuotaSnapshot {
                            id: self.id().into(),
                            display_name: "Kimi 开放平台余额".into(),
                            primary_value: Some(format!("{a:.4}")),
                            secondary_value: Some(format!(
                                "现金 {} · 代金券 {}",
                                cash.map(|c| format!("{c:.4}")).unwrap_or_else(|| "—".into()),
                                voucher
                                    .map(|c| format!("{c:.4}"))
                                    .unwrap_or_else(|| "—".into())
                            )),
                            unit: Some("CNY".into()),
                            ok: true,
                            error_message: None,
                            fallback_url: None,
                            experimental: false,
                            updated_at: Utc::now(),
                        },
                        None => placeholder_failure(
                            self.id(),
                            "Kimi 开放平台余额",
                            "响应缺少 available_balance",
                            Some("https://platform.kimi.com/console"),
                            false,
                        ),
                    }
                }
                Err(e) => placeholder_failure(
                    self.id(),
                    "Kimi 开放平台余额",
                    &format!("解析失败: {e}"),
                    Some("https://platform.kimi.com/console"),
                    false,
                ),
            },
            Ok(resp) => placeholder_failure(
                self.id(),
                "Kimi 开放平台余额",
                &format!("HTTP {}（检查国内/国际站与 Key 是否匹配）", resp.status()),
                Some("https://platform.kimi.com/console"),
                false,
            ),
            Err(e) => placeholder_failure(
                self.id(),
                "Kimi 开放平台余额",
                &format!("请求失败: {e}"),
                Some("https://platform.kimi.com/console"),
                false,
            ),
        }
    }
}
