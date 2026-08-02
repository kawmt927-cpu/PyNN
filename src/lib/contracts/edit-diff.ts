/** 合同编辑时：判断产品行 / 回款计划是否相对库内发生实质变更 */

type MoneyLike = number | string | { toString(): string };

function asMoney(value: MoneyLike): number {
  if (typeof value === "number") return value;
  return Number(value);
}

function moneyEq(a: MoneyLike, b: MoneyLike) {
  return Math.abs(asMoney(a) - asMoney(b)) <= 0.01;
}

function textEq(a?: string | null, b?: string | null) {
  return (a?.trim() || "") === (b?.trim() || "");
}

function dateKey(value?: Date | string | null) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type ComparableExternalInstallment = {
  periodNumber: number;
  amount: MoneyLike;
  condition?: string | null;
  dueAt?: Date | string | null;
};

export type ComparableContractProduct = {
  productName: string;
  description?: string | null;
  costType: "INTERNAL" | "EXTERNAL" | string;
  costAmount: MoneyLike;
  productServiceId?: string | null;
  externalInstallments?: ComparableExternalInstallment[];
};

export type ComparablePaymentInstallment = {
  periodNumber: number;
  amount: MoneyLike;
  condition?: string | null;
  dueAt?: Date | string | null;
};

function normalizeExternalInstallments(rows: ComparableExternalInstallment[] = []) {
  return [...rows]
    .map((row) => ({
      periodNumber: row.periodNumber,
      amount: Number(asMoney(row.amount).toFixed(2)),
      condition: row.condition?.trim() || "",
      dueAt: dateKey(row.dueAt),
    }))
    .sort((a, b) => a.periodNumber - b.periodNumber);
}

function normalizeProducts(rows: ComparableContractProduct[]) {
  return [...rows]
    .map((row) => ({
      productName: row.productName.trim(),
      description: row.description?.trim() || "",
      costType: row.costType === "EXTERNAL" ? "EXTERNAL" : "INTERNAL",
      costAmount: Number(asMoney(row.costAmount).toFixed(2)),
      productServiceId: row.productServiceId?.trim() || "",
      externalInstallments: normalizeExternalInstallments(row.externalInstallments),
    }))
    .sort((a, b) => {
      const keyA = `${a.costType}|${a.productName}|${a.costAmount}`;
      const keyB = `${b.costType}|${b.productName}|${b.costAmount}`;
      return keyA.localeCompare(keyB, "zh-CN");
    });
}

function normalizePaymentInstallments(rows: ComparablePaymentInstallment[]) {
  return [...rows]
    .map((row) => ({
      periodNumber: row.periodNumber,
      amount: Number(asMoney(row.amount).toFixed(2)),
      condition: row.condition?.trim() || "",
      dueAt: dateKey(row.dueAt),
    }))
    .sort((a, b) => a.periodNumber - b.periodNumber);
}

export function contractProductsChanged(
  existing: ComparableContractProduct[],
  next: ComparableContractProduct[]
) {
  return (
    JSON.stringify(normalizeProducts(existing)) !==
    JSON.stringify(normalizeProducts(next))
  );
}

export function paymentInstallmentsChanged(
  existing: ComparablePaymentInstallment[],
  next: ComparablePaymentInstallment[]
) {
  return (
    JSON.stringify(normalizePaymentInstallments(existing)) !==
    JSON.stringify(normalizePaymentInstallments(next))
  );
}

export function moneyEquals(a: MoneyLike, b: MoneyLike) {
  return moneyEq(a, b);
}

export function textEquals(a?: string | null, b?: string | null) {
  return textEq(a, b);
}
