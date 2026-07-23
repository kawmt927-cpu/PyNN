import { z } from "zod";

/** 大陆手机号：1 开头 11 位 */
export const CN_MOBILE_REGEX = /^1[3-9]\d{9}$/;

export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s-]/g, "");
}

export function isValidCnMobile(phone: string): boolean {
  return CN_MOBILE_REGEX.test(normalizePhone(phone));
}

export const phoneSchema = z
  .string()
  .min(1, "请输入手机号")
  .transform(normalizePhone)
  .refine(isValidCnMobile, { message: "请输入有效的 11 位手机号" });
