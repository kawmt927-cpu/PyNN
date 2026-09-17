//! Local Cursor IDE status (macOS MVP spike).
//!
//! Primary signal: Hooks → `~/.cursor/desktop-companion-status.json`
//! Secondary: whether a Cursor process appears to be running.
//!
//! Not Cloud Agents API. See docs/spending-and-local-status.md.

use std::fs;
use std::path::PathBuf;
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
}

/// Poll local IDE status for tray / panel.
pub fn poll_local_cursor_status() -> (AgentUiStatus, Vec<AgentSnapshot>) {
    let cursor_running = cursor_process_running();
    let path = status_file_path();

    let Some(raw) = read_status_file(&path) else {
        let detail = if cursor_running {
            format!(
                "未找到状态文件 {}。请安装 desktop-companion/hooks/ 模板到 ~/.cursor/（见文档）。Cursor 进程：在运行。",
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

    let (ui, detail) = map_status_file(&raw, &path);
    let mut detail = detail;
    if !cursor_running {
        detail = Some(format!(
            "{} · 辅信号：未检测到 Cursor 进程",
            detail.unwrap_or_default()
        ));
    }

    (
        ui,
        vec![AgentSnapshot {
            id: "local-ide".into(),
            name: "本机 Cursor IDE".into(),
            status: ui,
            detail,
            updated_at: parse_updated_at(raw.updated_at.as_deref()).unwrap_or_else(Utc::now),
        }],
    )
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

fn map_status_file(raw: &StatusFile, path: &PathBuf) -> (AgentUiStatus, Option<String>) {
    let source = raw.source.clone().unwrap_or_else(|| "hooks".into());
    let base_detail = raw
        .detail
        .clone()
        .unwrap_or_else(|| format!("来源：{source} · {}", path.display()));

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

    // Heuristic: completed stop older than threshold → needs follow-up (approx).
    if ui == AgentUiStatus::Done {
        if let Some(age) = file_age(path) {
            if age >= NEEDS_INPUT_AFTER_DONE {
                ui = AgentUiStatus::NeedsInput;
                return (
                    ui,
                    Some(format!(
                        "{base_detail} · 完成后约 {}s 无新一轮 → 待跟进（近似）",
                        age.as_secs()
                    )),
                );
            }
        }
    }

    (ui, Some(base_detail))
}

fn file_age(path: &PathBuf) -> Option<Duration> {
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

    #[test]
    fn maps_working_status() {
        let raw = StatusFile {
            status: "working".into(),
            detail: Some("beforeSubmitPrompt".into()),
            source: Some("hooks".into()),
            updated_at: None,
            stop_status: None,
        };
        let path = PathBuf::from("/tmp/does-not-need-exist-for-map");
        let (ui, _) = map_status_file(&raw, &path);
        assert_eq!(ui, AgentUiStatus::Working);
    }

    #[test]
    fn maps_failed_from_stop_status() {
        let raw = StatusFile {
            status: "done".into(),
            detail: None,
            source: None,
            updated_at: None,
            stop_status: Some("error".into()),
        };
        let path = PathBuf::from("/tmp/x");
        let (ui, _) = map_status_file(&raw, &path);
        assert_eq!(ui, AgentUiStatus::Failed);
    }

    #[test]
    fn poll_reads_temp_status_file() {
        let dir = std::env::temp_dir().join(format!(
            "dc-local-status-{}",
            std::process::id()
        ));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join(STATUS_FILE_NAME);
        let mut f = fs::File::create(&path).unwrap();
        writeln!(
            f,
            r#"{{"status":"working","detail":"test","source":"hooks"}}"#
        )
        .unwrap();
        std::env::set_var("DESKTOP_COMPANION_STATUS_FILE", &path);
        let (ui, agents) = poll_local_cursor_status();
        assert_eq!(ui, AgentUiStatus::Working);
        assert_eq!(agents.len(), 1);
        std::env::remove_var("DESKTOP_COMPANION_STATUS_FILE");
        let _ = fs::remove_dir_all(&dir);
    }
}
