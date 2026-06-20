/** 外勤日志场景的往来方式（四选一） */
export const SALES_LOG_METHODS = ["PHONE", "WECHAT", "FACE_VISIT", "OTHER"] as const;

export type SalesLogMethod = (typeof SALES_LOG_METHODS)[number];

export const SALES_LOG_METHOD_OPTIONS: Array<{ value: SalesLogMethod; label: string }> = [
  { value: "PHONE", label: "电话沟通" },
  { value: "WECHAT", label: "微信沟通" },
  { value: "FACE_VISIT", label: "客户面访" },
  { value: "OTHER", label: "其他" },
];

export const SALES_LOG_METHOD_LABELS: Record<SalesLogMethod, string> = {
  PHONE: "电话沟通",
  WECHAT: "微信沟通",
  FACE_VISIT: "客户面访",
  OTHER: "其他",
};

export function isSalesLogMethod(value: string): value is SalesLogMethod {
  return (SALES_LOG_METHODS as readonly string[]).includes(value);
}

export function salesLogMethodLabel(method: string): string {
  if (isSalesLogMethod(method)) return SALES_LOG_METHOD_LABELS[method];
  return method;
}
