//! Local Cursor IDE status (macOS MVP spike).
//!
//! Primary signal: Hooks → `~/.cursor/desktop-companion-status.json`
//! (supports **multiple agents** keyed by `conversation_id`).
//! Display names: explicit agent/composer title from hooks when present, else
//! workspace basename, else short conversation id — see `resolve` +
//! [`disambiguate_agent_names`]. Secondary: whether a Cursor process appears
//! to be running.
//!
//! Not Cloud Agents API. See docs/spending-and-local-status.md and
//! docs/agent-status-aggregation.md.
//!
//! ## 待跟进 (NeedsInput) — honesty
//! Product meaning: agent needs user interaction or a mode switch.
//! Current hooks do **not** emit an official WAITING_FOR_INPUT event. We approximate:
//! - explicit `needs-input` / `waiting` / `idle` in the status file, or
//! - a completed `stop` whose status file age exceeds [`NEEDS_INPUT_AFTER_DONE`].
//! Treat as best-effort; false positives/negatives are expected until hooks improve.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::models::{AgentSnapshot, AgentUiStatus};

const STATUS_FILE_NAME: &str = "desktop-companion-status.json";
/// After a completed stop, treat as "needs follow-up" once this age is exceeded
/// and no new working event arrived (heuristic — not official WAITING_FOR_INPUT).
const NEEDS_INPUT_AFTER_DONE: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusFile {
    /// Multi-agent list (preferred). Legacy single-agent files omit this.
    #[serde(default)]
    agents: Vec<StatusAgent>,
    /// Legacy single-agent fields (still written for older readers).
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    detail: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    stop_status: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    workspace_root: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusAgent {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    /// How hooks chose `name` (explicit / workspace_basename / conversation_id / …).
    /// Kept for forward-compat / debugging; not shown in UI yet.
    #[allow(dead_code)]
    #[serde(default)]
    name_source: Option<String>,
    #[serde(default)]
    workspace_root: Option<String>,
    /// working | done | needs-input | failed | unknown
    status: String,
    #[serde(default)]
    detail: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    /// hooks stop status: completed | aborted | error
    #[serde(default)]
    stop_status: Option<String>,
    #[serde(default)]
    conversation_id: Option<String>,
}

/// Poll local IDE status for tray / panel.
pub fn poll_local_cursor_status() -> (AgentUiStatus, Vec<AgentSnapshot>) {
    let cursor_running = cursor_process_running();
    let path = status_file_path();

    let Some(raw) = read_status_file(&path) else {
        let detail = if cursor_running {
            format!(
                "未找到状态文件 {}。请安装 desktop-companion/hooks/ 模板到 ~/.cursor/。Cursor 进程：在运行。",
                path.display()
            )
        } else {
            format!(
                "未找到状态文件 {}。Cursor 进程：未检测到。安装 hooks 后在 IDE 内跑一轮 Agent。",
                path.display()
            )
        };
        return (
            AgentUiStatus::Unknown,
            vec![AgentSnapshot {
                id: "local-missing".into(),
                name: "本机 Cursor IDE".into(),
                status: AgentUiStatus::Unknown,
                detail: Some(detail),
                updated_at: Utc::now(),
            }],
        );
    };

    let mut agents = expand_agents(&raw, &path);
    if agents.is_empty() {
        agents.push(AgentSnapshot {
            id: "local-empty".into(),
            name: "本机 Cursor IDE".into(),
            status: AgentUiStatus::Unknown,
            detail: Some(format!("状态文件为空：{}", path.display())),
            updated_at: Utc::now(),
        });
    }

    if !cursor_running {
        for a in &mut agents {
            let base = a.detail.clone().unwrap_or_default();
            a.detail = Some(format!("{base} · 辅信号：未检测到 Cursor 进程").trim().into());
        }
    }

    // Aggregate tray status is computed in `agents::aggregate_agent_statuses` after
    // optional cloud agents are merged — return per-agent list here.
    let hint = agents
        .first()
        .map(|a| a.status)
        .unwrap_or(AgentUiStatus::Unknown);
    (hint, agents)
}

fn expand_agents(raw: &StatusFile, path: &Path) -> Vec<AgentSnapshot> {
    let file_age = file_age(path);
    let mut out = Vec::new();

    if !raw.agents.is_empty() {
        for a in &raw.agents {
            out.push(map_agent(a, file_age));
        }
        disambiguate_agent_names(&mut out);
        return out;
    }

    // Legacy single-agent shape.
    if let Some(status) = raw.status.as_ref() {
        let legacy = StatusAgent {
            id: raw.id.clone().or_else(|| Some("local-ide".into())),
            name: raw
                .name
                .clone()
                .or_else(|| project_name_from_root(raw.workspace_root.as_deref()))
                .or_else(|| Some("本机 Cursor IDE".into())),
            name_source: None,
            workspace_root: raw.workspace_root.clone(),
            status: status.clone(),
            detail: raw.detail.clone(),
            source: raw.source.clone(),
            updated_at: raw.updated_at.clone(),
            stop_status: raw.stop_status.clone(),
            conversation_id: None,
        };
        out.push(map_agent(&legacy, file_age));
    }
    disambiguate_agent_names(&mut out);
    out
}

fn map_agent(raw: &StatusAgent, file_age: Option<Duration>) -> AgentSnapshot {
    let source = raw.source.clone().unwrap_or_else(|| "hooks".into());
    let conversation_id = raw
        .conversation_id
        .clone()
        .or_else(|| raw.id.clone())
        .unwrap_or_default();
    let project = resolve_agent_display_name(
        raw.name.as_deref(),
        raw.workspace_root.as_deref(),
        Some(conversation_id.as_str()),
    );
    let id = raw
        .id
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            if !conversation_id.is_empty() {
                conversation_id.clone()
            } else {
                format!("local-{}", project)
            }
        });

    let mut base_detail = raw
        .detail
        .clone()
        .unwrap_or_else(|| format!("来源：{source}"));
    if let Some(root) = raw.workspace_root.as_deref() {
        if !base_detail.contains(root) {
            base_detail = format!("{base_detail} · {root}");
        }
    }

    let mut ui = match raw.status.to_ascii_lowercase().as_str() {
        "working" | "running" | "active" => AgentUiStatus::Working,
        "done" | "completed" | "finished" => AgentUiStatus::Done,
        "needs-input" | "needs_input" | "waiting" | "idle" => AgentUiStatus::NeedsInput,
        "failed" | "error" | "aborted" => AgentUiStatus::Failed,
        _ => AgentUiStatus::Unknown,
    };

    if let Some(stop) = raw.stop_status.as_deref() {
        match stop.to_ascii_lowercase().as_str() {
            "error" | "aborted" => ui = AgentUiStatus::Failed,
            "completed" if ui == AgentUiStatus::Unknown => ui = AgentUiStatus::Done,
            _ => {}
        }
    }

    let updated_at = parse_updated_at(raw.updated_at.as_deref()).unwrap_or_else(Utc::now);
    let age = agent_age(raw.updated_at.as_deref()).or(file_age);

    // Heuristic: completed stop older than threshold → needs follow-up (approx).
    // See module docs — not an official Cursor wait-for-user signal.
    let detail = if ui == AgentUiStatus::Done {
        if let Some(age) = age {
            if age >= NEEDS_INPUT_AFTER_DONE {
                ui = AgentUiStatus::NeedsInput;
                Some(format!(
                    "{base_detail} · 完成后约 {}s 无新一轮 → 待跟进（近似，非官方 WAITING）",
                    age.as_secs()
                ))
            } else {
                Some(base_detail)
            }
        } else {
            Some(base_detail)
        }
    } else {
        Some(base_detail)
    };

    AgentSnapshot {
        id,
        name: project,
        status: ui,
        detail,
        updated_at,
    }
}

/// Display-name priority for one agent row (before multi-row disambiguation).
///
/// 1. Non-empty `name` from status file (hooks may have set explicit title or basename)
/// 2. Workspace root basename
/// 3. Short conversation id → `Agent · <suffix>`
pub fn resolve_agent_display_name(
    name: Option<&str>,
    workspace_root: Option<&str>,
    conversation_id: Option<&str>,
) -> String {
    if let Some(n) = name.map(str::trim).filter(|s| !s.is_empty()) {
        return n.to_string();
    }
    if let Some(p) = project_name_from_root(workspace_root) {
        return p;
    }
    if let Some(suf) = short_conversation_suffix(conversation_id) {
        return format!("Agent · {suf}");
    }
    "本机 Cursor IDE".into()
}

/// Last 6 alphanumeric chars of a conversation / agent id (stable short label).
pub fn short_conversation_suffix(id: Option<&str>) -> Option<String> {
    let id = id?.trim();
    if id.is_empty() {
        return None;
    }
    let alnum: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if alnum.len() >= 6 {
        Some(alnum[alnum.len() - 6..].to_string())
    } else if !alnum.is_empty() {
        Some(alnum)
    } else {
        Some(id.chars().take(8).collect())
    }
}

/// When two+ agents would show the same label but have different ids, append ` · <suffix>`.
pub fn disambiguate_agent_names(agents: &mut [AgentSnapshot]) {
    use std::collections::HashMap;
    let mut counts: HashMap<String, usize> = HashMap::new();
    for a in agents.iter() {
        *counts.entry(a.name.clone()).or_insert(0) += 1;
    }
    for a in agents.iter_mut() {
        if counts.get(&a.name).copied().unwrap_or(0) <= 1 {
            continue;
        }
        let Some(suf) = short_conversation_suffix(Some(a.id.as_str())) else {
            continue;
        };
        let tagged = format!(" · {suf}");
        if a.name.ends_with(&tagged) {
            continue;
        }
        if a.name.is_empty() {
            a.name = format!("Agent · {suf}");
        } else {
            a.name = format!("{}{tagged}", a.name);
        }
    }
}

fn agent_age(updated_at: Option<&str>) -> Option<Duration> {
    let dt = parse_updated_at(updated_at)?;
    let now = Utc::now();
    if now >= dt {
        Some((now - dt).to_std().ok()?)
    } else {
        Some(Duration::ZERO)
    }
}

/// Project / workspace display name = last path component of a workspace root.
pub fn project_name_from_root(root: Option<&str>) -> Option<String> {
    let root = root?.trim();
    if root.is_empty() {
        return None;
    }
    let path = Path::new(root);
    path.file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| Some(root.to_string()))
}

fn status_file_path() -> PathBuf {
    if let Ok(p) = std::env::var("DESKTOP_COMPANION_STATUS_FILE") {
        let path = PathBuf::from(p);
        if !path.as_os_str().is_empty() {
            return path;
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".cursor")
        .join(STATUS_FILE_NAME)
}

fn read_status_file(path: &PathBuf) -> Option<StatusFile> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn file_age(path: &Path) -> Option<Duration> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    SystemTime::now().duration_since(modified).ok()
}

fn parse_updated_at(s: Option<&str>) -> Option<DateTime<Utc>> {
    let s = s?;
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.with_timezone(&Utc))
}

/// Best-effort: is Cursor desktop running? Useful on macOS; also works on Linux/Windows via `pgrep`/`tasklist`-like checks.
fn cursor_process_running() -> bool {
    #[cfg(target_os = "macos")]
    {
        // Prefer pgrep for "Cursor" app helpers without matching this companion's name.
        if run_success("pgrep", &["-x", "Cursor"]) {
            return true;
        }
        // Electron helper names vary; fall back to broader match excluding our binary.
        return run_pipe_grep();
    }
    #[cfg(target_os = "windows")]
    {
        return run_success("tasklist", &["/FI", "IMAGENAME eq Cursor.exe"]);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if run_success("pgrep", &["-f", "Cursor"]) {
            return true;
        }
        false
    }
}

fn run_success(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn run_pipe_grep() -> bool {
    let output = Command::new("pgrep").arg("-fl").arg("Cursor").output();
    let Ok(out) = output else {
        return false;
    };
    if !out.status.success() {
        return false;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower.contains("cursor")
            && !lower.contains("desktop-companion")
            && !lower.contains("cursor-agent")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn project_name_from_workspace_root() {
        assert_eq!(
            project_name_from_root(Some("/Users/me/Projects/hospital-crm-pm")),
            Some("hospital-crm-pm".into())
        );
    }

    #[test]
    fn resolve_prefers_explicit_name() {
        assert_eq!(
            resolve_agent_display_name(
                Some("Vibecoding 助手"),
                Some("/Users/me/Projects/PyNN"),
                Some("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
            ),
            "Vibecoding 助手"
        );
    }

    #[test]
    fn resolve_falls_back_to_workspace_then_id() {
        assert_eq!(
            resolve_agent_display_name(None, Some("/tmp/CRM"), Some("cid-111111")),
            "CRM"
        );
        assert_eq!(
            resolve_agent_display_name(
                None,
                None,
                Some("aaaaaaaa-bbbb-cccc-dddd-123456abcdef")
            ),
            "Agent · abcdef"
        );
    }

    #[test]
    fn disambiguate_same_workspace_basename() {
        let mut agents = vec![
            AgentSnapshot {
                id: "aaaaaaaa-bbbb-cccc-dddd-111111aaaaaa".into(),
                name: "PyNN".into(),
                status: AgentUiStatus::Working,
                detail: None,
                updated_at: Utc::now(),
            },
            AgentSnapshot {
                id: "aaaaaaaa-bbbb-cccc-dddd-222222bbbbbb".into(),
                name: "PyNN".into(),
                status: AgentUiStatus::Done,
                detail: None,
                updated_at: Utc::now(),
            },
        ];
        disambiguate_agent_names(&mut agents);
        assert_ne!(agents[0].name, agents[1].name);
        assert!(agents[0].name.starts_with("PyNN · "));
        assert!(agents[1].name.starts_with("PyNN · "));
        assert!(agents[0].name.contains("aaaaaa"));
        assert!(agents[1].name.contains("bbbbbb"));
    }

    #[test]
    fn disambiguate_leaves_unique_names_alone() {
        let mut agents = vec![
            AgentSnapshot {
                id: "c1".into(),
                name: "Vibecoding 助手".into(),
                status: AgentUiStatus::Working,
                detail: None,
                updated_at: Utc::now(),
            },
            AgentSnapshot {
                id: "c2".into(),
                name: "CRM".into(),
                status: AgentUiStatus::Done,
                detail: None,
                updated_at: Utc::now(),
            },
        ];
        disambiguate_agent_names(&mut agents);
        assert_eq!(agents[0].name, "Vibecoding 助手");
        assert_eq!(agents[1].name, "CRM");
    }

    #[test]
    fn maps_multi_agent_file() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "dc-local-status-multi-{}",
            std::process::id()
        ));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join(STATUS_FILE_NAME);
        let mut f = fs::File::create(&path).unwrap();
        writeln!(
            f,
            r#"{{"version":1,"agents":[{{"id":"c1","name":"proj-a","status":"working","detail":"t","source":"hooks"}},{{"id":"c2","name":"proj-b","status":"done","detail":"t","source":"hooks","updatedAt":"2026-09-17T14:00:00Z"}}]}}"#
        )
        .unwrap();
        std::env::set_var("DESKTOP_COMPANION_STATUS_FILE", &path);
        let (_ui, agents) = poll_local_cursor_status();
        std::env::remove_var("DESKTOP_COMPANION_STATUS_FILE");
        assert!(
            agents.len() >= 2,
            "expected multi-agent parse, got {:?}",
            agents
        );
        assert!(agents.iter().any(|a| a.name == "proj-a"));
        assert!(agents.iter().any(|a| a.name == "proj-b"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn maps_colliding_workspace_names_uniquely() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "dc-local-status-collide-{}",
            std::process::id()
        ));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join(STATUS_FILE_NAME);
        let mut f = fs::File::create(&path).unwrap();
        writeln!(
            f,
            r#"{{"version":1,"agents":[{{"id":"aaaaaaaa-bbbb-cccc-dddd-111111aaaaaa","name":"PyNN","conversationId":"aaaaaaaa-bbbb-cccc-dddd-111111aaaaaa","status":"working","source":"hooks"}},{{"id":"aaaaaaaa-bbbb-cccc-dddd-222222bbbbbb","name":"PyNN","conversationId":"aaaaaaaa-bbbb-cccc-dddd-222222bbbbbb","status":"done","source":"hooks"}}]}}"#
        )
        .unwrap();
        std::env::set_var("DESKTOP_COMPANION_STATUS_FILE", &path);
        let (_ui, agents) = poll_local_cursor_status();
        std::env::remove_var("DESKTOP_COMPANION_STATUS_FILE");
        assert_eq!(agents.len(), 2);
        assert_ne!(agents[0].name, agents[1].name);
        assert!(agents.iter().all(|a| a.name.starts_with("PyNN · ")));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn poll_reads_temp_status_file() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "dc-local-status-{}",
            std::process::id()
        ));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join(STATUS_FILE_NAME);
        let mut f = fs::File::create(&path).unwrap();
        writeln!(
            f,
            r#"{{"status":"working","detail":"test","source":"hooks","name":"demo-proj"}}"#
        )
        .unwrap();
        std::env::set_var("DESKTOP_COMPANION_STATUS_FILE", &path);
        let (ui, agents) = poll_local_cursor_status();
        std::env::remove_var("DESKTOP_COMPANION_STATUS_FILE");
        assert_eq!(ui, AgentUiStatus::Working);
        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "demo-proj");
        let _ = fs::remove_dir_all(&dir);
    }
}
