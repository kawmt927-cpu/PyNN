import { UserRole } from "@prisma/client";
import { ROLE_LABELS } from "./permissions";

export type DemoAccount = {
  role: UserRole;
  label: string;
  email: string;
  password: string;
};

/** 与 prisma/seed.ts 默认账号一致，仅供开发测试快捷登录 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "ADMIN", label: ROLE_LABELS.ADMIN, email: "admin@example.com", password: "admin123" },
  {
    role: "SALES_MANAGER",
    label: ROLE_LABELS.SALES_MANAGER,
    email: "salesmgr@example.com",
    password: "sales123",
  },
  { role: "SALES", label: ROLE_LABELS.SALES, email: "sales@example.com", password: "sales123" },
  {
    role: "PROJECT_ADMIN",
    label: ROLE_LABELS.PROJECT_ADMIN,
    email: "projadmin@example.com",
    password: "proj123",
  },
  {
    role: "PROJECT_MANAGER",
    label: ROLE_LABELS.PROJECT_MANAGER,
    email: "pm@example.com",
    password: "proj123",
  },
  {
    role: "PROJECT_STAFF",
    label: ROLE_LABELS.PROJECT_STAFF,
    email: "staff@example.com",
    password: "proj123",
  },
];

export function isDemoLoginEnabled() {
  return process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_LOGIN === "true";
}
