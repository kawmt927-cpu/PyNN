import { UserRole } from "@prisma/client";
import { ROLE_LABELS } from "./permissions";

export type DemoAccount = {
  role: UserRole;
  label: string;
  phone: string;
  password: string;
};

/** 公司正式环境：仅保留管理员快捷入口（与 import-company-roster 临时账密一致） */
export const SALES_QUICK_LOGIN: Array<{ label: string; phone: string; password: string }> = [];

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: "ADMIN",
    label: `${ROLE_LABELS.ADMIN}（万嘉南）`,
    phone: "13900000002",
    password: "admin123",
  },
  {
    role: "ADMIN",
    label: `${ROLE_LABELS.ADMIN}（张潇笑）`,
    phone: "13900000001",
    password: "admin123",
  },
];

export function isDemoLoginEnabled() {
  return process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_LOGIN === "true";
}
