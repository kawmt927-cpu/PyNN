/** 合同开票金额汇总与按税率分组 */

export function sumInvoiceRecords(records: { amount: number | { toString(): string } }[]) {
  return records.reduce((sum, row) => sum + Number(row.amount), 0);
}

export type InvoiceTaxRateGroup = {
  taxRatePercent: number;
  amount: number;
  count: number;
};

/** 按税率分组合计（税率保留合理精度做 key） */
export function groupInvoiceAmountsByTaxRate(
  records: Array<{ amount: number | { toString(): string }; taxRatePercent: number | { toString(): string } }>
): InvoiceTaxRateGroup[] {
  const map = new Map<string, InvoiceTaxRateGroup>();
  for (const row of records) {
    const rate = Number(row.taxRatePercent);
    const amount = Number(row.amount);
    const key = Number.isFinite(rate) ? String(rate) : "0";
    const existing = map.get(key);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      map.set(key, { taxRatePercent: rate, amount, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => a.taxRatePercent - b.taxRatePercent);
}

export function formatTaxRateLabel(taxRatePercent: number) {
  const n = Number(taxRatePercent);
  if (!Number.isFinite(n)) return "—";
  const text = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
  return `${text} 个点`;
}
