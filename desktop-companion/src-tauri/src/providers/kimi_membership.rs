//! Kimi Code / membership quota — PRIMARY (semi-official usages API).

use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use crate::config::AppConfig;
use crate::models::QuotaSnapshot;
use crate::providers::{
    http_client, missing_secret_snapshot, placeholder_failure, resolve_secret, QuotaProvider,
};

pub struct KimiMembershipProvider {
    token: Option<String>,
    base_url: String,
    token_ref: String,
}

impl KimiMembershipProvider {
    pub fn from_config(config: &AppConfig) -> Self {
        Self {
            token: resolve_secret(&config.kimi_code_token_ref),
            base_url: config.kimi_code_base_url.clone(),
            token_ref: config.kimi_code_token_ref.clone(),
        }
    }
}

#[async_trait]
impl QuotaProvider for KimiMembershipProvider {
    fn id(&self) -> &str {
        "kimi_code_membership"
    }

    async fn fetch(&self) -> QuotaSnapshot {
        let Some(token) = &self.token else {
            return missing_secret_snapshot(
                self.id(),
                "Kimi 会员额度",
                &self.token_ref,
                Some("https://www.kimi.com/code"),
                true,
            );
        };

        let url = format!("{}/usages", self.base_url.trim_end_matches('/'));
        let res = http_client()
            .get(&url)
            .bearer_auth(token)
            .header("Accept", "application/json")
            .send()
            .await;

        match res {
            Ok(resp) if resp.status().is_success() => match resp.json::<Value>().await {
                Ok(body) => parse_usages(body),
                Err(e) => placeholder_failure(
                    self.id(),
                    "Kimi 会员额度",
                    &format!("响应解析失败: {e}"),
                    Some("https://www.kimi.com/code"),
                    true,
                ),
            },
            Ok(resp) => placeholder_failure(
                self.id(),
                "Kimi 会员额度",
                &format!("HTTP {}（半官方接口，可能变更）", resp.status()),
                Some("https://www.kimi.com/code"),
                true,
            ),
            Err(e) => placeholder_failure(
                self.id(),
                "Kimi 会员额度",
                &format!("请求失败: {e}"),
                Some("https://www.kimi.com/code"),
                true,
            ),
        }
    }
}

fn parse_usages(body: Value) -> QuotaSnapshot {
    // Shape varies; support common community fields without inventing numbers.
    let usage = body.get("usage");
    let limit = usage
        .and_then(|u| u.get("limit"))
        .and_then(|v| json_to_string(v));
    let used = usage
        .and_then(|u| u.get("used"))
        .and_then(|v| json_to_string(v));
    let remaining = usage
        .and_then(|u| u.get("remaining"))
        .and_then(|v| json_to_string(v));
    let reset = usage
        .and_then(|u| {
            u.get("reset_at")
                .or_else(|| u.get("resetTime"))
                .or_else(|| u.get("resetAt"))
        })
        .and_then(|v| json_to_string(v));

    let primary = match (&remaining, &used, &limit) {
        (Some(r), _, Some(l)) => Some(format!("剩余 {r} / {l}")),
        (Some(r), _, None) => Some(format!("剩余 {r}")),
        (None, Some(u), Some(l)) => Some(format!("已用 {u} / {l}")),
        _ => None,
    };

    let window = body
        .get("limits")
        .and_then(|a| a.as_array())
        .and_then(|a| a.first())
        .and_then(|w| {
            let detail = w.get("detail")?;
            let rem = detail.get("remaining").and_then(json_to_string)?;
            let lim = detail.get("limit").and_then(json_to_string)?;
            Some(format!("窗口剩余 {rem}/{lim}"))
        });

    let secondary = match (window, reset) {
        (Some(w), Some(r)) => Some(format!("{w} · 重置 {r}")),
        (Some(w), None) => Some(w),
        (None, Some(r)) => Some(format!("重置 {r}")),
        _ => None,
    };

    if primary.is_none() {
        return QuotaSnapshot {
            id: "kimi_code_membership".into(),
            display_name: "Kimi 会员额度".into(),
            primary_value: None,
            secondary_value: None,
            unit: None,
            ok: false,
            error_message: Some("响应缺少可识别额度字段（未伪造数值）".into()),
            fallback_url: Some("https://www.kimi.com/code".into()),
            experimental: true,
            updated_at: Utc::now(),
        };
    }

    QuotaSnapshot {
        id: "kimi_code_membership".into(),
        display_name: "Kimi 会员额度".into(),
        primary_value: primary,
        secondary_value: secondary,
        unit: None,
        ok: true,
        error_message: None,
        fallback_url: None,
        experimental: true,
        updated_at: Utc::now(),
    }
}

fn json_to_string(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
