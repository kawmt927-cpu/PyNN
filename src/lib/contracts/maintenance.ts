/** 维保期跨度折算为年数（用于总额 → 每年额度） */
export function maintenanceYearsBetween(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0;
  }
  // 含首尾日：结束日当天也算一天
  const days = (endMs - startMs) / (24 * 60 * 60 * 1000) + 1;
  return Math.max(days / 365.25, 1 / 365.25);
}

export function suggestAnnualMaintenanceAmount(
  totalAmount: number,
  start: Date,
  end: Date
): number {
  const years = maintenanceYearsBetween(start, end);
  if (years <= 0 || !Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  return Math.round((totalAmount / years) * 100) / 100;
}

/** 两段 [from,to] 是否有重叠（含首尾） */
export function rangesOverlapInclusive(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

/** @deprecated 保留给旧调用；新统计不再按天折算 */
export function overlapDaysInclusive(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  if (end < start) return 0;
  return (end - start) / (24 * 60 * 60 * 1000) + 1;
}

/** @deprecated 运营维保总额已改为整年额计入，不再按重叠天数折算 */
export function maintenanceContributionInPeriod(input: {
  annualAmount: number;
  maintenanceStart: Date;
  maintenanceEnd: Date;
  periodFrom: Date;
  periodTo: Date;
}): number {
  if (!Number.isFinite(input.annualAmount) || input.annualAmount <= 0) return 0;
  if (
    !rangesOverlapInclusive(
      input.maintenanceStart,
      input.maintenanceEnd,
      input.periodFrom,
      input.periodTo
    )
  ) {
    return 0;
  }
  return Math.round(input.annualAmount * 100) / 100;
}

export type MaintenanceStatCandidate = {
  id: string;
  endUserCustomerId: string | null;
  signCustomerId: string;
  maintenanceStartAt: Date;
  maintenanceEndAt: Date;
  annualMaintenanceAmount: number;
  /** 合同已回款合计 */
  paidAmount: number;
  /** 合同总额（用于判断是否已结清） */
  totalAmount: number;
};

/**
 * 统计区间内的维保合同：
 * - 服务期与统计年有重叠
 * - 回款未结清（已回 < 合同额）
 * - 同一最终用户（无则签约客户）若多份服务期彼此重叠（续期），只保留服务开始更晚的一份
 * - 计入金额 = 年额全额（不按天数折算）
 */
export function selectMaintenanceContractsForPeriod(input: {
  candidates: MaintenanceStatCandidate[];
  periodFrom: Date;
  periodTo: Date;
}): Array<MaintenanceStatCandidate & { contributionAmount: number }> {
  const overlapping = input.candidates.filter((row) => {
    if (row.annualMaintenanceAmount <= 0) return false;
    if (row.paidAmount >= row.totalAmount - 0.01) return false; // 已结清
    return rangesOverlapInclusive(
      row.maintenanceStartAt,
      row.maintenanceEndAt,
      input.periodFrom,
      input.periodTo
    );
  });

  // 按客户分组，组内对服务期重叠的续期只留最新一份
  const byCustomer = new Map<string, MaintenanceStatCandidate[]>();
  for (const row of overlapping) {
    const key = row.endUserCustomerId || `sign:${row.signCustomerId}`;
    const list = byCustomer.get(key) ?? [];
    list.push(row);
    byCustomer.set(key, list);
  }

  const selected: MaintenanceStatCandidate[] = [];
  for (const group of byCustomer.values()) {
    const sorted = [...group].sort(
      (a, b) => b.maintenanceStartAt.getTime() - a.maintenanceStartAt.getTime()
    );
    const kept: MaintenanceStatCandidate[] = [];
    for (const row of sorted) {
      const overlapsKept = kept.some((other) =>
        rangesOverlapInclusive(
          row.maintenanceStartAt,
          row.maintenanceEndAt,
          other.maintenanceStartAt,
          other.maintenanceEndAt
        )
      );
      if (!overlapsKept) kept.push(row);
    }
    selected.push(...kept);
  }

  return selected
    .map((row) => ({
      ...row,
      contributionAmount: Math.round(row.annualMaintenanceAmount * 100) / 100,
    }))
    .sort((a, b) => b.contributionAmount - a.contributionAmount);
}
