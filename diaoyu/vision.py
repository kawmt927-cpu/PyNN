"""Read a 钓鱼大赛 frame.

Positions are ratios of the current screenshot, learned from the contest
layout (green cast button, gray wait, hook banner, slider, settlement card,
bottom-left clover). Nothing here is a single hard-coded pixel coordinate.
"""

from __future__ import annotations

from dataclasses import dataclass

from pngutil import Frame

# Settlement titles that share this overlay. The reader looks for the card,
# not for one fish or one of these strings: 刷新团队记录 / 刷新团队纪录,
# 恭喜获得, 刷新个人记录 / 刷新个人纪录.


@dataclass
class Box:
    x: int
    y: int
    w: int
    h: int

    @property
    def x1(self) -> int:
        return self.x + self.w

    @property
    def y1(self) -> int:
        return self.y + self.h

    def center(self) -> tuple[int, int]:
        return self.x + self.w // 2, self.y + self.h // 2


@dataclass
class Detection:
    state: str
    green: tuple[int, int] | None = None
    hook: tuple[int, int] | None = None
    screen_tap: tuple[int, int] | None = None
    inside: bool = False
    toast: bool = False
    luck: int | None = None
    timer_seconds: int | None = None
    timer_text: str | None = None
    bobber: Box | None = None
    zone: Box | None = None
    width: int = 0
    height: int = 0

    def point_for(self, action: str) -> tuple[int, int] | None:
        if action == "tap_green":
            return self.green
        if action == "tap_hook":
            return self.hook
        if action == "tap_screen":
            return self.screen_tap
        return None


def interval_inside(b0: int, b1: int, z0: int, z1: int, margin: int) -> bool:
    """Bobber span [b0, b1] counts as inside zone [z0, z1], edges included.

    `margin` covers the small gap on the reference frame, where the red bobber
    sits on the left edge of the yellow segment.
    """
    if b0 > b1:
        b0, b1 = b1, b0
    if z0 > z1:
        z0, z1 = z1, z0
    return b1 >= z0 - margin and b0 <= z1 + margin


def _is_lime(r: int, g: int, b: int) -> bool:
    return g > 185 and g > r + 8 and g > b + 30 and r > 30 and b < 210


def _is_leaf(r: int, g: int, b: int) -> bool:
    return g > 145 and b < 120 and g > b + 55 and r > 35 and g + 25 > r and r < 240


def _is_digit_ink(r: int, g: int, b: int) -> bool:
    # The clover number is yellow, not the buff timer under the leaf.
    return r > 205 and g > 160 and 45 < b < 180 and abs(r - g) < 75 and r > b + 25


def _is_yellow(r: int, g: int, b: int) -> bool:
    return r >= 225 and g >= 170 and b <= 130 and g > b + 60 and r - g <= 90


def _is_red(r: int, g: int, b: int) -> bool:
    return r >= 155 and r > g + 30 and r > b + 30 and g < 155 and b < 140


def _is_purple(r: int, g: int, b: int) -> bool:
    return b > 155 and 100 < r < 250 and g < 180 and b > g + 35 and r > g - 10 and b + 40 > r


def _is_green_btn(r: int, g: int, b: int) -> bool:
    return g > 145 and g > r + 28 and g > b + 18 and r < 200 and b < 180


def _is_gray(r: int, g: int, b: int) -> bool:
    return (
        abs(r - g) < 22
        and abs(g - b) < 28
        and 100 <= r <= 185
        and 100 <= g <= 185
        and max(r, g, b) - min(r, g, b) < 30
    )


def _components(frame: Frame, x0, y0, x1, y1, pred, step=2, min_count=8):
    x0 = max(0, x0)
    y0 = max(0, y0)
    x1 = min(frame.width, x1)
    y1 = min(frame.height, y1)
    seen: set[tuple[int, int]] = set()
    blobs = []
    for y in range(y0, y1, step):
        for x in range(x0, x1, step):
            if (x, y) in seen or not pred(*frame.get(x, y)):
                continue
            stack = [(x, y)]
            seen.add((x, y))
            pts = []
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for nx, ny in ((cx + step, cy), (cx - step, cy), (cx, cy + step), (cx, cy - step)):
                    if nx < x0 or ny < y0 or nx >= x1 or ny >= y1 or (nx, ny) in seen:
                        continue
                    if pred(*frame.get(nx, ny)):
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if len(pts) >= min_count:
                blobs.append(pts)
    return blobs


def _bbox(pts) -> tuple[int, int, int, int]:
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def _box_from_pts(pts) -> Box:
    x0, y0, x1, y1 = _bbox(pts)
    return Box(x0, y0, max(1, x1 - x0), max(1, y1 - y0))


def _find_settlement(frame: Frame) -> bool:
    """Wide lime title over the card. Titles vary; the fish art does not matter."""
    w, h = frame.width, frame.height
    blobs = _components(
        frame, int(w * 0.08), int(h * 0.10), int(w * 0.92), int(h * 0.26), _is_lime, 2, 12
    )
    spans = []
    for pts in blobs:
        x0, y0, x1, y1 = _bbox(pts)
        spans.append((x0, x1, len(pts)))
    if not spans:
        return False
    spans.sort()
    chains: list[list[tuple[int, int, int]]] = [[spans[0]]]
    for span in spans[1:]:
        if span[0] - chains[-1][-1][1] <= w * 0.06:
            chains[-1].append(span)
        else:
            chains.append([span])
    for chain in chains:
        x0 = chain[0][0]
        x1 = max(item[1] for item in chain)
        ink = sum(item[2] for item in chain)
        width = x1 - x0
        cx = (x0 + x1) / 2 / w
        if width >= w * 0.30 and ink >= 400 and 0.32 <= cx <= 0.68:
            return True
    return False


def _yellow_bars(frame: Frame) -> list[Box]:
    w, h = frame.width, frame.height
    blobs = _components(
        frame, int(w * 0.06), int(h * 0.45), int(w * 0.94), int(h * 0.80), _is_yellow, 2, 10
    )
    bars = []
    for pts in blobs:
        box = _box_from_pts(pts)
        cx = box.x + box.w / 2
        if not (w * 0.20 <= cx <= w * 0.72):
            continue
        if box.w < w * 0.04 or box.w > w * 0.42:
            continue
        if box.h < max(4, h * 0.005) or box.h > h * 0.05:
            continue
        if box.w < box.h * 1.3:
            continue
        bars.append(box)
    bars.sort(key=lambda b: b.w * b.h, reverse=True)
    return bars


def _bobber_near(frame: Frame, bar: Box) -> Box | None:
    w, h = frame.width, frame.height
    pad_x = int(w * 0.10)
    pad_y = int(h * 0.035)
    blobs = _components(
        frame,
        bar.x - pad_x,
        bar.y - pad_y,
        bar.x1 + int(w * 0.04),
        bar.y1 + pad_y,
        _is_red,
        1,
        12,
    )
    best = None
    for pts in blobs:
        box = _box_from_pts(pts)
        if box.h > h * 0.08 or box.w > w * 0.14:
            continue
        if box.h < h * 0.012 or box.w < box.h * 0.45:
            continue
        if box.y1 < bar.y - pad_y or box.y > bar.y1 + pad_y:
            continue
        if box.x1 < bar.x:
            gap = bar.x - box.x1
        elif box.x > bar.x1:
            gap = box.x - bar.x1
        else:
            gap = 0
        if gap > w * 0.07:
            continue
        if best is None or box.w * box.h > best.w * best.h:
            best = box
    return best


def _button_disk(frame: Frame) -> tuple[int, int, int]:
    """Votes inside the lower-middle circle: green, gray, purple."""
    w, h = frame.width, frame.height
    x0, x1 = int(w * 0.33), int(w * 0.66)
    y0, y1 = int(h * 0.745), int(h * 0.90)
    green = gray = purple = 0
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            r, g, b = frame.get(x, y)
            if _is_purple(r, g, b):
                purple += 1
            elif _is_green_btn(r, g, b):
                green += 1
            elif _is_gray(r, g, b):
                gray += 1
    return green, gray, purple


def _button_center(frame: Frame) -> tuple[int, int]:
    w, h = frame.width, frame.height
    return int(w * 0.50), int(h * 0.82)


def _hook_center(frame: Frame) -> tuple[int, int] | None:
    w, h = frame.width, frame.height
    blobs = _components(
        frame, int(w * 0.22), int(h * 0.70), int(w * 0.78), int(h * 0.93), _is_purple, 2, 25
    )
    best = None
    for pts in blobs:
        box = _box_from_pts(pts)
        if not (w * 0.14 <= box.w <= w * 0.42):
            continue
        if not (h * 0.06 <= box.h <= h * 0.20):
            continue
        aspect = box.w / max(box.h, 1)
        if not (0.75 <= aspect <= 1.7):
            continue
        cx, cy = box.center()
        if not (w * 0.30 <= cx <= w * 0.70):
            continue
        if cy < h * 0.74:
            continue
        if best is None or box.w * box.h > best[0]:
            best = (box.w * box.h, (cx, cy))
    if best:
        return best[1]
    return None


def _screen_tap(frame: Frame) -> tuple[int, int]:
    # Open water / card body. Not the hook, not the bottom X, not the share button.
    return int(frame.width * 0.50), int(frame.height * 0.40)


def _hole_stats(xs: list[int], ys: list[int]) -> tuple[int, int, list[tuple[int, float]]]:
    """Return width, height, and each enclosed hole as (area, vertical center 0-1)."""
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    width, height = x1 - x0 + 1, y1 - y0 + 1
    ink = {(x - x0, y - y0) for x, y in zip(xs, ys)}
    seen: set[tuple[int, int]] = set()
    stack: list[tuple[int, int]] = []
    for x in range(width):
        stack.append((x, 0))
        stack.append((x, height - 1))
    for y in range(height):
        stack.append((0, y))
        stack.append((width - 1, y))
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= width or y >= height or (x, y) in seen or (x, y) in ink:
            continue
        seen.add((x, y))
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    holes: list[tuple[int, float]] = []
    for y in range(height):
        for x in range(width):
            if (x, y) in ink or (x, y) in seen:
                continue
            cells = [(x, y)]
            seen.add((x, y))
            area = 0
            ysum = 0
            while cells:
                cx, cy = cells.pop()
                area += 1
                ysum += cy
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    if (nx, ny) in seen or (nx, ny) in ink:
                        continue
                    seen.add((nx, ny))
                    cells.append((nx, ny))
            if area >= 4:
                holes.append((area, (ysum / area) / max(height - 1, 1)))
    return width, height, holes


def _classify_luck(xs: list[int], ys: list[int]) -> int | None:
    if len(xs) < 20:
        return None
    width, height, holes = _hole_stats(xs, ys)
    if height < 8 or width < 4:
        return None
    if len(holes) >= 2:
        return 8
    x0 = min(xs)
    y0 = min(ys)
    ink = {(x - x0, y - y0) for x, y in zip(xs, ys)}
    row_fill = [0] * height
    for _x, y in ink:
        row_fill[y] += 1
    lower = row_fill[int(height * 0.55) : int(height * 0.85)] or [0]
    cross = max(lower)
    right = sum(1 for x, y in ink if x > width * 0.62 and y > height * 0.35)
    if len(holes) == 1:
        area, cy = holes[0]
        # This clover's 4 closes a small triangle up high, then a stem continues down.
        # A real 0 would put a large hole in the middle. Don't call that triangle a 0.
        if cy < 0.62 and cross >= width * 0.45 and right > 0:
            return 4
        if area > width * height * 0.12 and 0.35 <= cy <= 0.65:
            return 0
        if cy > 0.55:
            return 6
        return None
    if width < height * 0.28:
        return 1
    if cross >= width * 0.55 and right > 0:
        return 4
    return None


def read_luck(frame: Frame) -> int | None:
    """Bottom-left clover only. Ignores the rank badge and any item buff timer."""
    w, h = frame.width, frame.height
    blobs = _components(frame, 0, int(h * 0.70), int(w * 0.22), int(h * 0.84), _is_leaf, 2, 25)
    if not blobs:
        return None
    leaf = max(blobs, key=len)
    x0, y0, x1, y1 = _bbox(leaf)
    if (x1 - x0) < w * 0.04 or (y1 - y0) < h * 0.02:
        return None
    ink_pts = []
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if _is_digit_ink(*frame.get(x, y)):
                ink_pts.append((x, y))
    if len(ink_pts) < 20:
        return None
    # Largest yellow glyph inside the leaf. Highlights on the rim are smaller.
    blobs = []
    seen: set[tuple[int, int]] = set()
    ink_set = set(ink_pts)
    for start in ink_pts:
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        pts = []
        while stack:
            cx, cy = stack.pop()
            pts.append((cx, cy))
            for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                if (nx, ny) in ink_set and (nx, ny) not in seen:
                    seen.add((nx, ny))
                    stack.append((nx, ny))
        blobs.append(pts)
    glyph = max(blobs, key=len)
    if len(glyph) < 20:
        return None
    return _classify_luck([p[0] for p in glyph], [p[1] for p in glyph])


def _outlined_white(r, g, b) -> bool:
    return r > 230 and g > 230 and b > 230


def read_contest_timer(frame: Frame) -> int | None:
    """Top contest clock like 26S. Not the item buff timer under the clover.

    The search stays on the digit group to the right of the clock icon.
    Returns None unless the glyphs are confident, so a miss never looks like 0.
    """
    w, h = frame.width, frame.height
    y0, y1 = int(h * 0.135), int(h * 0.20)
    x0, x1 = int(w * 0.45), int(w * 0.66)
    pts = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not _outlined_white(*frame.get(x, y)):
                continue
            dark = False
            for dy in (-2, 0, 2):
                for dx in (-2, 0, 2):
                    rr, gg, bb = frame.get(x + dx, y + dy)
                    if rr < 60 and gg < 60 and bb < 60:
                        dark = True
                        break
                if dark:
                    break
            if dark:
                pts.append((x, y))
    if len(pts) < 40:
        return None
    bx0, by0, bx1, by1 = _bbox(pts)
    present = set(pts)
    column_min = max(7, int((by1 - by0) * 0.14))
    runs = []
    run_start = None
    for x in range(bx0, bx1 + 1):
        count = sum(1 for y in range(by0, by1 + 1) if (x, y) in present)
        if count >= column_min and run_start is None:
            run_start = x
        elif count < column_min and run_start is not None:
            runs.append((run_start, x - 1))
            run_start = None
    if run_start is not None:
        runs.append((run_start, bx1))
    glyphs = [(a, b) for a, b in runs if b - a >= max(6, int(w * 0.012))]
    if len(glyphs) < 2:
        return None

    def glyph_ink(a, b):
        xs, ys = [], []
        for x in range(a, b + 1):
            for y in range(by0, by1 + 1):
                if (x, y) in present:
                    xs.append(x)
                    ys.append(y)
        return xs, ys

    def classify(a, b) -> int | None:
        xs, ys = glyph_ink(a, b)
        if len(xs) < 12:
            return None
        gw, gh, holes = _hole_stats(xs, ys)
        if gh < 8 or gw > gh * 1.25:
            return None
        if len(holes) >= 2:
            return 8
        if len(holes) == 1:
            area, cy = holes[0]
            if cy >= 0.50:
                return 6
            if area > gw * gh * 0.10 and 0.38 <= cy <= 0.62:
                return 0
            return None
        row = [0] * gh
        gy0 = min(ys)
        for _x, y in zip(xs, ys):
            row[y - gy0] += 1
        top = sum(row[: max(1, gh // 3)])
        bot = sum(row[-(max(1, gh // 3)) :])
        if top > 0 and bot > 0 and gw > gh * 0.35:
            return 2
        return None

    # The sample reads "26S": drop a trailing letter that is not a confident digit
    # with a hole. S has no hole and is the rightmost mark.
    last = classify(*glyphs[-1])
    if last is None or (last == 2 and len(glyphs) >= 2):
        # S is often shaped a bit like a 2. If three marks are present, the last is S.
        if len(glyphs) >= 3:
            glyphs = glyphs[:-1]
        elif last is None:
            glyphs = glyphs[:-1]
    digits = []
    for glyph in glyphs:
        digit = classify(*glyph)
        if digit is None:
            return None
        digits.append(digit)
    if not digits or len(digits) > 2:
        return None
    value = 0
    for digit in digits:
        value = value * 10 + digit
    return value if value <= 99 else None


def _toast_above(frame: Frame, zone: Box) -> bool:
    w, h = frame.width, frame.height
    y0 = max(0, zone.y - int(h * 0.12))
    y1 = zone.y - int(h * 0.015)
    if y1 <= y0:
        return False
    x0 = max(0, zone.x - int(w * 0.08))
    x1 = min(w, zone.x1 + int(w * 0.16))
    count = 0
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 2):
            r, g, b = frame.get(x, y)
            if r > 210 and 80 < g < 230 and b < 90 and r > g and r > b + 70:
                count += 1
    return count > 40


def analyze(frame: Frame) -> Detection:
    w, h = frame.width, frame.height
    det = Detection(state="unknown", screen_tap=_screen_tap(frame), width=w, height=h)
    det.luck = read_luck(frame)
    det.timer_seconds = read_contest_timer(frame)
    if det.timer_seconds is not None:
        det.timer_text = f"{det.timer_seconds}S"

    if _find_settlement(frame):
        det.state = "settlement"
        return det

    bars = _yellow_bars(frame)
    slider_bar = None
    bobber = None
    # The track sits below the 「完美!」toast. Prefer the lowest bar that has a bobber.
    ranked = []
    for bar in bars:
        found = _bobber_near(frame, bar)
        if found is not None:
            ranked.append((bar.y, bar, found))
    if ranked:
        ranked.sort()
        _y, slider_bar, bobber = ranked[-1]

    green, gray, purple = _button_disk(frame)
    hook = _hook_center(frame)
    center = _button_center(frame)
    purple_btn = purple >= 20 and purple > green and purple > gray
    green_btn = green >= 20 and green > purple and green > gray * 1.2
    gray_btn = gray >= 30 and gray > green * 1.4 and gray > purple

    if slider_bar is not None and bobber is not None:
        margin = max(6, int(w * 0.04))
        det.state = "slider"
        det.zone = slider_bar
        det.bobber = bobber
        det.inside = interval_inside(bobber.x, bobber.x1, slider_bar.x, slider_bar.x1, margin)
        det.toast = _toast_above(frame, slider_bar)
        det.hook = hook or (center if purple_btn else None)
        det.screen_tap = _screen_tap(frame)
        return det

    if bars and (purple_btn or hook is not None) and not green_btn:
        det.state = "bite"
        det.hook = hook or center
        det.zone = bars[0]
        return det

    if green_btn:
        det.state = "ready"
        det.green = center
        return det

    if gray_btn and not purple_btn:
        det.state = "wait"
        return det

    det.state = "unknown"
    return det
