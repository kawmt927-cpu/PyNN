//! Kimi **会员 · 用量进度**（主行）— 对齐官方桌面「总使用量 / Kimi vs Code」图例。
//!
//! NOT Kimi Code Console (`sk-kimi-` / `api.kimi.com/coding/v1/usages`).
//!
//! Semi-official Connect RPC used by kimi.com / desktop membership UI:
//!   POST /apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats
//! Auth: consumer Access Token (= cookie `kimi-auth`), via env `KIMI_AUTH_TOKEN`.

use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use crate::config::{resolve_kimi_member_token, AppConfig};
use crate::models::QuotaSnapshot;
use crate::providers::{http_client, placeholder_failure, QuotaProvider};

const STATS_URL: &str =
    "https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats";
const SUB_URL: &str =
    "https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscription";
const FALLBACK_URL: &str = "https://www.kimi.com";
const HELP: &str =
    "需要网页/桌面登录会话 Token（Cookie kimi-auth）。请在应用「设置」中粘贴保存，或备用环境变量 KIMI_AUTH_TOKEN。不要使用 Code 的 sk-kimi- Key。";

pub struct KimiMembershipProvider {
    token: Option<String>,
    token_source: Option<&'static str>,
    token_ref: String,
}

impl KimiMembershipProvider {
    pub fn from_config(config: &AppConfig) -> Self {
        let resolved = resolve_kimi_member_token(&config.kimi_auth_token_ref);
        Self {
            token: resolved.as_ref().map(|(t, _)| t.clone()),
            token_source: resolved.map(|(_, s)| s),
            token_ref: config.kimi_auth_token_ref.clone(),
        }
    }
}

#[async_trait]
impl QuotaProvider for KimiMembershipProvider {
    fn id(&self) -> &str {
        "kimi_member_usage"
    }

    async fn fetch(&self) -> QuotaSnapshot {
        let Some(token) = &self.token else {
            return QuotaSnapshot {
                id: self.id().into(),
                display_name: "Kimi 会员 · 用量进度".into(),
                primary_value: None,
                secondary_value: None,
                unit: None,
                ok: false,
                error_message: Some(format!(
                    "未配置会员会话。请打开「设置」粘贴 Cookie「kimi-auth」（Access Token）并保存，\
                     然后点刷新（勿发聊天）。{HELP}（ref: {}）",
                    self.token_ref
                )),
                fallback_url: Some(FALLBACK_URL.into()),
                experimental: true,
                updated_at: Utc::now(),
            };
        };

        let stats = post_connect(STATS_URL, token, serde_json::json!({})).await;
        match stats {
            Ok(body) => parse_stats(body, self.token_source, token).await,
            Err(msg) => placeholder_failure(
                self.id(),
                "Kimi 会员 · 用量进度",
                &format!("{msg}。{HELP}"),
                Some(FALLBACK_URL),
                true,
            ),
        }
    }
}

async fn post_connect(url: &str, token: &str, body: Value) -> Result<Value, String> {
    let resp = http_client()
        .post(url)
        .bearer_auth(token)
        .header("Cookie", format!("kimi-auth={token}"))
        .header("Content-Type", "application/json")
        .header("Accept", "*/*")
        .header("connect-protocol-version", "1")
        .header("Origin", "https://www.kimi.com")
        .header("Referer", "https://www.kimi.com/")
        .header("x-msh-platform", "web")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let short: String = text.chars().take(160).collect();
        return Err(match status.as_u16() {
            401 => format!("HTTP 401 会话无效或过期。请重新复制 kimi-auth。{short}"),
            403 => format!("HTTP 403 拒绝访问。{short}"),
            code => format!("HTTP {code}（半官方 GetSubscriptionStats）。{short}"),
        });
    }
    serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败: {e}"))
}

async fn parse_stats(
    body: Value,
    token_source: Option<&'static str>,
    token: &str,
) -> QuotaSnapshot {
    let bal = body
        .get("subscriptionBalance")
        .or_else(|| body.get("subscription_balance"));

    let total = bal
        .and_then(|b| {
            b.get("amountUsedRatio")
                .or_else(|| b.get("amount_used_ratio"))
        })
        .and_then(as_f64);

    let code_ratio = bal
        .and_then(|b| {
            b.get("kimiCodeUsedRatio")
                .or_else(|| b.get("kimi_code_used_ratio"))
        })
        .and_then(as_f64)
        .unwrap_or(0.0);

    let expire = bal
        .and_then(|b| b.get("expireTime").or_else(|| b.get("expire_time")))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let Some(total_r) = total else {
        return placeholder_failure(
            "kimi_member_usage",
            "Kimi 会员 · 用量进度",
            "响应缺少 subscriptionBalance.amountUsedRatio（未伪造数值）",
            Some(FALLBACK_URL),
            true,
        );
    };

    // Mirror desktop legend: Kimi (non-Code) + Code segments of the monthly pool.
    let kimi_r = (total_r - code_ratio).max(0.0);
    let primary = format!(
        "总使用量 {:.2}% · Kimi {:.2}% · Code {:.2}%",
        total_r * 100.0,
        kimi_r * 100.0,
        code_ratio * 100.0
    );

    let mut secondary_parts = Vec::new();
    if let Some(exp) = &expire {
        secondary_parts.push(format!("重置/到期 {exp}"));
    }

    // Best-effort plan title (Allegretto etc.)
    if let Ok(sub) = post_connect(SUB_URL, token, serde_json::json!({})).await {
        if let Some(title) = sub
            .pointer("/subscription/goods/title")
            .or_else(|| sub.pointer("/purchaseSubscription/goods/title"))
            .and_then(|v| v.as_str())
        {
            secondary_parts.insert(0, title.to_string());
        }
        if let Some(end) = sub
            .pointer("/subscription/currentEndTime")
            .or_else(|| sub.pointer("/subscription/current_end_time"))
            .and_then(|v| v.as_str())
        {
            secondary_parts.push(format!("有效期至 {end}"));
        }
    }

    if let Some(src) = token_source {
        secondary_parts.push(format!("凭证 {src}"));
    }
    secondary_parts.push("Code 5h/7d 未在主行展示".into());

    QuotaSnapshot {
        id: "kimi_member_usage".into(),
        display_name: "Kimi 会员 · 用量进度".into(),
        primary_value: Some(primary),
        secondary_value: Some(secondary_parts.join(" · ")),
        unit: Some("%".into()),
        ok: true,
        error_message: None,
        fallback_url: None,
        experimental: true,
        updated_at: Utc::now(),
    }
}

fn as_f64(v: &Value) -> Option<f64> {
    v.as_f64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}
