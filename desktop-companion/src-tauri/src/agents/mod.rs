//! Agent status aggregation.
//! Primary: local Cursor IDE (`local_cursor_status`).
//! Optional / deferred: Cloud Agents API (requires API Key; default off).
//!
//! Tray / top-icon aggregation priority (high → low) — see `aggregate_agent_statuses`:
//! 失败 → 待跟进 → 已完成 → 工作中(全部) → 未知.
//!
//! **待跟进 (NeedsInput):** product meaning = needs user interaction or mode switch.
//! Current companion hooks only approximate this (e.g. completed stop aged with no new
//! turn). There is no official WAITING_FOR_INPUT event yet — document + best-effort.

use crate::config::{resolve_cursor_api_key, AppConfig};
use crate::local_cursor_status;
use crate::models::{AgentSnapshot, AgentUiStatus};

mod cloud;

/// Poll agent status for tray / panel.
pub async fn poll_agent_status(config: &AppConfig) -> (AgentUiStatus, Vec<AgentSnapshot>) {
    let (_local_ui, mut agents) = local_cursor_status::poll_local_cursor_status();

    if config.cloud_agents_enabled {
        if resolve_cursor_api_key(config).is_some() {
            let (_cloud_ui, cloud_agents) = cloud::poll_cloud_agents(config).await;
            agents.extend(cloud_agents);
        } else {
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
    }

    let ui = aggregate_agent_statuses(&agents);
    (ui, agents)
}

/// Aggregate tray / top-icon status from per-agent snapshots.
///
/// Priority (high → low):
/// 1. **失败** — if ANY agent failed
/// 2. **待跟进** — if ANY needs user input / mode switch (best-effort from hooks)
/// 3. **已完成** — if ANY completed (and no fail / needs-input)
/// 4. **工作中** — only when ALL *active* agents are working
///
/// Active = status ≠ Unknown. Empty / all-unknown → Unknown.
///
/// 待跟进 honesty: hooks approximate “needs follow-up” (e.g. done aged past threshold);
/// they do not currently emit an official wait-for-user / mode-switch signal.
pub fn aggregate_agent_statuses(agents: &[AgentSnapshot]) -> AgentUiStatus {
    let active: Vec<&AgentSnapshot> = agents
        .iter()
        .filter(|a| a.status != AgentUiStatus::Unknown)
        .collect();
    if active.is_empty() {
        return AgentUiStatus::Unknown;
    }
    if active.iter().any(|a| a.status == AgentUiStatus::Failed) {
        return AgentUiStatus::Failed;
    }
    if active.iter().any(|a| a.status == AgentUiStatus::NeedsInput) {
        return AgentUiStatus::NeedsInput;
    }
    if active.iter().any(|a| a.status == AgentUiStatus::Done) {
        return AgentUiStatus::Done;
    }
    if active.iter().all(|a| a.status == AgentUiStatus::Working) {
        return AgentUiStatus::Working;
    }
    AgentUiStatus::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn snap(status: AgentUiStatus) -> AgentSnapshot {
        AgentSnapshot {
            id: "t".into(),
            name: "t".into(),
            status,
            detail: None,
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn any_failed_wins() {
        let agents = vec![
            snap(AgentUiStatus::Working),
            snap(AgentUiStatus::Failed),
            snap(AgentUiStatus::Done),
        ];
        assert_eq!(aggregate_agent_statuses(&agents), AgentUiStatus::Failed);
    }

    #[test]
    fn needs_input_over_done_and_working() {
        let agents = vec![
            snap(AgentUiStatus::Working),
            snap(AgentUiStatus::NeedsInput),
            snap(AgentUiStatus::Done),
        ];
        assert_eq!(aggregate_agent_statuses(&agents), AgentUiStatus::NeedsInput);
    }

    #[test]
    fn any_done_when_no_fail_or_needs_input() {
        let agents = vec![snap(AgentUiStatus::Working), snap(AgentUiStatus::Done)];
        assert_eq!(aggregate_agent_statuses(&agents), AgentUiStatus::Done);
    }

    #[test]
    fn working_only_when_all_active_working() {
        let agents = vec![snap(AgentUiStatus::Working), snap(AgentUiStatus::Working)];
        assert_eq!(aggregate_agent_statuses(&agents), AgentUiStatus::Working);

        // Unknown is inactive — ignored for "all working".
        let mixed = vec![snap(AgentUiStatus::Working), snap(AgentUiStatus::Unknown)];
        assert_eq!(aggregate_agent_statuses(&mixed), AgentUiStatus::Working);
    }

    #[test]
    fn all_unknown_is_unknown() {
        let agents = vec![snap(AgentUiStatus::Unknown)];
        assert_eq!(aggregate_agent_statuses(&agents), AgentUiStatus::Unknown);
    }
}
