import { UserRole } from "@prisma/client";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";

export const ROLE_LABELS: Record<UserRole, string> = {
  SALES: "销售",
  SALES_MANAGER: "销售管理",
  PROJECT_ADMIN: "项目管理员",
  PROJECT_MANAGER: "项目经理",
  PROJECT_STAFF: "项目人员",
  ADMIN: "管理员",
  HR: "行政人事",
};

/** 管理权限由高到低（数值越小权限越高），用于用户列表等排序 */
export const ROLE_PRIVILEGE_RANK: Record<UserRole, number> = {
  ADMIN: 0,
  SALES_MANAGER: 1,
  PROJECT_ADMIN: 2,
  PROJECT_MANAGER: 3,
  SALES: 4,
  PROJECT_STAFF: 5,
  HR: 6,
};

/** 编辑用户 / 开通审批时展示的角色说明 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SALES:
    "今日工作、日报、计划与任务、客户、商机、待跟进、合同（本人数据；可提审合同）、报销。",
  SALES_MANAGER:
    "销售侧全部数据与审批、销售人员、销售成本、报销；可编辑/审批合同；系统配置中的销售相关项。",
  PROJECT_ADMIN: "项目、资源排班、实施人员、报销；系统配置中的项目相关项。",
  PROJECT_MANAGER: "项目与排班、我的任务、报销；合同只读查阅；系统配置中的项目相关项。",
  PROJECT_STAFF: "项目、我的任务、报销。",
  ADMIN: "全部模块，含用户管理、完整系统配置与报销终审打款。",
  HR: "行政人事：工作台、报销发起与终审打款，以及差旅住宿标准配置。",
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
  PENDING_APPROVAL: "待审核",
  REJECTED: "已驳回",
  PENDING_SIGN: "待签署",
  SIGNED_PENDING_IMPL: "已签署待实施",
  IMPLEMENTING: "实施中",
  ACCEPTED: "已验收",
  MAINTAINING: "维保中",
  TERMINATED: "已终止",
} as const;

/** 合同列表/筛选可见状态（不含已驳回；驳回单仅通知发起人） */
export const CONTRACT_LIST_STATUS_LABELS = Object.fromEntries(
  Object.entries(CONTRACT_STATUS_LABELS).filter(([key]) => key !== "REJECTED")
) as Record<Exclude<keyof typeof CONTRACT_STATUS_LABELS, "REJECTED">, string>;

export type ContractListStatus = keyof typeof CONTRACT_LIST_STATUS_LABELS;

export const OPPORTUNITY_STATUS_LABELS = {
  NOT_SIGNED: "未签约",
  SIGNED: "已签约",
  ABANDONED: "已放弃",
} as const;

export const SIGNING_TYPE_LABELS = {
  DIRECT: "直签",
  INDIRECT: "间接签约",
} as const;

export type NavItem = {
  href: string;
  label: string;
  roles: UserRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/today-work", label: "今日工作", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  { href: "/daily-reports", label: "日报管理", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  { href: "/plans-tasks", label: "计划与任务", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  { href: "/customers", label: "客户", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  { href: "/opportunities", label: "商机", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  {
    href: "/approvals",
    label: "审批",
    roles: ["SALES", "SALES_MANAGER", "PROJECT_ADMIN", "PROJECT_MANAGER", "PROJECT_STAFF", "ADMIN", "HR"],
  },
  {
    href: "/notifications",
    label: "通知",
    roles: ["SALES", "SALES_MANAGER", "PROJECT_ADMIN", "ADMIN"],
  },
  { href: "/follow-ups", label: "待跟进", roles: ["SALES", "SALES_MANAGER", "ADMIN"] },
  { href: "/contracts", label: "合同", roles: ["SALES", "SALES_MANAGER", "PROJECT_MANAGER", "ADMIN"] },
  {
    href: "/contracts/external-costs",
    label: "外部成本",
    roles: ["SALES", "SALES_MANAGER", "PROJECT_MANAGER", "ADMIN"],
  },
  {
    href: "/expenses",
    label: "报销",
    roles: ["SALES", "SALES_MANAGER", "PROJECT_ADMIN", "PROJECT_MANAGER", "PROJECT_STAFF", "ADMIN", "HR"],
  },
  { href: "/projects", label: "项目", roles: ["PROJECT_ADMIN", "PROJECT_MANAGER", "PROJECT_STAFF", "ADMIN"] },
  { href: "/projects/schedule", label: "资源排班", roles: ["PROJECT_ADMIN", "PROJECT_MANAGER", "ADMIN"] },
  { href: "/my-tasks", label: "我的任务", roles: ["PROJECT_MANAGER", "PROJECT_STAFF", "ADMIN"] },
  { href: "/personnel", label: "实施人员", roles: ["PROJECT_ADMIN", "ADMIN"] },
  { href: "/sales-personnel", label: "销售人员", roles: ["SALES_MANAGER", "ADMIN"] },
  { href: "/sales-costs", label: "销售成本", roles: ["SALES_MANAGER", "ADMIN"] },
  { href: "/admin/users", label: "用户管理", roles: ["ADMIN"] },
  { href: "/admin/settings", label: "系统配置", roles: ["ADMIN", "SALES_MANAGER", "PROJECT_ADMIN", "PROJECT_MANAGER", "HR"] },
  { href: "/hr", label: "工作台", roles: ["HR"] },
];

export function getNavForRole(role: UserRole): NavItem[] {
  const expenseOn = isExpenseFeatureEnabled();
  return NAV_ITEMS.filter((item) => {
    if (!expenseOn && item.href === "/expenses") return false;
    return item.roles.includes(role);
  });
}

/** 登录后默认首页：该角色侧栏第一项 */
export function getDefaultHomeForRole(role: UserRole): string {
  return getNavForRole(role)[0]?.href ?? "/login";
}

export function canAccess(role: UserRole, resource: string, action: string): boolean {
  if (role === "ADMIN") return true;
  // MVP: coarse role-based; full PermissionRule table later
  const matrix: Partial<Record<UserRole, string[]>> = {
    SALES: ["customers:own", "followups:own", "opportunities:own", "contracts:own", "mobile-log:own"],
    SALES_MANAGER: ["customers:all", "followups:all", "opportunities:all", "contracts:all", "sales-costs:all", "sales-personnel:all", "settings:sales"],
    PROJECT_ADMIN: ["projects:all", "personnel:all", "presales-assignments:all", "settings:project"],
    PROJECT_MANAGER: ["projects:assigned", "tasks:assigned", "contracts:read", "settings:project"],
    PROJECT_STAFF: ["tasks:own", "projects:assigned"],
    HR: ["hr:home", "expenses:finance"],
  };
  const perms = matrix[role] ?? [];
  const key = `${resource}:${action}`;
  return perms.some((p) => p === key || p.endsWith(":all"));
}
