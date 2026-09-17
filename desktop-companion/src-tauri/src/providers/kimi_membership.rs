//! Kimi Code / membership quota — PRIMARY.
//!
//! Auth (Bearer only — no cookies):
//! - Preferred: Console API key `sk-kimi-…` via `KIMI_CODE_TOKEN` / `KIMI_API_KEY`
//! - Fallback: OAuth `access_token` from local `kimi login` credentials file
//!
//! Endpoint (semi-official / community + CLI ecosystem):
//!   GET {base}/usages  default base https://api.kimi.com/coding/v1
//!
//! Do NOT use Moonshot Open Platform keys here.

use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use crate::config::{resolve_kimi_code_token, AppConfig};
use crate::models::QuotaSnapshot;
use crate::providers::{http_client, placeholder_failure, QuotaProvider};

const FALLBACK_URL: &str = "https://www.kimi.com/code";
const HELP_MIXED_KEY: &str =
    "请确认使用 Kimi Code Console 的 sk-kimi-… Key（或 kimi login 的 access_token），不要用开放平台 Moonshot Key。";

pub struct KimiMembershipProvider {
    token: Option<String>,
    token_source: Option<&'static str>,
    base_url: String,
    token_ref: String,
}

impl KimiMembershipProvider {
    pub fn from_config(config: &AppConfig) -> Self {
        let resolved = resolve_kimi_code_token(&config.kimi_code_token_ref);
        Self {
            token: resolved.as_ref().map(|(t, _)| t.clone()),
            token_source: resolved.map(|(_, s)| s),
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
            return QuotaSnapshot {
                id: self.id().into(),
                display_name: "Kimi 会员额度".into(),
                primary_value: None,
                secondary_value: None,
                unit: None,
                ok: false,
                error_message: Some(format!(
                    "未配置凭证。请在 desktop-companion/.env 设置 KIMI_CODE_TOKEN=sk-kimi-… \
                     （或 KIMI_API_KEY），或先执行 kimi login。详见 docs/kimi-membership-credentials.md。\
                     （期望 ref: {}）",
                    self.token_ref
                )),
                fallback_url: Some(FALLBACK_URL.into()),
                experimental: true,
                updated_at: Utc::now(),
            };
        };

        let url = format!("{}/usages", self.base_url.trim_end_matches('/'));
        let res = http_client()
            .get(&url)
            .bearer_auth(token)
            .header("Accept", "application/json")
            // Some Code endpoints gate on UA; harmless for usages in most clients.
            .header("User-Agent", "KimiCLI/1.0 (desktop-companion)")
            .send()
            .await;

        match res {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    match resp.json::<Value>().await {
                        Ok(body) => {
                            let mut snap = parse_usages(body);
                            if snap.ok {
                                if let Some(src) = self.token_source {
                                    snap.secondary_value = Some(match snap.secondary_value {
                                        Some(s) => format!("{s} · 凭证来源 {src}"),
                                        None => format!("凭证来源 {src}"),
                                    });
                                }
                            }
                            snap
                        }
                        Err(e) => placeholder_failure(
                            self.id(),
                            "Kimi 会员额度",
                            &format!("响应解析失败: {e}"),
                            Some(FALLBACK_URL),
                            true,
                        ),
                    }
                } else {
                    let body_hint = resp.text().await.unwrap_or_default();
                    let short = body_hint.chars().take(120).collect::<String>();
                    let msg = match status.as_u16() {
                        401 => format!("HTTP 401 鉴权失败。{HELP_MIXED_KEY} {short}"),
                        403 => format!(
                            "HTTP 403 拒绝访问。检查会员是否有效、Key 是否被吊销。{short}"
                        ),
                        code => format!("HTTP {code}（半官方 /usages，可能变更）{short}"),
                    };
                    placeholder_failure(self.id(), "Kimi 会员额度", &msg, Some(FALLBACK_URL), true)
                }
            }
            Err(e) => placeholder_failure(
                self.id(),
                "Kimi 会员额度",
                &format!("请求失败: {e}"),
                Some(FALLBACK_URL),
                true,
            ),
        }
    }
}

fn parse_usages(body: Value) -> QuotaSnapshot {
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
            fallback_url: Some(FALLBACK_URL.into()),
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
