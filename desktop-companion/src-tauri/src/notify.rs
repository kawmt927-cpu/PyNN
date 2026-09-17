//! Notification stubs when Cursor / companion is unfocused.
//!
//! MVP: emit an in-app event + update tray. OS notification plugin can
//! replace the stub later without changing call sites.

use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter};

use crate::models::AgentUiStatus;
use crate::tray_status::{self, main_window_focused};

static LAST_NOTIFIED: OnceLock<Mutex<Option<AgentUiStatus>>> = OnceLock::new();

fn last_slot() -> &'static Mutex<Option<AgentUiStatus>> {
    LAST_NOTIFIED.get_or_init(|| Mutex::new(None))
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyStubPayload {
    pub title: String,
    pub body: String,
    pub status: AgentUiStatus,
    pub stub: bool,
}

/// On meaningful transitions (Done / NeedsInput / Failed), notify if unfocused.
pub fn maybe_notify_status_change(
    app: &AppHandle,
    previous: Option<AgentUiStatus>,
    next: AgentUiStatus,
    notify_when_unfocused: bool,
) {
    if !notify_when_unfocused {
        return;
    }
    if previous == Some(next) {
        return;
    }
    let noteworthy = matches!(
        next,
        AgentUiStatus::Done | AgentUiStatus::NeedsInput | AgentUiStatus::Failed
    );
    if !noteworthy {
        let _ = last_slot().lock().map(|mut g| *g = Some(next));
        return;
    }

    if let Ok(mut guard) = last_slot().lock() {
        *guard = Some(next);
    }

    if main_window_focused(app) {
        return;
    }

    let (title, body) = match next {
        AgentUiStatus::Done => ("Cloud Agent 已完成", "有运行已结束，可回 Cursor 查看。"),
        AgentUiStatus::NeedsInput => ("Cloud Agent 待跟进", "可能在等你输入或确认。"),
        AgentUiStatus::Failed => ("Cloud Agent 失败", "请打开面板查看详情。"),
        _ => return,
    };

    let payload = NotifyStubPayload {
        title: title.into(),
        body: body.into(),
        status: next,
        stub: true,
    };

    // Stub: frontend can show a toast; real OS notifications come later.
    let _ = app.emit("companion://notify-stub", &payload);
    tray_status::apply_tray_status(app, next);
    eprintln!("[notify-stub] {title}: {body}");
}
