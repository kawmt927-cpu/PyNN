"""MuMu / H5 connections over adb. Typical ports: 7555, 16384, 5555."""

from __future__ import annotations

import shutil
import subprocess

from pngutil import Frame, decode_png, parse_raw_screencap

PORTS = (7555, 16384, 5555)


class AdbClient:
    def __init__(self) -> None:
        self.serial: str | None = None
        self.mode = "mumu"
        self.message = "未连接"

    @property
    def connected(self) -> bool:
        return self.serial is not None

    def label(self) -> str:
        if not self.connected:
            return "未连接"
        name = "MuMu" if self.mode == "mumu" else "H5"
        return f"已连接 {name}"

    def connect(self, mode: str = "mumu", serial: str | None = None) -> tuple[bool, str]:
        self.mode = "h5" if mode == "h5" else "mumu"
        if shutil.which("adb") is None:
            self.serial = None
            self.message = "未找到 adb。请安装 platform-tools，并把 adb 加入 PATH。"
            return False, self.message
        targets = [serial] if serial else [f"127.0.0.1:{port}" for port in PORTS]
        subprocess.run(["adb", "start-server"], capture_output=True, text=True)
        tried = []
        for target in targets:
            if ":" in target and not target.startswith("emulator-"):
                subprocess.run(["adb", "connect", target], capture_output=True, text=True)
            state = subprocess.run(
                ["adb", "-s", target, "get-state"],
                capture_output=True,
                text=True,
            )
            tried.append(target)
            if state.stdout.strip() == "device":
                self.serial = target
                self.message = self.label()
                return True, self.message
        self.serial = None
        shown = " / ".join(str(port) for port in PORTS) if serial is None else serial
        self.message = f"没连上模拟器。已尝试 {shown}。"
        return False, self.message

    def disconnect(self) -> None:
        self.serial = None
        self.message = "未连接"

    def screencap(self) -> Frame:
        if not self.serial:
            raise RuntimeError("模拟器还没连接")
        raw = subprocess.check_output(
            ["adb", "-s", self.serial, "exec-out", "screencap"],
            stderr=subprocess.STDOUT,
        )
        if raw.startswith(b"\x89PNG\r\n\x1a\n"):
            return decode_png(raw)
        return parse_raw_screencap(raw)

    def tap(self, x: int, y: int) -> None:
        if not self.serial:
            raise RuntimeError("模拟器还没连接")
        subprocess.check_call(
            ["adb", "-s", self.serial, "shell", "input", "tap", str(int(x)), str(int(y))],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
