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

/** 本次登记后累计回款不得超过合同金额（允许 0.01 元浮点误差） */
export function getContractPaymentRemaining(totalAmount: number, totalPaid: number) {
  return Math.max(0, totalAmount - totalPaid);
}

export function validateContractPaymentAmount(
  totalAmount: number,
  totalPaid: number,
  addAmount: number
): string | null {
  if (!Number.isFinite(addAmount) || addAmount <= 0) {
    return "回款金额须大于 0";
  }
  const remaining = getContractPaymentRemaining(totalAmount, totalPaid);
  if (addAmount > remaining + 0.01) {
    return `回款总额不能超过合同金额 ${totalAmount.toFixed(2)} 元，当前已登记 ${totalPaid.toFixed(2)} 元，最多还可登记 ${remaining.toFixed(2)} 元`;
  }
  return null;
}
