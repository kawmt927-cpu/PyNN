import { UserRole } from "@prisma/client";

export const ROLE_LABELS: Record<UserRole, string> = {
  SALES: "销售",
  SALES_MANAGER: "销售管理",
  PROJECT_ADMIN: "项目管理员",
  PROJECT_MANAGER: "项目经理",
  PROJECT_STAFF: "项目人员",
  ADMIN: "管理员",
};

export const CUSTOMER_CATEGORY_LABELS = {
  HOSPITAL: "医院",
  COMPANY: "公司",
  INDIVIDUAL: "个人",
} as const;

export const HOSPITAL_LEVEL_LABELS = {
  GRADE_3A: "三甲",
  GRADE_3B: "三乙",
  GRADE_3: "三级",
  GRADE_2A: "二甲",
  GRADE_2B: "二乙",
  GRADE_2: "二级",
  OTHER: "其他",
} as const;

export const FOLLOW_UP_METHOD_LABELS = {
  PHONE: "电话",
  WECHAT: "微信",
  FACE_VISIT: "面访",
  ONLINE_MEETING: "线上会议",
  OTHER: "其他",
} as const;

export const CONTACT_ROLE_LABELS = {
  DECISION_MAKER: "决策人",
  TECHNICAL: "技术对接人",
  OTHER: "其他",
} as const;

export const CUSTOMER_CLAIM_STATUS_LABELS = {
  PENDING: "待审批",
  APPROVED: "已同意",
  REJECTED: "已拒绝",
} as const;

export const CONTRACT_STATUS_LABELS = {
  PENDING_SIGN: "待签署",
  SIGNED_PENDING_IMPL: "已签署待实施",
  IMPLEMENTING: "实施中",
  ACCEPTED: "已验收",
  MAINTAINING: "维保中",
  TERMINATED: "已终止",
} as const;

export type NavItem = {
  href: string;
  label: string;
  roles: UserRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "仪表盘", roles: ["SALES", "SALES_MANAGER", "PROJECT_ADMIN", "PROJECT_MANAGER", "PROJECT_STAFF", "ADMIN"] },
  { href: "/customers", label: "客户", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  { href: "/approvals", label: "审批", roles: ["SALES_MANAGER", "ADMIN"] },
  { href: "/follow-ups", label: "待跟进", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  { href: "/contracts", label: "合同", roles: ["SALES", "SALES_MANAGER", "PROJECT_MANAGER", "ADMIN"] },
  { href: "/mobile/log", label: "销售日志", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  { href: "/projects", label: "项目", roles: ["PROJECT_ADMIN", "PROJECT_MANAGER", "PROJECT_STAFF", "ADMIN"] },
  { href: "/my-tasks", label: "我的任务", roles: ["PROJECT_MANAGER", "PROJECT_STAFF", "ADMIN"] },
  { href: "/personnel", label: "实施人员", roles: ["PROJECT_ADMIN", "ADMIN"] },
  { href: "/sales-personnel", label: "销售人员", roles: ["SALES_MANAGER", "ADMIN"] },
  { href: "/sales-costs", label: "销售成本", roles: ["SALES_MANAGER", "ADMIN"] },
  { href: "/admin/settings", label: "系统配置", roles: ["ADMIN"] },
];

export function getNavForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function canAccess(role: UserRole, resource: string, action: string): boolean {
  if (role === "ADMIN") return true;
  // MVP: coarse role-based; full PermissionRule table later
  const matrix: Partial<Record<UserRole, string[]>> = {
    SALES: ["customers:own", "followups:own", "contracts:own", "mobile-log:own"],
    SALES_MANAGER: ["customers:all", "followups:all", "contracts:all", "sales-costs:all", "sales-personnel:all"],
    PROJECT_ADMIN: ["projects:all", "personnel:all", "presales-assignments:all"],
    PROJECT_MANAGER: ["projects:assigned", "tasks:assigned", "contracts:read"],
    PROJECT_STAFF: ["tasks:own", "projects:assigned"],
  };
  const perms = matrix[role] ?? [];
  const key = `${resource}:${action}`;
  return perms.some((p) => p === key || p.endsWith(":all"));
}
