//! Colored tray icons + tooltip for Cloud Agent aggregate status.

use tauri::{
    image::Image,
    tray::TrayIcon,
    AppHandle, Manager,
};

use crate::models::AgentUiStatus;

const SIZE: u32 = 32;

/// Solid RGBA colors matching UI CSS variables (sRGB).
fn status_rgba(status: AgentUiStatus) -> [u8; 4] {
    match status {
        AgentUiStatus::Working => [217, 119, 6, 255],   // amber
        AgentUiStatus::Done => [21, 128, 61, 255],       // green
        AgentUiStatus::NeedsInput => [124, 58, 237, 255], // purple
        AgentUiStatus::Failed => [185, 28, 28, 255],     // red
        AgentUiStatus::Unknown => [148, 163, 184, 255],  // slate
    }
}

/// Build a circular tray icon for the given status.
pub fn status_icon(status: AgentUiStatus) -> Image<'static> {
    let [r, g, b, a] = status_rgba(status);
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    let cx = (SIZE as f32 - 1.0) / 2.0;
    let cy = cx;
    let radius = SIZE as f32 / 2.0 - 1.0;

    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let dist = (dx * dx + dy * dy).sqrt();
            let idx = ((y * SIZE + x) * 4) as usize;
            if dist <= radius {
                // Soft edge for HiDPI trays.
                let alpha = if dist > radius - 1.0 {
                    ((radius - dist).clamp(0.0, 1.0) * a as f32) as u8
                } else {
                    a
                };
                rgba[idx] = r;
                rgba[idx + 1] = g;
                rgba[idx + 2] = b;
                rgba[idx + 3] = alpha;
            }
        }
    }

    Image::new_owned(rgba, SIZE, SIZE)
}

pub fn apply_tray_status(app: &AppHandle, status: AgentUiStatus) {
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };
    set_tray_visual(&tray, status);
}

fn set_tray_visual(tray: &TrayIcon, status: AgentUiStatus) {
    let _ = tray.set_icon(Some(status_icon(status)));
    let _ = tray.set_tooltip(Some(format!(
        "Desktop Companion · {}",
        status.label_zh()
    )));
}

/// Whether the main companion window is focused (used for notify-when-unfocused).
pub fn main_window_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false)
}
