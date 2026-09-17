//! Shared DTOs for quota rows and agent status.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Tray / overlay agent work indicator.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentUiStatus {
    /// Working — amber/blue
    Working,
    /// Completed — green
    Done,
    /// Waiting for user / idle after run — purple/orange
    NeedsInput,
    /// Error / cancelled
    Failed,
    /// No data yet
    Unknown,
}

impl AgentUiStatus {
    pub fn label_zh(self) -> &'static str {
        match self {
            Self::Working => "工作中",
            Self::Done => "已完成",
            Self::NeedsInput => "待跟进",
            Self::Failed => "失败",
            Self::Unknown => "未知",
        }
    }

    #[allow(dead_code)]
    pub fn css_class(self) -> &'static str {
        match self {
            Self::Working => "status-working",
            Self::Done => "status-done",
            Self::NeedsInput => "status-needs-input",
            Self::Failed => "status-failed",
            Self::Unknown => "status-unknown",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSnapshot {
    pub id: String,
    pub display_name: String,
    /// Human-readable primary value, or None when fetch failed (never invent numbers).
    pub primary_value: Option<String>,
    pub secondary_value: Option<String>,
    pub unit: Option<String>,
    pub ok: bool,
    pub error_message: Option<String>,
    /// Deep-link when ok=false (e.g. Cursor Spending dashboard).
    pub fallback_url: Option<String>,
    pub experimental: bool,
    pub updated_at: DateTime<Utc>,
    /// Numeric used % for progress-bar fill (same metric as primaryValue when available).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub used_percent: Option<f64>,
    /// Billing / quota period start (UTC). Used for linear pace marker.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub period_start: Option<DateTime<Utc>>,
    /// Next quota reset / “额度重置” (UTC). From `billingCycleEnd` when present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub period_end: Option<DateTime<Utc>>,
    /// Expected usage % by now if spend were linear over `[period_start, period_end]`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_pace_percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSnapshot {
    pub id: String,
    pub name: String,
    pub status: AgentUiStatus,
    pub detail: Option<String>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionState {
    pub agent_status: AgentUiStatus,
    pub agents: Vec<AgentSnapshot>,
    pub quotas: Vec<QuotaSnapshot>,
    pub last_updated: DateTime<Utc>,
}

/// Settings-backed generic HTTP quota source (plan shape).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericHttpProviderConfig {
    pub id: String,
    pub display_name: String,
    pub enabled: bool,
    pub auth: AuthConfig,
    pub request: RequestConfig,
    pub parse: ParseConfig,
    pub poll_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(rename = "type")]
    pub kind: String,
    /// e.g. "keychain:openai" or "env:OPENAI_API_KEY" — never store raw secrets in config files.
    pub secret_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestConfig {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseConfig {
    pub mode: String,
    pub fields: ParseFields,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseFields {
    pub primary_label: Option<String>,
    pub primary_value: String,
    pub secondary_value: Option<String>,
    pub unit: Option<String>,
}
