//! Cursor personal plan usage via semi-official Spending / Dashboard endpoints.
//!
//! Personal Cursor has no stable public usage API. We call community-known
//! Connect RPC / dashboard JSON with a session (auto-imported or pasted).
//! Fail closed → Spending deep-link; never invent remaining %.
//!
//! ## Percentage semantics (see docs/spending-percent-audit.md)
//! **Hero number = Cursor mode only** (`planUsage.autoPercentUsed`).
//! Progress bar fill = same %. Vertical pace marker = linear elapsed time
//! over `billingCycleStart` → `billingCycleEnd` (infer start if only end).
//! Dollar “已用 $xx” is never shown (often wrong vs Spending UI).

use async_trait::async_trait;
use chrono::{DateTime, Datelike, Duration, TimeZone, Timelike, Utc};
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
    /// Short label for the metric (shown in unit / secondary).
    metric_label: &'static str,
}

/// Hero = Cursor mode (`autoPercentUsed`). Aggregate spend / pool-weighted
/// only used when that field is absent — and always labeled.
fn resolve_primary_percent(plan: &Value, body: &Value) -> Result<ResolvedPercent, String> {
    // 1) Cursor mode pool (Auto + Composer / “Cursor Models” bar).
    if let Some(p) = first_f64(plan, &["autoPercentUsed", "auto_percent_used"]) {
        return Ok(ResolvedPercent {
            rounded: p.round().clamp(0.0, 999.0) as i64,
            metric_label: "Cursor mode",
        });
    }

    // 2) Mode-specific prose only (not aggregate displayMessage).
    if let Some(s) = body
        .get("autoModelSelectedDisplayMessage")
        .or_else(|| body.get("auto_model_selected_display_message"))
        .and_then(|v| v.as_str())
    {
        if let Some(p) = parse_percent_in_prose(s) {
            return Ok(ResolvedPercent {
                rounded: p.round().clamp(0.0, 999.0) as i64,
                metric_label: "Cursor mode",
            });
        }
    }

    // 3) Labeled fallbacks when Cursor mode field is missing (never invent).
    if let Some(p) = spend_based_percent(plan) {
        return Ok(ResolvedPercent {
            rounded: p.round().clamp(0.0, 999.0) as i64,
            metric_label: "套餐进度",
        });
    }
    if let Some(p) = percent_from_display_messages(body) {
        return Ok(ResolvedPercent {
            rounded: p.round().clamp(0.0, 999.0) as i64,
            metric_label: "套餐进度",
        });
    }
    if let Some(p) = first_f64(plan, &["totalPercentUsed", "total_percent_used"]) {
        return Ok(ResolvedPercent {
            rounded: p.round().clamp(0.0, 999.0) as i64,
            metric_label: "池加权",
        });
    }

    Err("no autoPercentUsed / spend÷limit / displayMessage % / totalPercentUsed".into())
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

fn parse_period_usage_body(body: &Value, _source: &str) -> Result<QuotaSnapshot, String> {
    let plan = body
        .get("planUsage")
        .or_else(|| body.get("plan_usage"))
        .ok_or_else(|| "missing planUsage".to_string())?;

    let resolved = resolve_primary_percent(plan, body)?;
    let primary = format!("{}%", resolved.rounded);
    let used_percent = Some(resolved.rounded as f64);

    let api_pct = first_f64(plan, &["apiPercentUsed", "api_percent_used"]);

    // Minimal secondary: only Other Models when non-zero; never dollar “已用 $xx”.
    let mut secondary_parts = Vec::new();
    if let Some(a) = api_pct {
        if a.round() > 0.0 {
            secondary_parts.push(format!("Other Models {:.0}%", a.round()));
        }
    }
    if resolved.metric_label != "Cursor mode" {
        secondary_parts.push(format!("口径：{}", resolved.metric_label));
    }

    let (period_start, period_end) = resolve_billing_period(body);
    let expected_pace_percent = expected_pace_percent(period_start, period_end, Utc::now());

    let unit = match resolved.metric_label {
        "Cursor mode" => "Cursor mode",
        "套餐进度" => "套餐进度",
        "池加权" => "池加权",
        _ => "",
    };

    Ok(QuotaSnapshot {
        id: "cursor_personal".into(),
        display_name: "Cursor Spending".into(),
        primary_value: Some(primary),
        secondary_value: if secondary_parts.is_empty() {
            None
        } else {
            Some(secondary_parts.join("\n"))
        },
        unit: if unit.is_empty() {
            None
        } else {
            Some(unit.into())
        },
        ok: true,
        error_message: None,
        fallback_url: Some(SPENDING_URL.into()),
        experimental: true,
        updated_at: Utc::now(),
        used_percent,
        period_start,
        period_end,
        expected_pace_percent,
    })
}

/// Parse `billingCycleStart` / `billingCycleEnd` (epoch ms string/number or RFC3339).
/// If only end is present, infer start as previous calendar month same day.
fn resolve_billing_period(body: &Value) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>) {
    let end = first_timestamp(
        body,
        &[
            "billingCycleEnd",
            "billing_cycle_end",
            "periodEnd",
            "period_end",
            "nextResetAt",
            "next_reset_at",
        ],
    );
    let start = first_timestamp(
        body,
        &[
            "billingCycleStart",
            "billing_cycle_start",
            "periodStart",
            "period_start",
        ],
    )
    .or_else(|| end.map(infer_period_start_from_end));

    (start, end)
}

/// Fallback when API only gives end: previous month, same calendar day (clamp day).
fn infer_period_start_from_end(end: DateTime<Utc>) -> DateTime<Utc> {
    let y = end.year();
    let m = end.month();
    let d = end.day();
    let (py, pm) = if m == 1 {
        (y - 1, 12)
    } else {
        (y, m - 1)
    };
    let max_day = days_in_month(py, pm);
    let day = d.min(max_day);
    Utc.with_ymd_and_hms(py, pm, day, end.hour(), end.minute(), end.second())
        .single()
        .unwrap_or_else(|| end - Duration::days(30))
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (ny, nm) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let first_next = Utc.with_ymd_and_hms(ny, nm, 1, 0, 0, 0).single();
    let first_this = Utc.with_ymd_and_hms(year, month, 1, 0, 0, 0).single();
    match (first_this, first_next) {
        (Some(a), Some(b)) => (b - a).num_days() as u32,
        _ => 30,
    }
}

fn expected_pace_percent(
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Option<f64> {
    let (start, end) = (start?, end?);
    let total = (end - start).num_milliseconds();
    if total <= 0 {
        return None;
    }
    let elapsed = (now - start).num_milliseconds().clamp(0, total);
    Some(((elapsed as f64 / total as f64) * 100.0).clamp(0.0, 100.0))
}

fn first_timestamp(v: &Value, keys: &[&str]) -> Option<DateTime<Utc>> {
    for k in keys {
        if let Some(n) = v.get(*k) {
            if let Some(dt) = parse_api_timestamp(n) {
                return Some(dt);
            }
        }
    }
    None
}

/// Accept epoch ms (number or digit string), epoch seconds, or RFC3339.
fn parse_api_timestamp(v: &Value) -> Option<DateTime<Utc>> {
    if let Some(i) = v.as_i64() {
        return epoch_to_datetime(i);
    }
    if let Some(f) = v.as_f64() {
        if f.is_finite() {
            return epoch_to_datetime(f as i64);
        }
    }
    if let Some(s) = v.as_str() {
        let t = s.trim();
        if let Ok(i) = t.parse::<i64>() {
            return epoch_to_datetime(i);
        }
        if let Ok(dt) = DateTime::parse_from_rfc3339(t) {
            return Some(dt.with_timezone(&Utc));
        }
    }
    None
}

fn epoch_to_datetime(n: i64) -> Option<DateTime<Utc>> {
    // Heuristic: ≥ 1e12 → milliseconds; else seconds.
    let secs = if n.abs() >= 1_000_000_000_000 {
        n / 1000
    } else {
        n
    };
    DateTime::from_timestamp(secs, 0)
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
        // Reuse period parser with a synthetic wrapper so displayMessage / billing cycle on root still work.
        let mut wrapper = serde_json::Map::new();
        wrapper.insert("planUsage".into(), plan.clone());
        for k in [
            "displayMessage",
            "display_message",
            "autoModelSelectedDisplayMessage",
            "namedModelSelectedDisplayMessage",
            "billingCycleStart",
            "billing_cycle_start",
            "billingCycleEnd",
            "billing_cycle_end",
            "periodStart",
            "period_start",
            "periodEnd",
            "period_end",
        ] {
            if let Some(v) = body.get(k) {
                wrapper.insert(k.into(), v.clone());
            }
        }
        return parse_period_usage_body(&Value::Object(wrapper), "GET /api/usage-summary · individualUsage.plan");
    }

    let percent = first_f64(body, &[
        "autoPercentUsed",
        "auto_percent_used",
        "totalPercentUsed",
        "percentUsed",
        "usagePercent",
        "percentage",
    ])
    .or_else(|| {
        body.get("individualUsage").and_then(|u| {
            first_f64(u, &["autoPercentUsed", "auto_percent_used", "totalPercentUsed", "percentUsed"])
        })
    })
    .or_else(|| percent_from_display_messages(body));

    let Some(p) = percent else {
        return Err("usage-summary: no recognizable percent field".into());
    };

    let (period_start, period_end) = resolve_billing_period(body);
    let expected_pace_percent = expected_pace_percent(period_start, period_end, Utc::now());

    Ok(QuotaSnapshot {
        id: "cursor_personal".into(),
        display_name: "Cursor Spending".into(),
        primary_value: Some(format!("{:.0}%", p.round())),
        secondary_value: None,
        unit: Some("已用".into()),
        ok: true,
        error_message: None,
        fallback_url: Some(SPENDING_URL.into()),
        experimental: true,
        updated_at: Utc::now(),
        used_percent: Some(p.round()),
        period_start,
        period_end,
        expected_pace_percent,
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
    fn hero_is_cursor_mode_auto_percent_not_aggregate() {
        // User case: Cursor mode ~45%, other 0%, aggregate/spend ~41–43% must not be hero.
        let body = serde_json::json!({
            "billingCycleStart": "1783279259000",
            "billingCycleEnd": "1785957659000",
            "planUsage": {
                "totalPercentUsed": 41.2,
                "includedSpend": 1900,
                "remaining": 1140,
                "limit": 4651,
                "autoPercentUsed": 45.2,
                "apiPercentUsed": 0.0
            },
            "displayMessage": "You've used 41% of your included usage"
        });
        let snap = parse_period_usage_body(&body, "test").unwrap();
        assert!(snap.ok);
        assert_eq!(snap.primary_value.as_deref(), Some("45%"));
        assert_eq!(snap.used_percent, Some(45.0));
        assert!(snap.unit.as_deref().unwrap().contains("Cursor mode"));
        // Declutter: no dollar line, no source/半官方, no Other Models 0%.
        assert!(snap.secondary_value.is_none());
        assert!(snap.period_end.is_some());
        assert!(snap.period_start.is_some());
        assert!(snap.expected_pace_percent.is_some());
    }

    #[test]
    fn fallback_spend_when_no_auto_percent() {
        let body = serde_json::json!({
            "planUsage": {
                "totalPercentUsed": 39.3,
                "includedSpend": 2000,
                "limit": 4651,
            },
            "displayMessage": "You've hit your usage limit"
        });
        let snap = parse_period_usage_body(&body, "test").unwrap();
        // 2000/4651 ≈ 43.0% — labeled 套餐进度 fallback only
        assert_eq!(snap.primary_value.as_deref(), Some("43%"));
        assert!(snap.unit.as_deref().unwrap().contains("套餐进度"));
        assert!(snap.secondary_value.unwrap().contains("口径：套餐进度"));
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
    fn usage_summary_individual_usage_plan_prefers_auto() {
        let body = serde_json::json!({
            "individualUsage": {
                "plan": {
                    "totalPercentUsed": 39.3,
                    "includedSpend": 860,
                    "limit": 2000,
                    "autoPercentUsed": 45.0,
                    "apiPercentUsed": 0.0
                }
            },
            "displayMessage": "You've used 43% of your included usage"
        });
        let snap = parse_usage_summary_body(&body).unwrap();
        assert_eq!(snap.primary_value.as_deref(), Some("45%"));
        // Other Models 0% dropped from secondary
        assert!(snap.secondary_value.is_none());
    }

    #[test]
    fn shows_other_models_only_when_nonzero() {
        let body = serde_json::json!({
            "planUsage": {
                "autoPercentUsed": 45.0,
                "apiPercentUsed": 12.0
            }
        });
        let snap = parse_period_usage_body(&body, "test").unwrap();
        let sec = snap.secondary_value.unwrap();
        assert!(sec.contains("Other Models 12%"));
        assert!(!sec.contains('$'));
        assert!(!sec.contains("半官方"));
    }

    #[test]
    fn billing_cycle_epoch_ms_and_pace() {
        let start_ms = 1_700_000_000_000_i64;
        let end_ms = 1_702_592_000_000_i64;
        let body = serde_json::json!({
            "billingCycleStart": start_ms.to_string(),
            "billingCycleEnd": end_ms.to_string(),
            "planUsage": { "autoPercentUsed": 45.0, "apiPercentUsed": 0.0 }
        });
        let snap = parse_period_usage_body(&body, "test").unwrap();
        assert_eq!(
            snap.period_start,
            DateTime::from_timestamp(start_ms / 1000, 0)
        );
        assert_eq!(
            snap.period_end,
            DateTime::from_timestamp(end_ms / 1000, 0)
        );
        // Midpoint → ~50% pace
        let mid = DateTime::from_timestamp((start_ms + end_ms) / 2000, 0).unwrap();
        let pace = expected_pace_percent(snap.period_start, snap.period_end, mid).unwrap();
        assert!((pace - 50.0).abs() < 0.1);
    }

    #[test]
    fn infer_start_when_only_end() {
        let end = Utc.with_ymd_and_hms(2026, 4, 15, 12, 0, 0).unwrap();
        let start = infer_period_start_from_end(end);
        assert_eq!(start.year(), 2026);
        assert_eq!(start.month(), 3);
        assert_eq!(start.day(), 15);
    }

    #[test]
    fn parse_period_usage_missing_fails() {
        let body = serde_json::json!({"foo": 1});
        assert!(parse_period_usage_body(&body, "test").is_err());
    }
}
