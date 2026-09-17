//! Cursor personal plan usage via semi-official Spending / Dashboard endpoints.
//!
//! Personal Cursor has no stable public usage API. We call community-known
//! Connect RPC / dashboard JSON with a session (auto-imported or pasted).
//! Fail closed → Spending deep-link; never invent remaining %.
//!
//! ## Percentage semantics (see docs/spending-percent-audit.md)
//! Spending UI “usage progress” text (`displayMessage`) uses **spend / limit**
//! (`includedSpend/limit`), NOT `planUsage.totalPercentUsed` (pool-weighted
//! internal metric). We prefer the spend-based / displayMessage percent so the
//! companion matches the dashboard; pool-weighted % is labeled separately.

use async_trait::async_trait;
use chrono::Utc;
use serde_json::Value;

use crate::config::{resolve_cursor_usage_session, AppConfig};
use crate::models::QuotaSnapshot;
use crate::providers::{http_client, missing_secret_snapshot, placeholder_failure, QuotaProvider};
use crate::secrets::CURSOR_USAGE_SESSION;

const SPENDING_URL: &str = "https://cursor.com/dashboard/spending";
const CONNECT_USAGE_URL: &str =
    "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
const USAGE_SUMMARY_URL: &str = "https://cursor.com/api/usage-summary";

pub struct CursorPersonalProvider {
    secret: Option<String>,
    secret_ref: String,
}

impl CursorPersonalProvider {
    pub fn from_config(config: &AppConfig) -> Self {
        let secret = resolve_cursor_usage_session(config);
        let secret_ref = match config.session_auth_mode.as_str() {
            "auto_cursor" => "自动：Cursor IDE 会话".to_string(),
            "auto_browser" => format!(
                "自动：浏览器 Cookie（{}）",
                config.browser_cookie_source
            ),
            "auto" => "自动：Cursor IDE → 浏览器 → 已保存会话".to_string(),
            _ => format!("settings:{CURSOR_USAGE_SESSION} / env:CURSOR_USAGE_SESSION_TOKEN"),
        };
        Self { secret, secret_ref }
    }
}

#[async_trait]
impl QuotaProvider for CursorPersonalProvider {
    fn id(&self) -> &str {
        "cursor_personal"
    }

    async fn fetch(&self) -> QuotaSnapshot {
        let Some(raw) = self.secret.as_deref() else {
            return missing_secret_snapshot(
                self.id(),
                "Cursor Spending",
                &self.secret_ref,
                Some(SPENDING_URL),
                true,
            );
        };

        let session = normalize_session(raw);
        if session.bearer.is_empty() {
            return missing_secret_snapshot(
                self.id(),
                "Cursor Spending",
                &self.secret_ref,
                Some(SPENDING_URL),
                true,
            );
        }

        // Prefer Connect RPC (Bearer), then dashboard cookie REST.
        match fetch_connect_period_usage(&session.bearer).await {
            Ok(snap) => return snap,
            Err(connect_err) => {
                match fetch_usage_summary_cookie(&session.cookie_value).await {
                    Ok(snap) => return snap,
                    Err(rest_err) => {
                        return placeholder_failure(
                            self.id(),
                            "Cursor Spending",
                            &format!(
                                "半官方 Spending 拉取失败（Connect: {connect_err}；usage-summary: {rest_err}）。会话可能过期。请打开 Spending，或在设置中重新导入/粘贴会话。"
                            ),
                            Some(SPENDING_URL),
                            true,
                        );
                    }
                }
            }
        }
    }
}

struct NormalizedSession {
    /// JWT-ish token for Bearer auth (strip cookie wrapper if present).
    bearer: String,
    /// Value suitable for `WorkosCursorSessionToken=` cookie header.
    cookie_value: String,
}

/// Accept either a raw JWT, `userId::jwt`, or full `WorkosCursorSessionToken=...` paste.
fn normalize_session(raw: &str) -> NormalizedSession {
    let t = raw.trim();
    let t = t
        .strip_prefix("WorkosCursorSessionToken=")
        .unwrap_or(t)
        .trim()
        .trim_matches('"');

    let cookie_value = t.to_string();
    // Cookie form is often `userId%3A%3Ajwt` or `userId::jwt`.
    let bearer = if let Some(idx) = t.find("::") {
        t[idx + 2..].to_string()
    } else if let Some(idx) = t.find("%3A%3A") {
        percent_decode_minimal(&t[idx + 6..])
    } else if let Some(idx) = t.find("%3a%3a") {
        percent_decode_minimal(&t[idx + 6..])
    } else {
        t.to_string()
    };

    NormalizedSession {
        bearer: bearer.trim().to_string(),
        cookie_value,
    }
}

fn percent_decode_minimal(s: &str) -> String {
    // Only what we need for JWT characters; keep simple to avoid extra deps.
    s.replace("%2B", "+")
        .replace("%2b", "+")
        .replace("%2F", "/")
        .replace("%2f", "/")
        .replace("%3D", "=")
        .replace("%3d", "=")
}

async fn fetch_connect_period_usage(bearer: &str) -> Result<QuotaSnapshot, String> {
    let resp = http_client()
        .post(CONNECT_USAGE_URL)
        .header("Authorization", format!("Bearer {bearer}"))
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .body("{}")
        .send()
        .await
        .map_err(|e| format!("network {e}"))?;

    let status = resp.status();
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("json {e}"))?;

    if !status.is_success() {
        let msg = body
            .get("message")
            .or_else(|| body.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("unauthorized or rejected");
        return Err(format!("HTTP {status}: {msg}"));
    }

    parse_period_usage_body(&body, "Connect GetCurrentPeriodUsage")
}

async fn fetch_usage_summary_cookie(cookie_value: &str) -> Result<QuotaSnapshot, String> {
    let resp = http_client()
        .get(USAGE_SUMMARY_URL)
        .header(
            "Cookie",
            format!("WorkosCursorSessionToken={cookie_value}"),
        )
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("network {e}"))?;

    let status = resp.status();
    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("json {e}"))?;

    if !status.is_success() {
        let msg = body
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("not_authenticated");
        return Err(format!("HTTP {status}: {msg}"));
    }

    parse_usage_summary_body(&body)
}

/// Resolved display percent + provenance label (never invent).
#[derive(Debug, Clone, PartialEq)]
struct ResolvedPercent {
    /// Rounded integer 0–100+ for display.
    rounded: i64,
    /// Short Chinese label for the metric.
    metric_label: &'static str,
}

/// Prefer Spending-dashboard progress (displayMessage / spend÷limit) over
/// pool-weighted `totalPercentUsed` — official staff note that these diverge.
fn resolve_spending_progress_percent(plan: &Value, body: &Value) -> Result<ResolvedPercent, String> {
    // 1) displayMessage prose is what Spending shows as “You've used N%…”.
    if let Some(p) = percent_from_display_messages(body) {
        return Ok(ResolvedPercent {
            rounded: p.round().clamp(0.0, 999.0) as i64,
            metric_label: "套餐进度",
        });
    }

    // 2) Spend / limit (cents) — same basis as displayMessage per Cursor staff.
    if let Some(p) = spend_based_percent(plan) {
        return Ok(ResolvedPercent {
            rounded: p.round().clamp(0.0, 999.0) as i64,
            metric_label: "套餐进度",
        });
    }

    // 3) Fallback: pool-weighted totalPercentUsed (IDE / dual-bar aggregate).
    if let Some(p) = first_f64(plan, &["totalPercentUsed", "total_percent_used"]) {
        return Ok(ResolvedPercent {
            rounded: p.round().clamp(0.0, 999.0) as i64,
            metric_label: "池加权",
        });
    }

    Err("no displayMessage % / spend÷limit / totalPercentUsed".into())
}

fn spend_based_percent(plan: &Value) -> Option<f64> {
    let limit = first_i64(plan, &["limit"])?;
    if limit <= 0 {
        return None;
    }
    // Prefer includedSpend (matches displayMessage); else totalSpend; else used = limit - remaining.
    if let Some(inc) = first_i64(plan, &["includedSpend", "included_spend"]) {
        return Some((inc as f64 / limit as f64) * 100.0);
    }
    if let Some(total) = first_i64(plan, &["totalSpend", "total_spend"]) {
        return Some((total as f64 / limit as f64) * 100.0);
    }
    if let Some(rem) = first_i64(plan, &["remaining"]) {
        return Some((1.0 - (rem as f64 / limit as f64)) * 100.0);
    }
    None
}

fn percent_from_display_messages(body: &Value) -> Option<f64> {
    const KEYS: &[&str] = &[
        "displayMessage",
        "display_message",
        "autoModelSelectedDisplayMessage",
        "namedModelSelectedDisplayMessage",
    ];
    for k in KEYS {
        if let Some(s) = body.get(*k).and_then(|v| v.as_str()) {
            if let Some(p) = parse_percent_in_prose(s) {
                return Some(p);
            }
        }
    }
    None
}

/// Extract N from strings like "You've used 43% of your included usage".
fn parse_percent_in_prose(s: &str) -> Option<f64> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() {
            let start = i;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            if i < bytes.len() && bytes[i] == b'%' {
                let num = std::str::from_utf8(&bytes[start..i]).ok()?;
                let f: f64 = num.parse().ok()?;
                if f.is_finite() {
                    return Some(f);
                }
            }
        } else {
            i += 1;
        }
    }
    None
}

fn parse_period_usage_body(body: &Value, source: &str) -> Result<QuotaSnapshot, String> {
    let plan = body
        .get("planUsage")
        .or_else(|| body.get("plan_usage"))
        .ok_or_else(|| "missing planUsage".to_string())?;

    let resolved = resolve_spending_progress_percent(plan, body)?;
    let primary = format!("{}%", resolved.rounded);

    let pool_total = first_f64(plan, &["totalPercentUsed", "total_percent_used"]);
    let auto_pct = first_f64(plan, &["autoPercentUsed", "auto_percent_used"]);
    let api_pct = first_f64(plan, &["apiPercentUsed", "api_percent_used"]);
    let remaining_cents = first_i64(plan, &["remaining"]);
    let limit_cents = first_i64(plan, &["limit"]);
    let included = first_i64(plan, &["includedSpend", "included_spend"]);
    let total_spend = first_i64(plan, &["totalSpend", "total_spend"]);

    let display_msg = body
        .get("displayMessage")
        .or_else(|| body.get("display_message"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut secondary_parts = Vec::new();
    secondary_parts.push(format!("口径：{}", resolved.metric_label));

    if let (Some(rem), Some(lim)) = (remaining_cents, limit_cents) {
        secondary_parts.push(format!(
            "剩余 ${:.2} / 额度 ${:.2}",
            rem as f64 / 100.0,
            lim as f64 / 100.0
        ));
    } else if let (Some(inc), Some(lim)) = (included, limit_cents) {
        secondary_parts.push(format!(
            "已用 ${:.2} / 额度 ${:.2}",
            inc as f64 / 100.0,
            lim as f64 / 100.0
        ));
    } else if let Some(inc) = included {
        secondary_parts.push(format!("已用 included ${:.2}", inc as f64 / 100.0));
    } else if let Some(ts) = total_spend {
        secondary_parts.push(format!("totalSpend ${:.2}", ts as f64 / 100.0));
    }

    // When primary is spend-based, surface pool-weighted % if it differs.
    if resolved.metric_label != "池加权" {
        if let Some(p) = pool_total {
            let pr = p.round() as i64;
            if pr != resolved.rounded {
                secondary_parts.push(format!("池加权 {pr}%"));
            }
        }
    }
    if let Some(a) = auto_pct {
        secondary_parts.push(format!("Cursor Models {:.0}%", a.round()));
    }
    if let Some(a) = api_pct {
        secondary_parts.push(format!("Other Models {:.0}%", a.round()));
    }
    if let Some(m) = display_msg {
        secondary_parts.push(m);
    }
    secondary_parts.push(format!("来源：{source} · 半官方"));

    let unit = match resolved.metric_label {
        "套餐进度" => "已用（对齐 Spending）",
        "池加权" => "已用（池加权）",
        _ => "已用",
    };

    Ok(QuotaSnapshot {
        id: "cursor_personal".into(),
        display_name: "Cursor Spending".into(),
        primary_value: Some(primary),
        secondary_value: Some(secondary_parts.join(" · ")),
        unit: Some(unit.into()),
        ok: true,
        error_message: None,
        fallback_url: Some(SPENDING_URL.into()),
        experimental: true,
        updated_at: Utc::now(),
    })
}

fn parse_usage_summary_body(body: &Value) -> Result<QuotaSnapshot, String> {
    // Shape varies; try nested planUsage first, then individualUsage.plan, then flat.
    if body.get("planUsage").is_some() || body.get("plan_usage").is_some() {
        return parse_period_usage_body(body, "GET /api/usage-summary");
    }

    if let Some(plan) = body
        .get("individualUsage")
        .and_then(|u| u.get("plan"))
        .or_else(|| {
            body.get("individual_usage")
                .and_then(|u| u.get("plan"))
        })
    {
        // Reuse period parser with a synthetic wrapper so displayMessage on root still works.
        let mut wrapper = serde_json::Map::new();
        wrapper.insert("planUsage".into(), plan.clone());
        for k in [
            "displayMessage",
            "display_message",
            "autoModelSelectedDisplayMessage",
            "namedModelSelectedDisplayMessage",
        ] {
            if let Some(v) = body.get(k) {
                wrapper.insert(k.into(), v.clone());
            }
        }
        return parse_period_usage_body(&Value::Object(wrapper), "GET /api/usage-summary · individualUsage.plan");
    }

    let percent = first_f64(body, &[
        "totalPercentUsed",
        "percentUsed",
        "usagePercent",
        "percentage",
    ])
    .or_else(|| {
        body.get("individualUsage")
            .and_then(|u| first_f64(u, &["totalPercentUsed", "percentUsed"]))
    })
    .or_else(|| percent_from_display_messages(body));

    let Some(p) = percent else {
        return Err("usage-summary: no recognizable percent field".into());
    };

    Ok(QuotaSnapshot {
        id: "cursor_personal".into(),
        display_name: "Cursor Spending".into(),
        primary_value: Some(format!("{:.0}%", p.round())),
        secondary_value: Some("来源：GET /api/usage-summary · 半官方 · 口径可能为池加权".into()),
        unit: Some("已用".into()),
        ok: true,
        error_message: None,
        fallback_url: Some(SPENDING_URL.into()),
        experimental: true,
        updated_at: Utc::now(),
    })
}

fn first_f64(v: &Value, keys: &[&str]) -> Option<f64> {
    for k in keys {
        if let Some(n) = v.get(*k) {
            if let Some(f) = n.as_f64() {
                if f.is_finite() {
                    return Some(f);
                }
            }
            if let Some(i) = n.as_i64() {
                return Some(i as f64);
            }
            if let Some(s) = n.as_str() {
                if let Ok(f) = s.parse::<f64>() {
                    if f.is_finite() {
                        return Some(f);
                    }
                }
            }
        }
    }
    None
}

fn first_i64(v: &Value, keys: &[&str]) -> Option<i64> {
    for k in keys {
        if let Some(n) = v.get(*k) {
            if let Some(i) = n.as_i64() {
                return Some(i);
            }
            if let Some(f) = n.as_f64() {
                if f.is_finite() {
                    return Some(f.round() as i64);
                }
            }
            if let Some(s) = n.as_str() {
                if let Ok(i) = s.parse::<i64>() {
                    return Some(i);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_cookie_prefix_and_user_id() {
        let s = normalize_session("WorkosCursorSessionToken=user_abc::eyJhbGciOi.test");
        assert_eq!(s.bearer, "eyJhbGciOi.test");
        assert!(s.cookie_value.contains("user_abc"));
    }

    #[test]
    fn parse_percent_from_prose() {
        assert_eq!(
            parse_percent_in_prose("You've used 43% of your included usage"),
            Some(43.0)
        );
        assert_eq!(parse_percent_in_prose("You've hit your usage limit"), None);
    }

    #[test]
    fn prefer_display_message_over_total_percent_used() {
        // Live-test style: totalPercentUsed ≈ 39 but displayMessage says 43%.
        let body = serde_json::json!({
            "planUsage": {
                "totalPercentUsed": 39.3,
                "includedSpend": 2000,
                "remaining": 1140,
                "limit": 4651,
                "autoPercentUsed": 20.0,
                "apiPercentUsed": 50.0
            },
            "displayMessage": "You've used 43% of your included usage"
        });
        let snap = parse_period_usage_body(&body, "test").unwrap();
        assert!(snap.ok);
        assert_eq!(snap.primary_value.as_deref(), Some("43%"));
        assert!(snap.unit.as_deref().unwrap().contains("Spending"));
        let sec = snap.secondary_value.unwrap();
        assert!(sec.contains("池加权 39%") || sec.contains("池加权 39"));
    }

    #[test]
    fn prefer_spend_ratio_when_no_display_percent() {
        let body = serde_json::json!({
            "planUsage": {
                "totalPercentUsed": 39.3,
                "includedSpend": 2000,
                "limit": 4651,
            },
            "displayMessage": "You've hit your usage limit"
        });
        let snap = parse_period_usage_body(&body, "test").unwrap();
        // 2000/4651 ≈ 43.0%
        assert_eq!(snap.primary_value.as_deref(), Some("43%"));
    }

    #[test]
    fn fallback_pool_weighted_when_no_spend() {
        let body = serde_json::json!({
            "planUsage": {
                "totalPercentUsed": 15.48,
            }
        });
        let snap = parse_period_usage_body(&body, "test").unwrap();
        assert_eq!(snap.primary_value.as_deref(), Some("15%"));
        assert!(snap.unit.as_deref().unwrap().contains("池加权"));
    }

    #[test]
    fn usage_summary_individual_usage_plan() {
        let body = serde_json::json!({
            "individualUsage": {
                "plan": {
                    "totalPercentUsed": 39.3,
                    "includedSpend": 860,
                    "limit": 2000,
                    "autoPercentUsed": 10.0,
                    "apiPercentUsed": 20.0
                }
            },
            "displayMessage": "You've used 43% of your included usage"
        });
        let snap = parse_usage_summary_body(&body).unwrap();
        assert_eq!(snap.primary_value.as_deref(), Some("43%"));
    }

    #[test]
    fn parse_period_usage_missing_fails() {
        let body = serde_json::json!({"foo": 1});
        assert!(parse_period_usage_body(&body, "test").is_err());
    }
}
