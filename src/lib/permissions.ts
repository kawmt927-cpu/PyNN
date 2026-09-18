import { UserRole } from "@prisma/client";
import {
  getDefaultHomeFromPrimary,
  resolvePrimaryNav,
  toNavItems,
  type NavItem,
} from "@/lib/nav/primary-nav";

export type { NavItem };

export const ROLE_LABELS: Record<UserRole, string> = {
  SALES: "销售",
  SALES_MANAGER: "销售管理",
  PROJECT_ADMIN: "项目管理员",
  PROJECT_MANAGER: "项目经理",
  PROJECT_STAFF: "项目人员",
  ADMIN: "管理员",
  HR: "行政人事",
  OTHER: "其他",
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
  OTHER: 7,
};

/** 编辑用户 / 开通审批时展示的角色说明 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SALES:
    "今日工作、日报、计划与任务、客户、商机、待跟进、合同（本人数据；可提审合同）。",
  SALES_MANAGER:
    "销售侧全部数据与销售类审批（认领/代录确认/合同审核）、销售人员与成本、报销入口与上级审批；系统配置中的销售相关项。",
  PROJECT_ADMIN:
    "项目全局管理与项目类审批、资源排班、实施人员类型、报销入口与上级审批；系统配置中的项目相关项。",
  PROJECT_MANAGER:
    "暂与项目人员同权：项目、计划与任务（项目任务）。后续可再单独放开排班/合同/报销等。",
  PROJECT_STAFF: "项目、计划与任务（项目任务）。",
  ADMIN:
    "全部模块；销售/项目类审批；报销入口与终审打款；用户与角色权限、功能开关等系统配置。",
  HR: "行政人事：员工档案与证件、人员成本、报销行政确认（无报销入口时仍可在审批中心处理）、差旅住宿标准配置。",
  OTHER: "无业务模块权限；仅纳入人员成本（日单价/月成本）核算，可登录查看账号说明。",
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

export const CONTRACT_BUSINESS_TYPE_LABELS = {
  NEW_PROJECT: "新建项目",
  SECONDARY_PROJECT: "二次项目",
  MAINTENANCE: "维保项目",
} as const;

/**
 * 侧栏导航（同步）：默认矩阵；Edge/middleware 可用。
 * Dashboard 布局请用 getNavForRoleAsync，以读取库中配置。
 */
export function getNavForRole(role: UserRole): NavItem[] {
  return toNavItems(resolvePrimaryNav(role));
}

/** 登录后默认首页：该角色侧栏第一项（默认矩阵，供 middleware 等） */
export function getDefaultHomeForRole(role: UserRole): string {
  return getDefaultHomeFromPrimary(role);
}

/** @deprecated 请用 RolePermission / hasPermission */
export function canAccess(role: UserRole, resource: string, action: string): boolean {
  if (role === "ADMIN") return true;
  const matrix: Partial<Record<UserRole, string[]>> = {
    SALES: ["customers:own", "followups:own", "opportunities:own", "contracts:own", "mobile-log:own"],
    SALES_MANAGER: [
      "customers:all",
      "followups:all",
      "opportunities:all",
      "contracts:all",
      "sales-costs:all",
      "sales-personnel:all",
      "settings:sales",
    ],
    PROJECT_ADMIN: ["projects:all", "personnel:info", "presales-assignments:all", "settings:project"],
    PROJECT_MANAGER: ["projects:assigned", "tasks:assigned", "contracts:read", "settings:project"],
    PROJECT_STAFF: ["tasks:own", "projects:assigned"],
    HR: ["hr:home", "hr:employees", "personnel:costs", "expenses:finance"],
  };
  const perms = matrix[role] ?? [];
  const key = `${resource}:${action}`;
  return perms.some((p) => p === key || p.endsWith(":all"));
}
