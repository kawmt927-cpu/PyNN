/**
 * 行程日期规则：
 * 1. 每段出发日期不得晚于到达日期（允许同一天）
 * 2. 各段日期区间不可重叠（含端点同日）
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type TripDateRangeInput = {
  startDate: string;
  endDate: string;
};

export type TripDateRowIssue = {
  /** 出发晚于到达 */
  inverted: boolean;
  /** 与之重叠的其它段（1-based 序号） */
  overlapWith: number[];
};

export type TripDateValidationResult = {
  /** 按输入顺序的逐段问题；未填齐日期的段为空问题 */
  rowIssues: TripDateRowIssue[];
  /** 保存用总错误（取第一条） */
  error: string | null;
  /** 是否存在任一日期问题（倒置或重叠） */
  hasDateProblems: boolean;
};

export function isYmd(value: string): boolean {
  return YMD_RE.test(String(value ?? "").trim());
}

/** 两段闭区间是否重叠（YYYY-MM-DD 字符串可直接比较） */
export function tripDateRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function effectiveEnd(start: string, end: string): string {
  const e = end.trim();
  return e || start.trim();
}

/**
 * 校验多段行程日期。只检查已填齐且格式正确的段；缺日期不在此报（由调用方补齐提示）。
 */
export function validateTripDateRanges(
  rows: TripDateRangeInput[]
): TripDateValidationResult {
  const rowIssues: TripDateRowIssue[] = rows.map(() => ({
    inverted: false,
    overlapWith: [],
  }));

  const ready: Array<{ index: number; start: string; end: string }> = [];
  for (let i = 0; i < rows.length; i++) {
    const start = String(rows[i]?.startDate ?? "").trim();
    const end = effectiveEnd(start, String(rows[i]?.endDate ?? ""));
    if (!start || !isYmd(start) || !isYmd(end)) continue;
    if (end < start) {
      rowIssues[i]!.inverted = true;
      continue;
    }
    ready.push({ index: i, start, end });
  }

  for (let a = 0; a < ready.length; a++) {
    for (let b = a + 1; b < ready.length; b++) {
      const left = ready[a]!;
      const right = ready[b]!;
      if (tripDateRangesOverlap(left.start, left.end, right.start, right.end)) {
        rowIssues[left.index]!.overlapWith.push(right.index + 1);
        rowIssues[right.index]!.overlapWith.push(left.index + 1);
      }
    }
  }

  let error: string | null = null;
  for (let i = 0; i < rowIssues.length; i++) {
    const issue = rowIssues[i]!;
    if (issue.inverted) {
      error = `第 ${i + 1} 段出发日期不能晚于到达日期`;
      break;
    }
    if (issue.overlapWith.length > 0) {
      const others = [...new Set(issue.overlapWith)].sort((x, y) => x - y);
      error = `第 ${i + 1} 段与第 ${others.join("、")} 段日期重叠，请调整后再保存`;
      break;
    }
  }

  const hasDateProblems = rowIssues.some(
    (r) => r.inverted || r.overlapWith.length > 0
  );

  return { rowIssues, error, hasDateProblems };
}

export function tripRowDateHint(issue: TripDateRowIssue): string | null {
  if (issue.inverted) return "出发日期不能晚于到达日期";
  if (issue.overlapWith.length > 0) {
    const others = [...new Set(issue.overlapWith)].sort((x, y) => x - y);
    return `与第 ${others.join("、")} 段日期重叠`;
  }
  return null;
}
