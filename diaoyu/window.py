"""Native desktop window for 塔塔钓鱼. Opens when the app starts."""

from __future__ import annotations

import queue
import threading
import tkinter as tk
import tkinter.font as tkfont
from tkinter import messagebox

import customtkinter as ctk

from machine import LOW_LUCK_TITLE, STATS_NOTE, UNLIMITED_SUBTITLE, finite_subtitle
from runner import App

GREEN = "#1f8a4c"
GREEN_HOVER = "#176b3b"
STOP = "#c4473a"
STOP_HOVER = "#a8382e"
IDLE = "#e7e7e7"
INK = "#1c2430"
MUTED = "#5c6770"
CARD = "#ffffff"
PAGE = "#e7f2ec"


def _font_family(root: tk.Misc) -> str:
    families = set(tkfont.families(root))
    for name in (
        "Microsoft YaHei",
        "微软雅黑",
        "PingFang SC",
        "Noto Sans CJK SC",
        "WenQuanYi Micro Hei",
        "Droid Sans Fallback",
    ):
        if name in families:
            return name
    return "TkDefaultFont"


class FishingWindow(ctk.CTk):
    def __init__(self, app: App | None = None) -> None:
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("green")
        super().__init__(fg_color=PAGE)
        self.app = app or App()
        self.title("塔塔钓鱼")
        self.geometry("460x760")
        self.minsize(420, 640)
        family = _font_family(self)
        self.font = ctk.CTkFont(family=family, size=14)
        self.font_bold = ctk.CTkFont(family=family, size=16, weight="bold")
        self.font_small = ctk.CTkFont(family=family, size=12)
        self._shown_popup: str | None = None
        self._log_cache = ""
        self._log_open = False
        self._tick_job: str | None = None
        self._notes: queue.Queue[tuple[str, str]] = queue.Queue()
        self.start_is_active = True
        self._build()
        self.refresh_subtitle()
        self.refresh()
        self._tick_job = self.after(400, self._tick)

    def _build(self) -> None:
        outer = ctk.CTkFrame(self, fg_color=PAGE)
        outer.pack(fill="both", expand=True, padx=16, pady=16)

        ctk.CTkLabel(outer, text="塔塔钓鱼", font=self.font_bold, text_color=INK).pack(anchor="w")
        ctk.CTkLabel(
            outer, text="塔塔冒险队 · 钓鱼大赛", font=self.font_small, text_color=MUTED
        ).pack(anchor="w", pady=(0, 10))

        link = self._card(outer)
        row = ctk.CTkFrame(link, fg_color="transparent")
        row.pack(fill="x", padx=12, pady=(12, 6))
        ctk.CTkLabel(row, text="模拟器", font=self.font, text_color=INK).pack(side="left")
        self.mode = ctk.CTkOptionMenu(
            row, values=["MuMu", "H5"], width=110, font=self.font, command=lambda _v: None
        )
        self.mode.set("MuMu")
        self.mode.pack(side="left", padx=(8, 8))
        self.serial = ctk.CTkEntry(
            row, placeholder_text="可选 127.0.0.1:7555", font=self.font
        )
        self.serial.pack(side="left", fill="x", expand=True)
        self.connect_btn = ctk.CTkButton(
            link, text="连接模拟器", font=self.font, command=self.on_connect
        )
        self.connect_btn.pack(anchor="w", padx=12, pady=(0, 4))
        self.connection = ctk.CTkLabel(link, text="未连接", font=self.font, text_color=INK)
        self.connection.pack(anchor="w", padx=12, pady=(0, 12))

        fish = self._card(outer)
        counts = ctk.CTkFrame(fish, fg_color="transparent")
        counts.pack(fill="x", padx=12, pady=(12, 4))
        ctk.CTkLabel(counts, text="本次钓鱼次数", font=self.font, text_color=INK).pack(side="left")
        self.count = ctk.CTkEntry(counts, width=72, font=self.font)
        self.count.insert(0, "20")
        self.count.pack(side="left", padx=(8, 12))
        self.count.bind("<KeyRelease>", lambda _e: self.refresh_subtitle())
        self.unlimited_var = tk.IntVar(value=0)
        self.unlimited = ctk.CTkCheckBox(
            counts,
            text="无限次数",
            font=self.font,
            variable=self.unlimited_var,
            command=self.refresh_subtitle,
        )
        self.unlimited.pack(side="left")
        self.subtitle = ctk.CTkLabel(fish, text="本次钓鱼 20 次", font=self.font, text_color=INK)
        self.subtitle.pack(anchor="w", padx=12, pady=(0, 6))

        luck_row = ctk.CTkFrame(fish, fg_color="transparent")
        luck_row.pack(fill="x", padx=12, pady=(0, 4))
        ctk.CTkLabel(luck_row, text="最低幸运", font=self.font, text_color=INK).pack(side="left")
        self.min_luck = ctk.CTkEntry(luck_row, width=72, font=self.font)
        self.min_luck.insert(0, "8")
        self.min_luck.pack(side="left", padx=(8, 0))
        ctk.CTkLabel(
            fish,
            text="左下角三叶草，满级 8。默认只在幸运达到 8 时才甩杆。低于就停止，并提示你自己补道具。忽略道具倒计时，不会自动使用道具。",
            font=self.font_small,
            text_color=MUTED,
            wraplength=400,
            justify="left",
            anchor="w",
        ).pack(anchor="w", padx=12, pady=(0, 8))

        buttons = ctk.CTkFrame(fish, fg_color="transparent")
        buttons.pack(fill="x", padx=12, pady=(0, 6))
        self.start_btn = ctk.CTkButton(
            buttons, text="开始钓鱼", font=self.font, width=120, command=self.on_start
        )
        self.start_btn.pack(side="left", padx=(0, 8))
        self.stop_btn = ctk.CTkButton(
            buttons, text="停止钓鱼", font=self.font, width=120, command=self.on_stop
        )
        self.stop_btn.pack(side="left")
        self.run_status = ctk.CTkLabel(fish, text="待命", font=self.font_bold, text_color=INK)
        self.run_status.pack(anchor="w", padx=12)
        self.error = ctk.CTkLabel(
            fish, text="", font=self.font_small, text_color="#b42318", wraplength=400, justify="left", anchor="w"
        )
        self.error.pack(anchor="w", padx=12, pady=(0, 12))

        stats = self._card(outer)
        grid = ctk.CTkFrame(stats, fg_color="transparent")
        grid.pack(fill="x", padx=12, pady=(12, 4))
        self.casts = self._stat(grid, "甩杆次数", 0)
        self.success = self._stat(grid, "成功次数", 1)
        self.fail = self._stat(grid, "失败次数", 2)
        ctk.CTkLabel(
            stats,
            text=STATS_NOTE,
            font=self.font_small,
            text_color=MUTED,
            wraplength=400,
            justify="left",
            anchor="w",
        ).pack(anchor="w", padx=12, pady=(0, 4))
        self.luck_label = ctk.CTkLabel(stats, text="当前幸运：未识别", font=self.font, text_color=INK)
        self.luck_label.pack(anchor="w", padx=12)
        self.timer_label = ctk.CTkLabel(stats, text="大赛倒计时：未识别", font=self.font, text_color=INK)
        self.timer_label.pack(anchor="w", padx=12, pady=(0, 8))
        self.log_btn = ctk.CTkButton(
            stats, text="查看日志", font=self.font, fg_color=IDLE, text_color=INK, hover_color="#d9d9d9",
            command=self.on_log,
        )
        self.log_btn.pack(anchor="w", padx=12, pady=(0, 12))

        self.log = ctk.CTkTextbox(outer, height=160, font=self.font_small)
        self.log.configure(state="disabled")

    def _card(self, parent: ctk.CTkFrame) -> ctk.CTkFrame:
        card = ctk.CTkFrame(parent, fg_color=CARD, corner_radius=12)
        card.pack(fill="x", pady=(0, 10))
        return card

    def _stat(self, parent: ctk.CTkFrame, title: str, column: int) -> ctk.CTkLabel:
        box = ctk.CTkFrame(parent, fg_color="transparent")
        box.grid(row=0, column=column, sticky="nsew", padx=4)
        parent.grid_columnconfigure(column, weight=1)
        ctk.CTkLabel(box, text=title, font=self.font_small, text_color=MUTED).pack()
        value = ctk.CTkLabel(box, text="0", font=self.font_bold, text_color=INK)
        value.pack()
        return value

    def refresh_subtitle(self) -> None:
        unlimited = bool(int(self.unlimited_var.get() or 0))
        self.count.configure(state="disabled" if unlimited else "normal")
        if unlimited:
            self.subtitle.configure(text=UNLIMITED_SUBTITLE)
            return
        try:
            count = max(1, int(self.count.get() or "20"))
        except ValueError:
            count = 20
        self.subtitle.configure(text=finite_subtitle(count))

    def on_connect(self) -> None:
        mode = "h5" if self.mode.get() == "H5" else "mumu"
        serial = self.serial.get().strip() or None
        self.connection.configure(text="正在连接…")

        def work() -> None:
            result = self.app.connect(mode, serial)
            text = result.get("connection") or result.get("message") or "未连接"
            self._notes.put(("connection", text))

        threading.Thread(target=work, daemon=True).start()

    def on_start(self) -> None:
        try:
            count = int(self.count.get() or "20")
            min_luck = int(self.min_luck.get() or "8")
        except ValueError:
            self.error.configure(text="次数和最低幸运要填数字")
            return
        unlimited = bool(int(self.unlimited_var.get() or 0))

        def work() -> None:
            result = self.app.start(count, unlimited, min_luck)
            self._notes.put(("error", "" if result.get("ok") else (result.get("message") or "")))

        threading.Thread(target=work, daemon=True).start()

    def on_stop(self) -> None:
        result = self.app.stop()
        self.run_status.configure(text=result.get("status") or "已停止")
        self.refresh()

    def on_log(self) -> None:
        self._log_open = not self._log_open
        if self._log_open:
            self.log.pack(fill="both", expand=True, pady=(0, 4))
            self._log_cache = ""
            self.refresh()
        else:
            self.log.pack_forget()

    def show_luck_dialog(self, title: str, text: str) -> None:
        messagebox.showinfo(title, text, parent=self)

    def refresh(self) -> None:
        while True:
            try:
                kind, text = self._notes.get_nowait()
            except queue.Empty:
                break
            if kind == "error":
                self.error.configure(text=text)
            elif kind == "connection":
                self.connection.configure(text=text)
        data = self.app.status()
        if self.connection.cget("text") != "正在连接…" or data.get("connected"):
            self.connection.configure(text=data.get("connection") or "未连接")
        self.run_status.configure(text=data.get("status") or "待命")
        self.casts.configure(text=str(data.get("casts", 0)))
        self.success.configure(text=str(data.get("success", 0)))
        self.fail.configure(text=str(data.get("fail", 0)))
        luck = data.get("luck")
        self.luck_label.configure(text="当前幸运：" + ("未识别" if luck is None else str(luck)))
        self.timer_label.configure(text="大赛倒计时：" + (data.get("timer_text") or "未识别"))
        if data.get("error"):
            self.error.configure(text=data["error"])
        running = bool(data.get("running"))
        self.start_is_active = not running
        if running:
            self.start_btn.configure(fg_color=IDLE, hover_color="#d9d9d9", text_color=INK)
            self.stop_btn.configure(fg_color=STOP, hover_color=STOP_HOVER, text_color="white")
        else:
            self.start_btn.configure(fg_color=GREEN, hover_color=GREEN_HOVER, text_color="white")
            self.stop_btn.configure(fg_color=IDLE, hover_color="#d9d9d9", text_color=INK)
        logs = "\n".join(data.get("logs") or [])
        if self._log_open and logs != self._log_cache:
            self._log_cache = logs
            self.log.configure(state="normal")
            self.log.delete("1.0", "end")
            self.log.insert("1.0", logs)
            self.log.configure(state="disabled")
        popup = data.get("popup")
        if popup and popup != self._shown_popup:
            self._shown_popup = popup
            self.show_luck_dialog(data.get("popup_title") or LOW_LUCK_TITLE, popup)
        elif not popup:
            self._shown_popup = None

    def _tick(self) -> None:
        if not self.winfo_exists():
            return
        self.refresh()
        self._tick_job = self.after(400, self._tick)


def main() -> None:
    FishingWindow().mainloop()
