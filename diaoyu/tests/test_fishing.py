"""Vision and the locked contest loop. No device required."""

from __future__ import annotations

import json
import os
import sys
import threading
import unittest
import urllib.request
from pathlib import Path

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
from server import START_BLOCKED, App, Handler, ThreadingHTTPServer  # noqa: E402
from vision import Detection, analyze, interval_inside  # noqa: E402

FIX = Path(__file__).resolve().parent / "fixtures"


def load(name: str):
    return decode_png((FIX / name).read_bytes())


def session_ready(**kwargs) -> FisherSession:
    fish = FisherSession()
    fish.start(
        kwargs.get("count", 20),
        kwargs.get("unlimited", False),
        kwargs.get("stop_on_new_rod", False),
        kwargs.get("min_luck", 8),
    )
    return fish


class VisionTests(unittest.TestCase):
    def test_ready_luck_8_is_not_the_rank_badge(self):
        det = analyze(load("ready-8.png"))
        self.assertEqual(det.state, "ready")
        self.assertEqual(det.luck, 8)
        self.assertIsNotNone(det.green)
        self.assertIsNone(det.rod_cost)

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
        self.assertIsNone(det.rod_cost)
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
        self.assertIsNone(fish.rod_cost)
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
        self.assertEqual(UNLIMITED_SUBTITLE, "无限次数 · 鱼竿用完或手动停止时结束")
        self.assertEqual(finite_subtitle(20), "本次钓鱼 20 次")
        self.assertEqual(STATS_NOTE, "仅统计本次钓鱼；中止或未确认成功的甩杆计入失败。")


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def get(self, path: str) -> tuple[int, bytes]:
        with urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}") as res:
            return res.status, res.read()

    def post(self, path: str, payload: dict | None = None) -> tuple[int, dict]:
        data = json.dumps(payload or {}).encode("utf-8")
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req) as res:
                return res.status, json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def test_panel_and_blocked_start_and_stop(self):
        status, html = self.get("/")
        text = html.decode("utf-8")
        self.assertEqual(status, 200)
        for snippet in (
            "塔塔钓鱼",
            "连接模拟器",
            "开始钓鱼",
            "停止钓鱼",
            "本次钓鱼次数",
            "无限次数",
            "无限次数 · 鱼竿用完或手动停止时结束",
            "解锁新鱼竿自动停止",
            "查看日志",
            "甩杆次数",
            "成功次数",
            "失败次数",
            STATS_NOTE,
            "每杆消耗",
            "最低幸运",
        ):
            self.assertIn(snippet, text)
        code, body = self.post("/api/start", {"count": 20, "unlimited": False, "min_luck": 8})
        self.assertEqual(code, 400)
        self.assertFalse(body["ok"])
        self.assertIn("不能开始", body["message"])
        self.assertIn("校准", body["message"])
        self.assertEqual(body["message"], START_BLOCKED)
        code, stopped = self.post("/api/stop")
        self.assertEqual(code, 200)
        self.assertTrue(stopped["ok"])
        self.assertEqual(stopped["status"], "已停止")

    def test_preview_settlement_and_raw_screencap(self):
        png = (FIX / "settle-record.png").read_bytes()
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}/api/preview",
            data=png,
            headers={"Content-Type": "image/png"},
        )
        with urllib.request.urlopen(req) as res:
            body = json.loads(res.read().decode("utf-8"))
        self.assertEqual(body["state"], "settlement")
        self.assertIsNone(body["rod_cost"])
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


if __name__ == "__main__":
    os.chdir(ROOT)
    unittest.main()
