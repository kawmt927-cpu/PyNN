//! Cloud Agents status polling (official Cursor Cloud Agents API).

use chrono::Utc;
use serde_json::Value;

use crate::config::{resolve_secret, AppConfig};
use crate::models::{AgentSnapshot, AgentUiStatus};
use crate::providers::http_client;

const API_BASE: &str = "https://api.cursor.com";

pub async fn poll_cloud_agents(config: &AppConfig) -> (AgentUiStatus, Vec<AgentSnapshot>) {
    let Some(api_key) = resolve_secret(&config.cursor_api_key_ref) else {
        return (
            AgentUiStatus::Unknown,
            vec![AgentSnapshot {
                id: "stub".into(),
                name: "未配置 CURSOR_API_KEY".into(),
                status: AgentUiStatus::Unknown,
                detail: Some("设置 env:CURSOR_API_KEY 后可轮询 Cloud Agents".into()),
                updated_at: Utc::now(),
            }],
        );
    };

    match list_and_map(&api_key).await {
        Ok(agents) => {
            let aggregate = aggregate_status(&agents);
            (aggregate, agents)
        }
        Err(e) => (
            AgentUiStatus::Unknown,
            vec![AgentSnapshot {
                id: "error".into(),
                name: "Cloud Agents".into(),
                status: AgentUiStatus::Failed,
                detail: Some(e),
                updated_at: Utc::now(),
            }],
        ),
    }
}

async fn list_and_map(api_key: &str) -> Result<Vec<AgentSnapshot>, String> {
    let url = format!("{API_BASE}/v1/agents?limit=20");
    let resp = http_client()
        .get(&url)
        .basic_auth(api_key, Some(""))
        .send()
        .await
        .map_err(|e| format!("list agents: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("list agents HTTP {}", resp.status()));
    }

    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    let items = body
        .get("items")
        .or_else(|| body.get("agents"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for item in items.iter().take(10) {
        let id = item
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let name = item
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&id)
            .to_string();
        let agent_status = item
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("UNKNOWN");
        let latest_run = item
            .get("latestRunId")
            .or_else(|| item.get("latest_run_id"))
            .and_then(|v| v.as_str());

        let (ui, detail) = map_agent(api_key, &id, agent_status, latest_run).await;
        out.push(AgentSnapshot {
            id,
            name,
            status: ui,
            detail,
            updated_at: Utc::now(),
        });
    }

    if out.is_empty() {
        out.push(AgentSnapshot {
            id: "empty".into(),
            name: "暂无 Cloud Agent".into(),
            status: AgentUiStatus::Done,
            detail: Some("列表为空".into()),
            updated_at: Utc::now(),
        });
    }

    Ok(out)
}

async fn map_agent(
    api_key: &str,
    agent_id: &str,
    agent_status: &str,
    latest_run_id: Option<&str>,
) -> (AgentUiStatus, Option<String>) {
    // Prefer run-level status when available.
    if let Some(run_id) = latest_run_id {
        if let Ok(run_status) = fetch_run_status(api_key, agent_id, run_id).await {
            return map_run_status(&run_status, agent_status);
        }
    }

    match agent_status {
        "ACTIVE" => (AgentUiStatus::Working, Some("agent ACTIVE".into())),
        "IDLE" => (
            AgentUiStatus::NeedsInput,
            Some("agent IDLE ≈ 待跟进".into()),
        ),
        "ARCHIVED" => (AgentUiStatus::Done, Some("archived".into())),
        other => (AgentUiStatus::Unknown, Some(other.into())),
    }
}

async fn fetch_run_status(api_key: &str, agent_id: &str, run_id: &str) -> Result<String, String> {
    let url = format!("{API_BASE}/v1/agents/{agent_id}/runs/{run_id}");
    let resp = http_client()
        .get(&url)
        .basic_auth(api_key, Some(""))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    body.get("status")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "missing run status".into())
}

fn map_run_status(run_status: &str, agent_status: &str) -> (AgentUiStatus, Option<String>) {
    let detail = Some(format!("run {run_status} · agent {agent_status}"));
    match run_status {
        "CREATING" | "RUNNING" => (AgentUiStatus::Working, detail),
        "FINISHED" => {
            // After finish, IDLE means waiting for follow-up / user.
            if agent_status == "IDLE" {
                (AgentUiStatus::NeedsInput, detail)
            } else {
                (AgentUiStatus::Done, detail)
            }
        }
        "ERROR" | "CANCELLED" | "EXPIRED" => (AgentUiStatus::Failed, detail),
        _ => (AgentUiStatus::Unknown, detail),
    }
}

fn aggregate_status(agents: &[AgentSnapshot]) -> AgentUiStatus {
    if agents.iter().any(|a| a.status == AgentUiStatus::Working) {
        return AgentUiStatus::Working;
    }
    if agents.iter().any(|a| a.status == AgentUiStatus::NeedsInput) {
        return AgentUiStatus::NeedsInput;
    }
    if agents.iter().any(|a| a.status == AgentUiStatus::Failed) {
        return AgentUiStatus::Failed;
    }
    if agents.iter().any(|a| a.status == AgentUiStatus::Done) {
        return AgentUiStatus::Done;
    }
    AgentUiStatus::Unknown
}
