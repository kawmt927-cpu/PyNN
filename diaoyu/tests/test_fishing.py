"""Vision and the locked contest loop. No device required."""

from __future__ import annotations

import os
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from machine import (  # noqa: E402
    STATS_NOTE,
    UNLIMITED_SUBTITLE,
    FisherSession,
    Observation,
    finite_subtitle,
)
from calibration import Calibration  # noqa: E402
from pngutil import decode_png, fill_rect, parse_raw_screencap, solid  # noqa: E402
from runner import START_BLOCKED, App  # noqa: E402
from vision import Detection, analyze, interval_inside  # noqa: E402
from window import FishingWindow  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"


def load(name: str):
    return decode_png((FIX / name).read_bytes())


def session_ready(**kwargs) -> FisherSession:
    fish = FisherSession()
    fish.start(
        kwargs.get("count", 20),
        kwargs.get("unlimited", False),
        kwargs.get("min_luck", 8),
    )
    return fish


class VisionTests(unittest.TestCase):
    def test_ready_luck_8_is_not_the_rank_badge(self):
        det = analyze(load("ready-8.png"))
        self.assertEqual(det.state, "ready")
        self.assertEqual(det.luck, 8)
        self.assertIsNotNone(det.green)
        self.assertFalse(hasattr(det, "rod_cost"))

    def test_ready_luck_4(self):
        det = analyze(load("ready-4.png"))
        self.assertEqual(det.state, "ready")
        self.assertEqual(det.luck, 4)

    def test_wait_frames_do_not_ask_for_a_tap(self):
        for name in ("wait-a.png", "wait-b.png"):
            det = analyze(load(name))
            self.assertEqual(det.state, "wait", name)
            self.assertIsNone(det.green)
            self.assertIsNone(det.hook)

    def test_bite_is_the_hook_button(self):
        det = analyze(load("bite.png"))
        self.assertEqual(det.state, "bite")
        self.assertIsNotNone(det.hook)
        self.assertLess(det.hook[1], det.hook[1] + 1)
        self.assertGreater(det.hook[1], load("bite.png").height * 0.7)

    def test_slider_edge_counts_as_inside_and_toast_is_not_the_end(self):
        frame = load("slider.png")
        det = analyze(frame)
        self.assertEqual(det.state, "slider")
        self.assertTrue(det.inside)
        self.assertTrue(det.toast)
        self.assertIsNotNone(det.screen_tap)
        self.assertLess(det.screen_tap[1], frame.height * 0.7)
        self.assertNotEqual(det.timer_seconds, 0)

    def test_both_settlement_titles_ignore_the_fish(self):
        for name in ("settle-got.png", "settle-record.png"):
            det = analyze(load(name))
            self.assertEqual(det.state, "settlement", name)
            self.assertIsNotNone(det.screen_tap)

    def test_lime_title_without_a_fish_is_still_settlement(self):
        frame = solid(400, 700, (30, 50, 70))
        fill_rect(frame, 70, 90, 260, 36, (90, 230, 70))
        fill_rect(frame, 40, 150, 320, 280, (40, 120, 200))
        det = analyze(frame)
        self.assertEqual(det.state, "settlement")

    def test_a_fish_colored_blob_alone_is_not_settlement(self):
        frame = solid(400, 700, (120, 190, 220))
        fill_rect(frame, 140, 260, 120, 80, (40, 80, 180))
        det = analyze(frame)
        self.assertNotEqual(det.state, "settlement")

    def test_interval_edges(self):
        self.assertTrue(interval_inside(270, 304, 324, 402, 22))
        self.assertFalse(interval_inside(270, 304, 324, 402, 0))
        self.assertTrue(interval_inside(340, 360, 324, 402, 0))
        self.assertFalse(interval_inside(80, 120, 324, 402, 10))
        self.assertFalse(interval_inside(460, 500, 324, 402, 10))


class MachineTests(unittest.TestCase):
    def test_full_catch_then_luck_blocks_the_next_cast(self):
        fish = session_ready(min_luck=8)
        first = fish.step(Observation(state="slider", inside=True))
        self.assertEqual(first.actions, ["tap_screen"])
        self.assertNotIn("tap_hook", first.actions)
        self.assertEqual(fish.success, 0)
        done = fish.step(Observation(state="settlement"))
        self.assertEqual(done.actions, ["tap_screen"])
        self.assertEqual(fish.success, 1)
        self.assertEqual(fish.fail, 0)
        again = fish.step(Observation(state="settlement"))
        self.assertEqual(fish.success, 1)
        self.assertIn("tap_screen", again.actions)
        blocked = fish.step(Observation(state="ready", luck=4))
        self.assertEqual(blocked.actions, [])
        self.assertFalse(fish.running)
        self.assertIn("幸运", fish.popup)
        self.assertEqual(fish.casts, 1)
        self.assertEqual(fish.success + fish.fail, fish.casts)

    def test_green_cast_only_at_full_luck_then_wait_is_quiet(self):
        fish = session_ready()
        low = fish.step(Observation(state="ready", luck=4))
        self.assertEqual(low.actions, [])
        self.assertFalse(fish.running)
        fish = session_ready()
        cast = fish.step(Observation(state="ready", luck=8))
        self.assertEqual(cast.actions, ["tap_green"])
        quiet = fish.step(Observation(state="wait"))
        self.assertEqual(quiet.actions, [])
        self.assertTrue(fish.running)
        self.assertEqual(fish.success, 0)

    def test_missed_hook_is_a_failure(self):
        fish = session_ready()
        fish.step(Observation(state="ready", luck=8))
        fish.step(Observation(state="wait"))
        bite = fish.step(Observation(state="bite"))
        self.assertEqual(bite.actions, ["tap_hook"])
        self.assertNotIn("tap_screen", bite.actions)
        fish.step(Observation(state="wait"))
        self.assertEqual(fish.fail, 0)
        fish.step(Observation(state="wait"))
        self.assertEqual(fish.fail, 1)
        self.assertEqual(fish.success, 0)
        self.assertFalse(fish.cast_open)

    def test_broken_slider_is_a_failure_and_toast_is_not_success(self):
        fish = session_ready()
        fish.step(Observation(state="ready", luck=8))
        held = fish.step(Observation(state="slider", inside=True, toast=True))
        self.assertEqual(held.actions, [])
        self.assertEqual(fish.success, 0)
        fish.step(Observation(state="slider", inside=False, toast=False))
        hit = fish.step(Observation(state="slider", inside=True, toast=False))
        self.assertEqual(hit.actions, ["tap_screen"])
        again = fish.step(Observation(state="slider", inside=True, toast=False))
        self.assertEqual(again.actions, [])
        fish.step(Observation(state="ready", luck=8))
        fish.step(Observation(state="ready", luck=8))
        self.assertEqual(fish.fail, 1)
        self.assertEqual(fish.success, 0)

    def test_timer_zero_stops_and_does_not_invent_cost(self):
        fish = session_ready()
        fish.step(Observation(state="ready", luck=8))
        fish.step(Observation(state="slider", inside=False))
        end = fish.step(Observation(state="slider", timer_seconds=0))
        self.assertFalse(end.running)
        self.assertEqual(fish.fail, 1)
        self.assertFalse(hasattr(fish, "rod_cost"))
        caught = session_ready()
        caught.step(Observation(state="settlement", timer_seconds=0))
        self.assertEqual(caught.success, 1)
        self.assertFalse(caught.running)

    def test_count_and_unlimited(self):
        fish = session_ready(count=1)
        fish.step(Observation(state="settlement"))
        nxt = fish.step(Observation(state="ready", luck=8))
        self.assertEqual(nxt.actions, [])
        self.assertEqual(fish.status, "已完成")
        forever = session_ready(unlimited=True, count=1)
        forever.step(Observation(state="settlement"))
        again = forever.step(Observation(state="ready", luck=8))
        self.assertEqual(again.actions, ["tap_green"])
        self.assertTrue(forever.running)

    def test_manual_stop_counts_the_open_cast_as_failure(self):
        fish = session_ready()
        fish.step(Observation(state="ready", luck=8))
        fish.stop()
        self.assertEqual(fish.fail, 1)
        self.assertEqual(fish.status, "已停止")
        self.assertEqual(fish.casts, fish.success + fish.fail)

    def test_subtitles(self):
        self.assertEqual(UNLIMITED_SUBTITLE, "无限次数 · 手动停止或大赛结束时结束")
        self.assertEqual(finite_subtitle(20), "本次钓鱼 20 次")
        self.assertEqual(STATS_NOTE, "仅统计本次钓鱼；中止或未确认成功的甩杆计入失败。")


def _widget_texts(widget) -> list[str]:
    found: list[str] = []
    try:
        text = widget.cget("text")
    except Exception:
        text = None
    if text:
        found.append(str(text))
    for child in widget.winfo_children():
        found.extend(_widget_texts(child))
    return found


class AppTests(unittest.TestCase):
    def test_blocked_start_and_stop(self):
        app = App()
        result = app.start(20, False, 8)
        self.assertFalse(result["ok"])
        self.assertEqual(result["message"], START_BLOCKED)
        stopped = app.stop()
        self.assertTrue(stopped["ok"])
        self.assertEqual(stopped["status"], "已停止")

    def test_raw_screencap(self):
        raw = b"".join(
            [
                (2).to_bytes(4, "little"),
                (2).to_bytes(4, "little"),
                (1).to_bytes(4, "little"),
                bytes([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 1, 2, 3, 255]),
            ]
        )
        frame = parse_raw_screencap(raw)
        self.assertEqual(frame.width, 2)
        self.assertEqual(frame.get(1, 1), (1, 2, 3))

    def test_package_has_no_rod_stops_or_browser_ui(self):
        banned = ("解锁新鱼竿", "鱼竿用完", "软件授权", "stop_on_new_rod", "rod_empty", "pywebview")
        for path in ROOT.glob("*.py"):
            text = path.read_text(encoding="utf-8")
            for word in banned:
                self.assertNotIn(word, text, f"{path.name} contains {word}")
        self.assertFalse((ROOT / "server.py").exists())
        self.assertFalse((ROOT / "web").exists())
        self.assertNotIn("8765", (ROOT / "README.md").read_text(encoding="utf-8"))


class WindowTests(unittest.TestCase):
    def setUp(self):
        self.win = FishingWindow(App())
        self.addCleanup(self._close)

    def _close(self) -> None:
        if self.win._tick_job is not None:
            try:
                self.win.after_cancel(self.win._tick_job)
            except Exception:
                pass
        self.win.destroy()

    def test_controls_unlimited_toggle_and_refused_start(self):
        texts = "\n".join(_widget_texts(self.win))
        for snippet in (
            "塔塔钓鱼",
            "连接模拟器",
            "开始钓鱼",
            "停止钓鱼",
            "本次钓鱼次数",
            "无限次数",
            "查看日志",
            "甩杆次数",
            "成功次数",
            "失败次数",
            STATS_NOTE,
            "最低幸运",
        ):
            self.assertIn(snippet, texts)
        for banned in ("解锁新鱼竿", "鱼竿用完", "软件授权", "每杆消耗"):
            self.assertNotIn(banned, texts)
        self.assertEqual(self.win.mode.get(), "MuMu")
        self.assertEqual(self.win.min_luck.get(), "8")
        self.assertEqual(self.win.subtitle.cget("text"), "本次钓鱼 20 次")
        self.assertTrue(self.win.start_is_active)
        self.assertNotEqual(self.win.stop_btn.cget("fg_color"), "#c4473a")

        self.win.unlimited.select()
        self.win.refresh_subtitle()
        self.assertEqual(self.win.subtitle.cget("text"), UNLIMITED_SUBTITLE)
        self.assertEqual(str(self.win.count.cget("state")), "disabled")

        self.win.unlimited.deselect()
        self.win.refresh_subtitle()
        self.win.count.delete(0, "end")
        self.win.count.insert(0, "7")
        self.win.refresh_subtitle()
        self.assertEqual(self.win.subtitle.cget("text"), "本次钓鱼 7 次")

        self.win.on_start()
        self._pump_until_error()
        self.assertEqual(self.win.error.cget("text"), START_BLOCKED)
        self.assertTrue(self.win.start_is_active)
        self.win.on_stop()
        self.assertEqual(self.win.run_status.cget("text"), "已停止")

        self.win.app.session.running = True
        self.win.app.session.status = "正在钓鱼"
        self.win.refresh()
        self.assertFalse(self.win.start_is_active)
        stop_color = self.win.stop_btn.cget("fg_color")
        colors = stop_color if isinstance(stop_color, (tuple, list)) else (stop_color,)
        self.assertIn("#c4473a", colors)

        self.win.on_log()
        self.win.update()
        self.assertEqual(self.win.log.winfo_manager(), "pack")

    def test_low_luck_dialog_once(self):
        shown = []
        self.win.show_luck_dialog = lambda title, text: shown.append((title, text))
        self.win.app.session.popup = "幸运值不够。请自己补充道具。不会自动使用道具。"
        self.win.app.session.status = "幸运不足"
        self.win.refresh()
        self.win.refresh()
        self.assertEqual(shown, [("请补充道具", self.win.app.session.popup)])
        with mock.patch("window.messagebox.showinfo") as box:
            FishingWindow.show_luck_dialog(self.win, "请补充道具", "请自己补充道具")
        box.assert_called_once()

    def _pump_until_error(self) -> None:
        for _ in range(40):
            self.win.update()
            self.win.refresh()
            if self.win.error.cget("text"):
                return
            time.sleep(0.02)
        self.fail("开始钓鱼没有把拒绝原因显示出来")


class CalibrationTests(unittest.TestCase):
    def test_relative_centers_override_only_the_two_buttons(self):
        cal = Calibration(Path("/tmp/diaoyu-cal-missing.json"))
        self.assertFalse(cal.ready)
        cal.data = {
            "regions": {
                "green_button": {"x": 0.5, "y": 0.8},
                "hook_button": {"x": 0.25, "y": 0.5, "w": 0.5, "h": 0.2},
            }
        }
        self.assertTrue(cal.ready)
        self.assertEqual(cal.point("green_button", 200, 100), (100, 80))
        self.assertEqual(cal.point("hook_button", 200, 100), (100, 60))
        self.assertIsNone(cal.point("share", 200, 100))
        cal.data = {"regions": {"green_button": {"x": 2, "y": 0.5}, "hook_button": {"x": 0.5, "y": 0.5}}}
        self.assertFalse(cal.ready)

        app = App()
        app.calibration.data = {
            "regions": {
                "green_button": {"x": 0.5, "y": 0.8},
                "hook_button": {"x": 0.25, "y": 0.5, "w": 0.5, "h": 0.2},
            }
        }
        det = Detection(
            state="ready",
            green=(1, 2),
            hook=(3, 4),
            screen_tap=(9, 9),
            width=200,
            height=100,
        )
        self.assertEqual(app._tap_point("tap_green", det), (100, 80))
        self.assertEqual(app._tap_point("tap_hook", det), (100, 60))
        self.assertEqual(app._tap_point("tap_screen", det), (9, 9))
        app.calibration.data = {}
        self.assertEqual(app._tap_point("tap_green", det), (1, 2))



class LaunchTests(unittest.TestCase):
    def test_launch_ensure_deps_when_customtkinter_present(self):
        import launch
        launch._ensure_deps()
        self.assertTrue((ROOT / "Open.bat").exists())
        bat = (ROOT / "Open.bat").read_text(encoding="utf-8", errors="ignore")
        self.assertIn("cmd /k", bat)
        self.assertIn("launch.py", bat)
        self.assertIn("pause", bat)

if __name__ == "__main__":
    os.chdir(ROOT)
    unittest.main()
