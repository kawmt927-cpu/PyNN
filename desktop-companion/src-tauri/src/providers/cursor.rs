//! Cursor personal plan usage via semi-official Spending / Dashboard endpoints.
//!
//! Personal Cursor has no stable public usage API. We call community-known
//! Connect RPC / dashboard JSON with a user-pasted session (cookie or JWT).
//! Fail closed → Spending deep-link; never invent remaining %.

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
        Self {
            secret,
            secret_ref: format!(
                "settings:{CURSOR_USAGE_SESSION} / env:CURSOR_USAGE_SESSION_TOKEN"
            ),
        }
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
                                "半官方 Spending 拉取失败（Connect: {connect_err}；usage-summary: {rest_err}）。会话可能过期。请打开 Spending 查看真实额度，或重新粘贴会话。"
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
        // URL-encoded ::
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

fn parse_period_usage_body(body: &Value, source: &str) -> Result<QuotaSnapshot, String> {
    let plan = body
        .get("planUsage")
        .or_else(|| body.get("plan_usage"))
        .ok_or_else(|| "missing planUsage".to_string())?;

    let percent = first_f64(plan, &["totalPercentUsed", "total_percent_used"]);
    let remaining_cents = first_i64(plan, &["remaining"]);
    let limit_cents = first_i64(plan, &["limit"]);
    let included = first_i64(plan, &["includedSpend", "included_spend"]);

    let display_msg = body
        .get("displayMessage")
        .or_else(|| body.get("display_message"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let primary = if let Some(p) = percent {
        format!("{:.0}%", p.round())
    } else if let (Some(rem), Some(lim)) = (remaining_cents, limit_cents) {
        if lim > 0 {
            let used_pct = (1.0 - (rem as f64 / lim as f64)) * 100.0;
            format!("{:.0}%", used_pct.clamp(0.0, 100.0).round())
        } else {
            return Err("limit=0 and no percent".into());
        }
    } else {
        return Err("no totalPercentUsed / remaining+limit".into());
    };

    let mut secondary_parts = Vec::new();
    if let (Some(rem), Some(lim)) = (remaining_cents, limit_cents) {
        secondary_parts.push(format!(
            "剩余 ${:.2} / 额度 ${:.2}",
            rem as f64 / 100.0,
            lim as f64 / 100.0
        ));
    } else if let Some(inc) = included {
        secondary_parts.push(format!("已用 included ${:.2}", inc as f64 / 100.0));
    }
    if let Some(m) = display_msg {
        secondary_parts.push(m);
    }
    secondary_parts.push(format!("来源：{source} · 半官方"));

    Ok(QuotaSnapshot {
        id: "cursor_personal".into(),
        display_name: "Cursor Spending".into(),
        primary_value: Some(primary),
        secondary_value: Some(secondary_parts.join(" · ")),
        unit: Some("已用".into()),
        ok: true,
        error_message: None,
        fallback_url: Some(SPENDING_URL.into()),
        experimental: true,
        updated_at: Utc::now(),
    })
}

fn parse_usage_summary_body(body: &Value) -> Result<QuotaSnapshot, String> {
    // Shape varies; try nested planUsage first, then top-level percent fields.
    if body.get("planUsage").is_some() || body.get("plan_usage").is_some() {
        return parse_period_usage_body(body, "GET /api/usage-summary");
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
    });

    let Some(p) = percent else {
        return Err("usage-summary: no recognizable percent field".into());
    };

    Ok(QuotaSnapshot {
        id: "cursor_personal".into(),
        display_name: "Cursor Spending".into(),
        primary_value: Some(format!("{:.0}%", p.round())),
        secondary_value: Some("来源：GET /api/usage-summary · 半官方".into()),
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
    fn parse_period_usage_ok() {
        let body = serde_json::json!({
            "planUsage": {
                "totalPercentUsed": 15.48,
                "remaining": 16778,
                "limit": 40000
            },
            "displayMessage": "You've used 15%"
        });
        let snap = parse_period_usage_body(&body, "test").unwrap();
        assert!(snap.ok);
        assert_eq!(snap.primary_value.as_deref(), Some("15%"));
    }

    #[test]
    fn parse_period_usage_missing_fails() {
        let body = serde_json::json!({"foo": 1});
        assert!(parse_period_usage_body(&body, "test").is_err());
    }
}
