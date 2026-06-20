import { z } from "zod";

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function toExpectedCloseMonthInput(value: Date | string) {
  const d = new Date(value);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatExpectedCloseMonth(value: Date | string) {
  return toExpectedCloseMonthInput(value);
}

export function parseExpectedCloseMonth(value: string) {
  const trimmed = value.trim();
  const match =
    MONTH_PATTERN.exec(trimmed) ?? MONTH_PATTERN.exec(toExpectedCloseMonthInput(trimmed));
  if (!match) {
    throw new Error("请选择预计签约月份");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error("请选择有效的预计签约月份");
  }
  return new Date(year, month - 1, 1);
}

export const expectedCloseMonthSchema = z
  .string()
  .min(1, "请选择预计签约月份")
  .regex(MONTH_PATTERN, "请选择预计签约月份");
