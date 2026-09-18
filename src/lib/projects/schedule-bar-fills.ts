/** 排班条按日份额 → 连续色带（周末在两侧份额相同时桥接） */

export type DayFill = { dateKey: string; share: number };

export type FillRun = {
  dateKey: string;
  share: number;
  dayCount: number;
  labelShare: number;
};

export function fillHeightPct(share: number): number {
  return Math.max(share * 100, share > 0 ? 6 : 0);
}

export function dayFillCornerClass(
  heightPct: number,
  prevHeightPct: number | null,
  nextHeightPct: number | null
): string {
  const roundTl = prevHeightPct == null || heightPct > prevHeightPct;
  const roundTr = nextHeightPct == null || heightPct > nextHeightPct;
  const roundBl = prevHeightPct == null;
  const roundBr = nextHeightPct == null;
  return [
    roundTl ? "rounded-tl" : "",
    roundTr ? "rounded-tr" : "",
    roundBl ? "rounded-bl" : "",
    roundBr ? "rounded-br" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * 将按日份额合并为连续色带：同份额相邻日合成一段；
 * 周末 0 在两侧工作日份额相同时桥接，避免「一天一块」观感（成本仍只计工作日）。
 */
export function coalesceFillRuns(fills: DayFill[]): FillRun[] {
  if (fills.length === 0) return [];

  const visualShares = fills.map((f) => f.share);
  for (let i = 0; i < fills.length; i++) {
    if (visualShares[i] > 0) continue;
    let prev = i - 1;
    while (prev >= 0 && visualShares[prev] === 0) prev -= 1;
    let next = i + 1;
    while (next < fills.length && visualShares[next] === 0) next += 1;
    const prevShare = prev >= 0 ? visualShares[prev] : null;
    const nextShare = next < fills.length ? visualShares[next] : null;
    if (prevShare != null && nextShare != null && prevShare === nextShare && prevShare > 0) {
      visualShares[i] = prevShare;
    } else if (prevShare != null && nextShare == null && prevShare > 0) {
      visualShares[i] = prevShare;
    } else if (nextShare != null && prevShare == null && nextShare > 0) {
      visualShares[i] = nextShare;
    }
  }

  const runs: FillRun[] = [];
  for (let i = 0; i < fills.length; i++) {
    const share = visualShares[i];
    const labelShare = fills[i].share;
    const last = runs[runs.length - 1];
    if (last && last.share === share) {
      last.dayCount += 1;
      if (labelShare > 0) last.labelShare = labelShare;
    } else {
      runs.push({
        dateKey: fills[i].dateKey,
        share,
        dayCount: 1,
        labelShare,
      });
    }
  }
  return runs;
}
