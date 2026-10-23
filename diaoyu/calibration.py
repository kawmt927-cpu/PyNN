"""Optional manual regions. Auto detection is the default."""

from __future__ import annotations

import json
from pathlib import Path


class Calibration:
    def __init__(self, path: Path):
        self.path = path
        self.data: dict = {}
        self.load()

    def load(self) -> None:
        if self.path.exists():
            self.data = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            self.data = {}

    def save(self, payload: dict) -> None:
        self.data = payload
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    @property
    def ready(self) -> bool:
        needed = ("green_button", "hook_button")
        return all(self.point(name, 100, 100) is not None for name in needed)

    def point(self, name: str, width: int, height: int) -> tuple[int, int] | None:
        """Relative center, or the center of a relative rectangle. None if missing."""
        region = (self.data.get("regions") or {}).get(name)
        if not isinstance(region, dict):
            return None
        try:
            x = float(region["x"])
            y = float(region["y"])
        except (KeyError, TypeError, ValueError):
            return None
        if "w" in region or "h" in region:
            try:
                x += float(region.get("w", 0)) / 2
                y += float(region.get("h", 0)) / 2
            except (TypeError, ValueError):
                return None
        if not (0 <= x <= 1 and 0 <= y <= 1):
            return None
        if width <= 0 or height <= 0:
            return None
        return (int(x * width), int(y * height))
