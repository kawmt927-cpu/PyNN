"""Fishing controller. The desktop window drives this; there is no web UI."""

from __future__ import annotations

import threading
from pathlib import Path

from adb_client import AdbClient
from calibration import Calibration
from machine import STATS_NOTE, FisherSession, Observation, subtitle
from vision import Detection, analyze

ROOT = Path(__file__).resolve().parent

START_BLOCKED = (
    "不能开始钓鱼：模拟器还没连接。没有实时画面时，缺少校准也不会空跑。"
)
UNKNOWN_SCREEN = (
    "认不出当前画面。请停在钓鱼大赛（绿钮、等待、拉钩、滑块或结算）。开始钓鱼不会空跑。"
)


class App:
    def __init__(self) -> None:
        self.adb = AdbClient()
        self.session = FisherSession()
        self.calibration = Calibration(ROOT / "calibration.json")
        self.lock = threading.Lock()
        self.thread: threading.Thread | None = None
        self.last_error = ""

    def status(self) -> dict:
        with self.lock:
            session = self.session
            return {
                "ok": True,
                "running": session.running,
                "status": session.status,
                "phase": session.phase,
                "connected": self.adb.connected,
                "connection": self.adb.label() if self.adb.connected else self.adb.message,
                "mode": self.adb.mode,
                "serial": self.adb.serial,
                "count": session.count,
                "unlimited": session.unlimited,
                "subtitle": subtitle(session.count, session.unlimited),
                "min_luck": session.min_luck,
                "luck": session.luck,
                "casts": session.casts,
                "success": session.success,
                "fail": session.fail,
                "note": STATS_NOTE,
                "timer_seconds": session.timer_seconds,
                "timer_text": (
                    f"{session.timer_seconds}S" if session.timer_seconds is not None else "未识别"
                ),
                "popup": session.popup,
                "popup_title": "请补充道具" if session.popup else None,
                "logs": list(session.logs[-80:]),
                "calibrated": self.calibration.ready,
                "error": self.last_error,
            }

    def connect(self, mode: str, serial: str | None) -> dict:
        ok, message = self.adb.connect(mode, serial or None)
        return {"ok": ok, "message": message, "connection": self.adb.label() if ok else message}

    def start(self, count: int, unlimited: bool, min_luck: int) -> dict:
        if not self.adb.connected:
            return {"ok": False, "message": START_BLOCKED}
        try:
            frame = self.adb.screencap()
        except Exception as exc:
            return {"ok": False, "message": f"截图失败，不能开始：{exc}"}
        det = analyze(frame)
        if det.state == "unknown":
            return {"ok": False, "message": UNKNOWN_SCREEN}
        with self.lock:
            try:
                self.session.start(count, unlimited, min_luck)
            except ValueError as exc:
                return {"ok": False, "message": str(exc)}
            self.last_error = ""
        if self.thread is None or not self.thread.is_alive():
            self.thread = threading.Thread(target=self._loop, daemon=True)
            self.thread.start()
        return {"ok": True, "status": "正在钓鱼", "message": "正在钓鱼"}

    def stop(self) -> dict:
        with self.lock:
            decision = self.session.stop()
        return {"ok": True, "status": decision.status, "message": "已停止"}

    def _loop(self) -> None:
        while True:
            with self.lock:
                if not self.session.running:
                    break
            try:
                frame = self.adb.screencap()
            except Exception as exc:
                with self.lock:
                    self.last_error = str(exc)
                    self.session.logs.append(f"截图失败：{exc}")
                    self.session.stop()
                break
            det = analyze(frame)
            with self.lock:
                if not self.session.running:
                    break
                decision = self.session.step(_obs(det))
                taps = [(action, self._tap_point(action, det)) for action in decision.actions]
            for _action, point in taps:
                if point is None:
                    continue
                try:
                    self.adb.tap(point[0], point[1])
                except Exception as exc:
                    with self.lock:
                        self.session.logs.append(f"点击失败：{exc}")

    def _tap_point(self, action: str, det: Detection) -> tuple[int, int] | None:
        point = det.point_for(action)
        name = {"tap_green": "green_button", "tap_hook": "hook_button"}.get(action)
        if name is None:
            return point
        override = self.calibration.point(name, det.width, det.height)
        return override if override is not None else point


def _obs(det: Detection) -> Observation:
    return Observation(
        state=det.state,
        inside=det.inside,
        toast=det.toast,
        luck=det.luck,
        timer_seconds=det.timer_seconds,
    )
