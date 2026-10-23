"""Locked contest loop.

Green cast button → wait while the button is gray (no taps) → on the bite
window tap the fishing button before the yellow bar ends → slider: tap
anywhere once the red bobber is inside the yellow zone, repeat until a
settlement overlay → one screen tap → back to the green button.

A catch is 成功 only when a settlement overlay appears. A missed hook or a
broken slider is 失败. 「完美!」 is timing feedback, not the end of the fish.

Luck is read on the ready screen only. A round already in progress may finish.
The next cast starts only when luck is at least the configured minimum
(default 8, which is full luck). This tool never taps items.
"""

from __future__ import annotations

from dataclasses import dataclass, field


UNLIMITED_SUBTITLE = "无限次数 · 手动停止或大赛结束时结束"
STATS_NOTE = "仅统计本次钓鱼；中止或未确认成功的甩杆计入失败。"
LOW_LUCK_TITLE = "请补充道具"


def finite_subtitle(count: int) -> str:
    return f"本次钓鱼 {count} 次"


def subtitle(count: int, unlimited: bool) -> str:
    if unlimited:
        return UNLIMITED_SUBTITLE
    return finite_subtitle(count)


@dataclass
class Observation:
    state: str = "unknown"
    inside: bool = False
    toast: bool = False
    luck: int | None = None
    timer_seconds: int | None = None


@dataclass
class Decision:
    actions: list[str] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)
    status: str = "待命"
    phase: str = "idle"
    popup: str | None = None
    running: bool = False


class FisherSession:
    def __init__(self) -> None:
        self.running = False
        self.status = "待命"
        self.phase = "idle"
        self.count = 20
        self.unlimited = False
        self.min_luck = 8
        self.casts = 0
        self.success = 0
        self.fail = 0
        self.logs: list[str] = []
        self.popup: str | None = None
        self.timer_seconds: int | None = None
        self.luck: int | None = None
        self.cast_open = False
        self.scored = False
        self.saw_wait = False
        self.saw_bite = False
        self.saw_slider = False
        self.slider_armed = True
        self.toast_latched = False
        self._ready_streak = 0
        self._wait_after_bite = 0

    def start(self, count: int, unlimited: bool, min_luck: int) -> None:
        if min_luck < 0 or min_luck > 8:
            raise ValueError("最低幸运要在 0 到 8 之间")
        if not unlimited and count < 1:
            raise ValueError("钓鱼次数至少为 1")
        self.running = True
        self.status = "正在钓鱼"
        self.phase = "idle"
        self.count = count
        self.unlimited = unlimited
        self.min_luck = min_luck
        self.casts = 0
        self.success = 0
        self.fail = 0
        self.logs = []
        self.popup = None
        self.timer_seconds = None
        self.luck = None
        self.cast_open = False
        self.scored = False
        self.saw_wait = False
        self.saw_bite = False
        self.saw_slider = False
        self.slider_armed = True
        self.toast_latched = False
        self._ready_streak = 0
        self._wait_after_bite = 0
        how = subtitle(count, unlimited)
        self._log(f"开始钓鱼 · {how} · 最低幸运 {min_luck}")

    def stop(self) -> Decision:
        if self.cast_open and not self.scored:
            self._fail("手动停止")
        self.running = False
        self.status = "已停止"
        self.phase = "idle"
        self._log("停止钓鱼")
        return self._decision([])

    def step(self, obs: Observation) -> Decision:
        if not self.running:
            return self._decision([])
        if obs.luck is not None:
            self.luck = obs.luck
        if obs.timer_seconds is not None:
            self.timer_seconds = obs.timer_seconds
        actions: list[str] = []

        if obs.state == "settlement":
            self._wait_after_bite = 0
            self._ready_streak = 0
            if not self.scored:
                self._succeed()
            self.phase = "dismiss"
            actions.append("tap_screen")
            if obs.timer_seconds == 0:
                self._halt("大赛时间到", "大赛倒计时为 0，停止钓鱼。")
                return self._decision(actions)
            return self._decision(actions)

        if obs.timer_seconds == 0:
            if self.cast_open and not self.scored:
                self._fail("大赛倒计时结束")
            self._halt("大赛时间到", "大赛倒计时为 0，停止钓鱼。")
            return self._decision([])

        if obs.state == "slider":
            self._enter_round_if_needed()
            self.saw_slider = True
            self.phase = "sliding"
            self._wait_after_bite = 0
            self._ready_streak = 0
            if obs.toast:
                if not self.toast_latched:
                    self._log("完美（这一下的提示，鱼还没结束）")
                    self.toast_latched = True
                self.slider_armed = False
                return self._decision([])
            self.toast_latched = False
            if obs.inside and self.slider_armed:
                self.slider_armed = False
                self._log("浮漂进了黄色区域，点屏幕")
                actions.append("tap_screen")
            elif not obs.inside:
                self.slider_armed = True
            return self._decision(actions)

        if obs.state == "bite":
            self._enter_round_if_needed()
            entered = self.phase != "biting"
            self.saw_bite = True
            self.phase = "biting"
            self._ready_streak = 0
            self._wait_after_bite = 0
            if entered:
                self._log("就是现在，点拉钩")
            actions.append("tap_hook")
            return self._decision(actions)

        if obs.state == "wait":
            self._ready_streak = 0
            if self.cast_open and self.saw_bite and not self.saw_slider and not self.scored:
                self._wait_after_bite += 1
                self.phase = "waiting"
                if self._wait_after_bite >= 2:
                    self._fail("错过拉钩")
                return self._decision([])
            if self.phase == "sliding" and self.cast_open and not self.scored:
                self._ready_streak += 1
                if self._ready_streak >= 2:
                    self._fail("滑块中断")
                return self._decision([])
            if self.cast_open or self.saw_wait or self.phase in ("casting", "waiting", "biting"):
                self.saw_wait = True
                self.phase = "waiting"
            else:
                # A round is already on the line. Let it finish; luck is checked later.
                self._enter_round_if_needed()
                self.saw_wait = True
                self.phase = "waiting"
            return self._decision([])

        if obs.state == "ready":
            if self.phase == "sliding" and self.cast_open and not self.scored:
                self._ready_streak += 1
                if self._ready_streak >= 2:
                    self._fail("滑块中断")
                return self._decision([])
            if self.cast_open and self.saw_bite and not self.saw_slider and not self.scored:
                self._ready_streak += 1
                if self._ready_streak >= 2:
                    self._fail("错过拉钩")
                return self._decision([])
            if self.cast_open and self.saw_wait and not self.saw_bite and not self.saw_slider and not self.scored:
                self._ready_streak += 1
                if self._ready_streak >= 2:
                    self._fail("错过拉钩")
                return self._decision([])
            self._ready_streak = 0
            self.phase = "ready"
            return self._decision(self._maybe_cast(obs))

        # Unknown frame: do not tap, and do not invent a result.
        self.phase = "unknown" if self.running else self.phase
        return self._decision([])

    def _maybe_cast(self, obs: Observation) -> list[str]:
        if self.cast_open:
            # Still looking at the green button after asking for a cast.
            return ["tap_green"]
        if self._limit_reached():
            self.running = False
            self.status = "已完成"
            self._log("本次次数已完成")
            return []
        if obs.luck is None:
            self._log("绿钮在，但没读到左下角幸运，先不甩杆")
            return []
        if obs.luck < self.min_luck:
            self.popup = (
                f"幸运值不够。当前幸运 {obs.luck}，需要至少 {self.min_luck} 才甩杆。"
                "请自己补充道具。不会自动使用道具。"
            )
            self._halt("幸运不足", self.popup)
            return []
        self._open_cast()
        self.phase = "casting"
        self._log("幸运够了，点绿色鱼竿")
        return ["tap_green"]

    def _enter_round_if_needed(self) -> None:
        if not self.cast_open and not self.scored:
            self._open_cast()
            self._log("这杆已经在进行，先把它钓完")

    def _open_cast(self) -> None:
        self.casts += 1
        self.cast_open = True
        self.scored = False
        self.saw_wait = False
        self.saw_bite = False
        self.saw_slider = False
        self.slider_armed = True
        self.toast_latched = False
        self._log(f"甩杆 #{self.casts} 开始")

    def _succeed(self) -> None:
        if not self.cast_open:
            self.casts += 1
            self._log(f"甩杆 #{self.casts} 开始")
        self.success += 1
        self.cast_open = False
        self.scored = True
        self.saw_wait = False
        self.saw_bite = False
        self.saw_slider = False
        self._log(f"甩杆 #{self.casts} 成功 · 出现结算")

    def _fail(self, reason: str) -> None:
        if not self.cast_open:
            return
        self.fail += 1
        self.cast_open = False
        self.scored = False
        self.saw_wait = False
        self.saw_bite = False
        self.saw_slider = False
        self.phase = "idle"
        self._log(f"甩杆 #{self.casts} 失败 · {reason}")

    def _halt(self, status: str, message: str) -> None:
        self.running = False
        self.status = status
        self.phase = "idle"
        self._log(message)

    def _limit_reached(self) -> bool:
        if self.unlimited:
            return False
        return (self.success + self.fail) >= self.count

    def _log(self, text: str) -> None:
        self.logs.append(text)
        if len(self.logs) > 400:
            self.logs = self.logs[-400:]

    def _decision(self, actions: list[str]) -> Decision:
        return Decision(
            actions=actions,
            logs=list(self.logs),
            status=self.status if self.running or self.status != "正在钓鱼" else self.status,
            phase=self.phase,
            popup=self.popup,
            running=self.running,
        )
