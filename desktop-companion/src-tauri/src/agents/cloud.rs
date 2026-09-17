//! Cloud Agents status polling (official Cursor Cloud Agents API).
//! Deferred / optional — not the product primary path (needs API Key).

use chrono::Utc;
use serde_json::Value;

use crate::config::{resolve_cursor_api_key, AppConfig};
use crate::models::{AgentSnapshot, AgentUiStatus};
use crate::providers::http_client;

const API_BASE: &str = "https://api.cursor.com";

pub async fn poll_cloud_agents(config: &AppConfig) -> (AgentUiStatus, Vec<AgentSnapshot>) {
    let Some(api_key) = resolve_cursor_api_key(config) else {
        return (
            AgentUiStatus::Unknown,
            vec![AgentSnapshot {
                id: "cloud-stub".into(),
                name: "Cloud Agents".into(),
                status: AgentUiStatus::Unknown,
                detail: Some("未配置 Cursor API Key（Cloud 路径暂缓）".into()),
                updated_at: Utc::now(),
            }],
        );
    };

    match list_and_map(&api_key).await {
        Ok(agents) => {
            let aggregate = super::aggregate_agent_statuses(&agents);
            (aggregate, agents)
        }
        Err(e) => (
            AgentUiStatus::Failed,
            vec![AgentSnapshot {
                id: "cloud-error".into(),
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
        return Err(format!(
            "list agents HTTP {} — 检查 API Key 是否有效",
            resp.status()
        ));
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
            .or_else(|| item.get("title"))
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
            id: format!("cloud-{id}"),
            name: format!("Cloud · {name}"),
            status: ui,
            detail,
            updated_at: Utc::now(),
        });
    }

    if out.is_empty() {
        out.push(AgentSnapshot {
            id: "cloud-empty".into(),
            name: "Cloud Agents".into(),
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
    if let Some(run_id) = latest_run_id {
        if let Ok(run_status) = fetch_run_status(api_key, agent_id, run_id).await {
            return map_run_status(&run_status, agent_status);
        }
        if let Ok(run_status) = fetch_latest_run_via_list(api_key, agent_id).await {
            return map_run_status(&run_status, agent_status);
        }
    } else if let Ok(run_status) = fetch_latest_run_via_list(api_key, agent_id).await {
        return map_run_status(&run_status, agent_status);
    }

    match agent_status.to_ascii_uppercase().as_str() {
        "ACTIVE" | "RUNNING" => (AgentUiStatus::Working, Some("agent ACTIVE".into())),
        "IDLE" => (
            AgentUiStatus::NeedsInput,
            Some("agent IDLE ≈ 待跟进".into()),
        ),
        "ARCHIVED" | "FINISHED" | "COMPLETED" => (AgentUiStatus::Done, Some(agent_status.into())),
        "ERROR" | "FAILED" => (AgentUiStatus::Failed, Some(agent_status.into())),
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

async fn fetch_latest_run_via_list(api_key: &str, agent_id: &str) -> Result<String, String> {
    let url = format!("{API_BASE}/v1/agents/{agent_id}/runs?limit=1");
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
    let items = body
        .get("items")
        .or_else(|| body.get("runs"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    items
        .first()
        .and_then(|r| r.get("status"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "no runs".into())
}

fn map_run_status(run_status: &str, agent_status: &str) -> (AgentUiStatus, Option<String>) {
    let detail = Some(format!("run {run_status} · agent {agent_status}"));
    match run_status.to_ascii_uppercase().as_str() {
        "CREATING" | "RUNNING" | "PENDING" => (AgentUiStatus::Working, detail),
        "FINISHED" | "COMPLETED" => {
            if agent_status.eq_ignore_ascii_case("IDLE") {
                (AgentUiStatus::NeedsInput, detail)
            } else {
                (AgentUiStatus::Done, detail)
            }
        }
        "ERROR" | "FAILED" | "CANCELLED" | "CANCELED" | "EXPIRED" => {
            (AgentUiStatus::Failed, detail)
        }
        _ => (AgentUiStatus::Unknown, detail),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_finished_idle_is_needs_input() {
        let (ui, _) = map_run_status("FINISHED", "IDLE");
        assert_eq!(ui, AgentUiStatus::NeedsInput);
    }
}
