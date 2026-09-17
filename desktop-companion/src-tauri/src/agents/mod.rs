//! Agent status aggregation.
//! Primary: local Cursor IDE (`local_cursor_status`).
//! Optional / deferred: Cloud Agents API (requires API Key; default off).

use crate::config::{resolve_cursor_api_key, AppConfig};
use crate::local_cursor_status;
use crate::models::{AgentSnapshot, AgentUiStatus};

mod cloud;

/// Poll agent status for tray / panel.
pub async fn poll_agent_status(config: &AppConfig) -> (AgentUiStatus, Vec<AgentSnapshot>) {
    let (local_ui, mut agents) = local_cursor_status::poll_local_cursor_status();

    if config.cloud_agents_enabled {
        if resolve_cursor_api_key(config).is_some() {
            let (cloud_ui, cloud_agents) = cloud::poll_cloud_agents(config).await;
            agents.extend(cloud_agents);
            return (aggregate_status(&agents, local_ui, cloud_ui), agents);
        }
        agents.push(AgentSnapshot {
            id: "cloud-disabled-no-key".into(),
            name: "Cloud Agents（可选）".into(),
            status: AgentUiStatus::Unknown,
            detail: Some(
                "已开启 Cloud Agents 但未配置 API Key（高级/暂缓路径）。".into(),
            ),
            updated_at: chrono::Utc::now(),
        });
    }

    (local_ui, agents)
}

fn aggregate_status(
    agents: &[AgentSnapshot],
    local_ui: AgentUiStatus,
    cloud_ui: AgentUiStatus,
) -> AgentUiStatus {
    // Priority: working > needs input > failed > done > unknown
    let mut best = local_ui;
    for candidate in [cloud_ui]
        .into_iter()
        .chain(agents.iter().map(|a| a.status))
    {
        best = pick_higher(best, candidate);
    }
    best
}

fn pick_higher(a: AgentUiStatus, b: AgentUiStatus) -> AgentUiStatus {
    use AgentUiStatus::*;
    let rank = |s: AgentUiStatus| match s {
        Working => 5,
        NeedsInput => 4,
        Failed => 3,
        Done => 2,
        Unknown => 1,
    };
    if rank(b) > rank(a) {
        b
    } else {
        a
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_prefers_working() {
        assert_eq!(
            pick_higher(AgentUiStatus::Done, AgentUiStatus::Working),
            AgentUiStatus::Working
        );
    }
}
