"""Local control panel for 塔塔钓鱼."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from adb_client import AdbClient
from calibration import Calibration
from machine import STATS_NOTE, FisherSession, Observation, subtitle
from pngutil import decode_png
from vision import Detection, analyze

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web" / "index.html"

START_BLOCKED = (
    "不能开始钓鱼：模拟器还没连接。没有实时画面时，缺少校准也不会空跑。"
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
                "stop_on_new_rod": session.stop_on_new_rod,
                "min_luck": session.min_luck,
                "luck": session.luck,
                "casts": session.casts,
                "success": session.success,
                "fail": session.fail,
                "note": STATS_NOTE,
                "rod_cost": session.rod_cost,
                "rod_cost_text": session.rod_cost if session.rod_cost else "未识别",
                "timer_seconds": session.timer_seconds,
                "timer_text": (
                    f"{session.timer_seconds}S" if session.timer_seconds is not None else "未识别"
                ),
                "popup": session.popup,
                "popup_title": "请补充道具" if session.popup else None,
                "logs": session.logs[-80:],
                "calibrated": self.calibration.ready,
                "error": self.last_error,
            }

    def connect(self, mode: str, serial: str | None) -> dict:
        ok, message = self.adb.connect(mode, serial or None)
        return {"ok": ok, "message": message, "connection": self.adb.label() if ok else message}

    def start(self, count: int, unlimited: bool, stop_on_new_rod: bool, min_luck: int) -> dict:
        if not self.adb.connected:
            return {"ok": False, "message": START_BLOCKED}
        try:
            frame = self.adb.screencap()
        except Exception as exc:
            return {"ok": False, "message": f"截图失败，不能开始：{exc}"}
        det = analyze(frame)
        if det.state == "unknown":
            return {
                "ok": False,
                "message": "认不出当前画面。请停在钓鱼大赛（绿钮、等待、拉钩、滑块或结算）。开始钓鱼不会空跑。",
            }
        with self.lock:
            try:
                self.session.start(count, unlimited, stop_on_new_rod, min_luck)
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
        new_rod=det.new_rod,
        rod_empty=det.rod_empty,
        rod_cost=det.rod_cost,
    )


APP = App()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        return

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            data = WEB.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if path == "/api/status":
            self._json(200, APP.status())
            return
        if path == "/api/log":
            self._json(200, {"ok": True, "logs": APP.status()["logs"]})
            return
        if path == "/api/calibration":
            self._json(200, {"ok": True, "calibration": APP.calibration.data, "ready": APP.calibration.ready})
            return
        self._json(404, {"ok": False, "message": "没有这个地址"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/connect":
            body = self._read_json()
            serial = (body.get("serial") or "").strip() or None
            ok, message = APP.adb.connect(body.get("mode") or "mumu", serial)
            self._json(200 if ok else 400, {"ok": ok, "message": message, "connection": APP.adb.label() if ok else message})
            return
        if path == "/api/disconnect":
            APP.adb.disconnect()
            self._json(200, {"ok": True, "connection": "未连接"})
            return
        if path == "/api/start":
            body = self._read_json()
            result = APP.start(
                int(body.get("count") or 20),
                bool(body.get("unlimited")),
                bool(body.get("stop_on_new_rod")),
                int(body.get("min_luck") if body.get("min_luck") is not None else 8),
            )
            self._json(200 if result.get("ok") else 400, result)
            return
        if path == "/api/stop":
            self._json(200, APP.stop())
            return
        if path == "/api/calibration":
            body = self._read_json()
            APP.calibration.save(body)
            self._json(200, {"ok": True})
            return
        if path == "/api/preview":
            length = int(self.headers.get("Content-Length", "0") or 0)
            raw = self.rfile.read(length)
            try:
                det = analyze(decode_png(raw))
            except Exception as exc:
                self._json(400, {"ok": False, "message": f"这张图打不开：{exc}"})
                return
            self._json(
                200,
                {
                    "ok": True,
                    "state": det.state,
                    "inside": det.inside,
                    "toast": det.toast,
                    "luck": det.luck,
                    "timer_seconds": det.timer_seconds,
                    "rod_cost": det.rod_cost,
                },
            )
            return
        self._json(404, {"ok": False, "message": "没有这个地址"})


def serve(host: str = "127.0.0.1", port: int = 8765) -> None:
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"塔塔钓鱼  http://{host}:{port}")
    httpd.serve_forever()
