//! Colored tray icons + tooltip for aggregate agent status + Spending usage %.
//!
//! Circle color = aggregated agent status (失败 / 待跟进 / 已完成 / 工作中 / 未知).
//! Digit overlay = plan usage percent (e.g. `47` for 47%). Missing usage → no digits.

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
        AgentUiStatus::Working => [217, 119, 6, 255],    // amber
        AgentUiStatus::Done => [21, 128, 61, 255],        // green
        AgentUiStatus::NeedsInput => [124, 58, 237, 255], // purple
        AgentUiStatus::Failed => [185, 28, 28, 255],      // red
        AgentUiStatus::Unknown => [148, 163, 184, 255],   // slate
    }
}

/// Build a circular tray icon; optionally overlay usage percent digits.
pub fn status_icon(status: AgentUiStatus, used_percent: Option<u32>) -> Image<'static> {
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

    if let Some(pct) = used_percent {
        let label = format!("{}", pct.min(100));
        blit_digits(&mut rgba, &label);
    }

    Image::new_owned(rgba, SIZE, SIZE)
}

/// Tiny 3×5 bitmap font for digits 0–9 (MSB left).
const DIGITS: [[u8; 5]; 10] = [
    [0b111, 0b101, 0b101, 0b101, 0b111], // 0
    [0b010, 0b110, 0b010, 0b010, 0b111], // 1
    [0b111, 0b001, 0b111, 0b100, 0b111], // 2
    [0b111, 0b001, 0b111, 0b001, 0b111], // 3
    [0b101, 0b101, 0b111, 0b001, 0b001], // 4
    [0b111, 0b100, 0b111, 0b001, 0b111], // 5
    [0b111, 0b100, 0b111, 0b101, 0b111], // 6
    [0b111, 0b001, 0b001, 0b001, 0b001], // 7
    [0b111, 0b101, 0b111, 0b101, 0b111], // 8
    [0b111, 0b101, 0b111, 0b001, 0b111], // 9
];

fn blit_digits(rgba: &mut [u8], label: &str) {
    let chars: Vec<u8> = label
        .bytes()
        .filter_map(|c| {
            if c.is_ascii_digit() {
                Some(c - b'0')
            } else {
                None
            }
        })
        .collect();
    if chars.is_empty() {
        return;
    }

    // Scale: 1px for 3 digits (100), 2px for 1–2 digits.
    let scale: u32 = if chars.len() >= 3 { 1 } else { 2 };
    let digit_w = 3 * scale;
    let gap = scale;
    let total_w = chars.len() as u32 * digit_w + (chars.len() as u32 - 1) * gap;
    let total_h = 5 * scale;
    let origin_x = (SIZE.saturating_sub(total_w)) / 2;
    let origin_y = (SIZE.saturating_sub(total_h)) / 2;

    let mut x_cursor = origin_x;
    for (i, d) in chars.iter().enumerate() {
        if i > 0 {
            x_cursor += gap;
        }
        blit_digit(rgba, *d as usize, x_cursor, origin_y, scale);
        x_cursor += digit_w;
    }
}

fn blit_digit(rgba: &mut [u8], digit: usize, ox: u32, oy: u32, scale: u32) {
    let glyph = DIGITS[digit.min(9)];
    for (row, bits) in glyph.iter().enumerate() {
        for col in 0..3u32 {
            if (bits >> (2 - col)) & 1 == 0 {
                continue;
            }
            for dy in 0..scale {
                for dx in 0..scale {
                    let x = ox + col * scale + dx;
                    let y = oy + row as u32 * scale + dy;
                    if x >= SIZE || y >= SIZE {
                        continue;
                    }
                    let idx = ((y * SIZE + x) * 4) as usize;
                    // High-contrast white digit with soft dark outline via neighbor fill.
                    rgba[idx] = 255;
                    rgba[idx + 1] = 255;
                    rgba[idx + 2] = 255;
                    rgba[idx + 3] = 255;
                }
            }
        }
    }
}

pub fn apply_tray_status(
    app: &AppHandle,
    status: AgentUiStatus,
    used_percent: Option<u32>,
) {
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };
    set_tray_visual(&tray, status, used_percent);
}

fn set_tray_visual(tray: &TrayIcon, status: AgentUiStatus, used_percent: Option<u32>) {
    let _ = tray.set_icon(Some(status_icon(status, used_percent)));
    let pct_txt = used_percent
        .map(|p| format!(" · {p}%"))
        .unwrap_or_default();
    let _ = tray.set_tooltip(Some(format!(
        "Desktop Companion · {}{}",
        status.label_zh(),
        pct_txt
    )));
}

/// Whether the main companion window is focused (used for notify-when-unfocused).
pub fn main_window_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_icon_with_and_without_percent() {
        let _ = status_icon(AgentUiStatus::Working, Some(47));
        let _ = status_icon(AgentUiStatus::Failed, None);
        let _ = status_icon(AgentUiStatus::Done, Some(100));
    }
}
