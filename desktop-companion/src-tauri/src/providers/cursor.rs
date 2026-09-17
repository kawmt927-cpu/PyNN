//! Cursor personal plan usage — semi-official / dashboard-style (no Enterprise Admin).
//!
//! Personal Cursor has no stable public usage API. This adapter is honest about that:
//! when session/token is missing or parse is not wired, it fails closed with a
//! Spending dashboard deep-link — never invents remaining %.

use async_trait::async_trait;

use crate::config::{resolve_cursor_usage_session, AppConfig};
use crate::models::QuotaSnapshot;
use crate::providers::{missing_secret_snapshot, placeholder_failure, QuotaProvider};
use crate::secrets::CURSOR_USAGE_SESSION;

const SPENDING_URL: &str = "https://cursor.com/dashboard/spending";

pub struct CursorPersonalProvider {
    /// Session / experimental token path — not committed; settings or env when user opts in.
    experimental: bool,
    secret: Option<String>,
    secret_ref: String,
}

impl CursorPersonalProvider {
    pub fn from_config(config: &AppConfig) -> Self {
        let secret = resolve_cursor_usage_session(config);
        Self {
            experimental: config.cursor_usage_experimental,
            secret,
            secret_ref: format!("settings:{CURSOR_USAGE_SESSION} / env:CURSOR_USAGE_SESSION_TOKEN"),
        }
    }
}

#[async_trait]
impl QuotaProvider for CursorPersonalProvider {
    fn id(&self) -> &str {
        "cursor_personal"
    }

    async fn fetch(&self) -> QuotaSnapshot {
        if !self.experimental {
            return placeholder_failure(
                self.id(),
                "Cursor 用量",
                "个人用量实验开关已关闭。请打开 Spending 仪表盘查看真实额度。",
                Some(SPENDING_URL),
                true,
            );
        }

        if self.secret.is_none() {
            return missing_secret_snapshot(
                self.id(),
                "Cursor 用量",
                &self.secret_ref,
                Some(SPENDING_URL),
                true,
            );
        }

        // TODO: Wire community-known dashboard JSON (usage-summary / Connect RPC).
        // Never invent remaining % when parse fails — always deep-link Spending.
        placeholder_failure(
            self.id(),
            "Cursor 用量",
            "半官方 Dashboard 拉取尚未接线（个人版无稳定公开 API）。请打开 Spending 查看真实额度；接线后将显示真实剩余，不会造假数字。",
            Some(SPENDING_URL),
            true,
        )
    }
}
