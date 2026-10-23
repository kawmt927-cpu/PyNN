"""Windows entry: install deps, open the window, never fail silently."""

from __future__ import annotations

import subprocess
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _say(text: str) -> None:
    print(text, flush=True)


def _message(title: str, text: str) -> None:
    _say(text)
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        try:
            root.attributes("-topmost", True)
        except Exception:
            pass
        messagebox.showerror(title, text)
        root.destroy()
    except Exception:
        pass


def _ensure_deps() -> None:
    try:
        import customtkinter  # noqa: F401

        return
    except Exception:
        pass
    req = ROOT / "requirements.txt"
    _say("第一次打开：正在安装窗口库 customtkinter …")
    cmd = [sys.executable, "-m", "pip", "install", "-r", str(req)]
    result = subprocess.run(cmd, cwd=str(ROOT))
    if result.returncode != 0:
        raise RuntimeError(
            "自动安装依赖失败。\n"
            "请在这个文件夹打开命令行，执行：\n"
            f'"{sys.executable}" -m pip install -r requirements.txt\n'
            "装好后再双击 Open.bat。"
        )
    try:
        import customtkinter  # noqa: F401
    except Exception as exc:
        raise RuntimeError(
            "依赖装完了，但仍无法导入 customtkinter。\n"
            f"详情：{exc}\n"
            "请把本窗口全部文字截图发我。"
        ) from exc


def main() -> int:
    _say(f"Python：{sys.executable}")
    _say(f"目录：{ROOT}")
    try:
        _ensure_deps()
        from window import main as run_window

        _say("正在打开窗口…")
        run_window()
        _say("窗口已关闭。")
        return 0
    except Exception:
        detail = traceback.format_exc()
        _say(detail)
        _message(
            "塔塔钓鱼打不开",
            "打开失败。请把黑色窗口里的文字截图发我。\n\n" + detail[-1200:],
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
