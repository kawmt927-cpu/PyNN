export type InstallmentPlanRow = {
  id: string;
  periodNumber: number;
  amount: number;
  condition?: string | null;
  dueAt?: Date | string | null;
};

export type InstallmentWaterfallRow = InstallmentPlanRow & {
  allocatedAmount: number;
  percentComplete: number;
  statusLabel: "未开始" | "进行中" | "已完成";
};

export function allocatePaymentsWaterfall(
  totalPaid: number,
  installments: InstallmentPlanRow[]
): InstallmentWaterfallRow[] {
  const sorted = [...installments].sort((a, b) => a.periodNumber - b.periodNumber);
  let remaining = Math.max(0, totalPaid);

  return sorted.map((row) => {
    const planned = row.amount;
    const allocated = Math.min(remaining, planned);
    remaining = Math.max(0, remaining - allocated);
    const percentComplete = planned > 0 ? Math.min(100, (allocated / planned) * 100) : 0;

    let statusLabel: InstallmentWaterfallRow["statusLabel"] = "未开始";
    if (percentComplete >= 100) statusLabel = "已完成";
    else if (percentComplete > 0) statusLabel = "进行中";

    return {
      ...row,
      allocatedAmount: allocated,
      percentComplete,
      statusLabel,
    };
  });
}

export function sumPaymentRecords(
  records: Array<{ amount: number | { toString(): string } }>
): number {
  return records.reduce((sum, row) => sum + Number(row.amount), 0);
}
