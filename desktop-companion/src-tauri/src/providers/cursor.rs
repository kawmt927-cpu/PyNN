//! Cursor personal plan usage — semi-official / dashboard-style (no Enterprise Admin).

use async_trait::async_trait;

use crate::config::AppConfig;
use crate::models::QuotaSnapshot;
use crate::providers::{
    missing_secret_snapshot, placeholder_failure, resolve_secret, QuotaProvider,
};

const SPENDING_URL: &str = "https://cursor.com/dashboard/spending";

pub struct CursorPersonalProvider {
    /// Session / experimental token path — not committed; env only when user opts in.
    experimental: bool,
    secret: Option<String>,
    secret_ref: String,
}

impl CursorPersonalProvider {
    pub fn from_config(config: &AppConfig) -> Self {
        // Prefer dedicated usage session env; fall back unset → clear failure UX.
        let secret = resolve_secret("env:CURSOR_USAGE_SESSION_TOKEN");
        Self {
            experimental: config.cursor_usage_experimental,
            secret,
            secret_ref: "env:CURSOR_USAGE_SESSION_TOKEN".into(),
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
                "个人用量实验开关已关闭。请打开 Spending 仪表盘查看。",
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
            "半官方 Dashboard 拉取尚未接线。请打开 Spending；接线后将显示真实剩余。",
            Some(SPENDING_URL),
            true,
        )
    }
}
