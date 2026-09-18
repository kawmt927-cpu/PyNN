import type { UserRole } from "@prisma/client";
import type { PermissionKey } from "@/lib/rbac/permission-keys";
import { defaultPermissionEnabled } from "@/lib/rbac/permission-keys";
import { isExpenseFeatureEnabled } from "@/lib/expenses/feature-flag";

/** 侧栏逻辑分组（仅作默认排序参考，界面不再展示分组标题） */
export type NavGroupId =
  | "work"
  | "deal"
  | "collab"
  | "cost"
  | "manage"
  | "other";

export type HubTab = {
  id: string;
  label: string;
  href: string;
  /** 任一权限满足即可看到该 Tab */
  permissions: PermissionKey[];
};

export type PrimaryNavItem = {
  id: string;
  label: string;
  /** 侧栏点击进入的默认地址（通常为第一个可见子 Tab） */
  href: string;
  group: NavGroupId;
  /** 拥有任一权限则显示该一级入口 */
  permissions: PermissionKey[];
  /** 用于高亮：pathname 匹配这些前缀时激活本项 */
  matchPrefixes: string[];
  /** 侧栏二级菜单；空或仅 1 项则一级直达 */
  tabs?: HubTab[];
  /** 角标类型；inbox = 审批或通知任一有未读 */
  badge?: "approvals" | "notifications" | "inbox";
};

/**
 * 合并后的一级侧栏。
 * 子能力仍走原路由，仅收敛入口。
 */
export const PRIMARY_NAV: PrimaryNavItem[] = [
  {
    id: "insights",
    label: "经营洞察",
    href: "/insights",
    group: "manage",
    permissions: ["nav.admin_ops", "nav.admin_map", "nav.admin_stats"],
    matchPrefixes: ["/insights", "/admin/ops", "/admin/map", "/admin/stats", "/admin/sales-monthly"],
    tabs: [
      { id: "ops", label: "运营看板", href: "/admin/ops", permissions: ["nav.admin_ops"] },
      { id: "map", label: "地图看板", href: "/admin/map", permissions: ["nav.admin_map"] },
      {
        id: "stats",
        label: "统计管理",
        href: "/admin/stats",
        permissions: ["nav.admin_stats"],
      },
      {
        id: "sales-monthly",
        label: "销售月报",
        href: "/admin/sales-monthly",
        permissions: ["nav.admin_stats"],
      },
    ],
  },
  {
    id: "work",
    label: "工作台",
    href: "/work",
    group: "work",
    permissions: [
      "nav.today_work",
      "nav.follow_ups",
      "nav.plans_tasks",
      "nav.daily_reports",
    ],
    matchPrefixes: ["/today-work", "/follow-ups", "/plans-tasks", "/daily-reports", "/work"],
    tabs: [
      { id: "today", label: "今日", href: "/today-work", permissions: ["nav.today_work"] },
      { id: "follow-ups", label: "待跟进", href: "/follow-ups", permissions: ["nav.follow_ups"] },
      {
        id: "plans",
        label: "计划任务",
        href: "/plans-tasks",
        permissions: ["nav.plans_tasks"],
      },
      {
        id: "daily",
        label: "日报",
        href: "/daily-reports",
        permissions: ["nav.daily_reports"],
      },
    ],
  },
  {
    id: "crm",
    label: "业务",
    href: "/crm",
    group: "deal",
    permissions: [
      "nav.customers",
      "nav.opportunities",
      "nav.contracts",
      "nav.contracts_external_costs",
    ],
    matchPrefixes: ["/customers", "/opportunities", "/crm", "/contracts"],
    tabs: [
      { id: "customers", label: "客户", href: "/customers", permissions: ["nav.customers"] },
      {
        id: "leads",
        label: "线索池",
        href: "/crm/leads",
        permissions: ["nav.customers"],
      },
      {
        id: "opportunities",
        label: "商机",
        href: "/opportunities",
        permissions: ["nav.opportunities"],
      },
      { id: "contracts", label: "合同", href: "/contracts", permissions: ["nav.contracts"] },
    ],
  },
  {
    id: "projects",
    label: "项目",
    href: "/projects",
    group: "deal",
    permissions: ["nav.projects", "nav.projects_schedule"],
    matchPrefixes: ["/projects"],
    tabs: [
      { id: "list", label: "项目列表", href: "/projects", permissions: ["nav.projects"] },
      {
        id: "schedule",
        label: "资源排班",
        href: "/projects/schedule",
        permissions: ["nav.projects_schedule"],
      },
      {
        id: "presales",
        label: "售前安排",
        href: "/projects/presales",
        permissions: ["nav.projects"],
      },
    ],
  },
  {
    id: "expenses",
    label: "报销",
    href: "/expenses",
    group: "cost",
    permissions: ["expense.access"],
    matchPrefixes: ["/expenses"],
  },
  {
    id: "collab",
    label: "通知与审批",
    href: "/approvals",
    group: "collab",
    permissions: ["nav.approvals", "nav.notifications"],
    matchPrefixes: ["/approvals", "/notifications"],
    badge: "inbox",
    tabs: [
      { id: "approvals", label: "审批", href: "/approvals", permissions: ["nav.approvals"] },
      {
        id: "notifications",
        label: "通知",
        href: "/notifications",
        permissions: ["nav.notifications"],
      },
    ],
  },
  {
    id: "people",
    label: "人员",
    href: "/people",
    group: "cost",
    permissions: [
      "nav.personnel_info",
      "nav.personnel_costs",
      "nav.sales_personnel",
      "nav.sales_costs",
      "nav.hr_home",
      "nav.hr_employees",
    ],
    matchPrefixes: [
      "/people",
      "/personnel",
      "/sales-personnel",
      "/sales-costs",
      "/hr",
    ],
    tabs: [
      {
        id: "hr-home",
        label: "行政工作台",
        href: "/hr",
        permissions: ["nav.hr_home"],
      },
      {
        id: "hr-employees",
        label: "员工档案",
        href: "/hr/employees",
        permissions: ["nav.hr_employees"],
      },
      {
        id: "impl-info",
        label: "实施人员",
        href: "/personnel?tab=info",
        permissions: ["nav.personnel_info"],
      },
      {
        id: "impl-costs",
        label: "人员成本",
        href: "/personnel?tab=costs",
        permissions: ["nav.personnel_costs"],
      },
      {
        id: "sales-personnel",
        label: "销售人员",
        href: "/sales-personnel",
        permissions: ["nav.sales_personnel"],
      },
      {
        id: "sales-costs",
        label: "销售成本",
        href: "/sales-costs",
        permissions: ["nav.sales_costs"],
      },
    ],
  },
  {
    id: "system",
    label: "配置",
    href: "/admin/settings",
    group: "manage",
    permissions: ["nav.admin_settings", "nav.admin_users", "nav.account"],
    matchPrefixes: ["/admin/settings", "/admin/users", "/admin/roles", "/account"],
    tabs: [
      {
        id: "settings",
        label: "系统配置",
        href: "/admin/settings",
        permissions: ["nav.admin_settings"],
      },
      {
        id: "users",
        label: "用户管理",
        href: "/admin/users",
        permissions: ["nav.admin_users"],
      },
      {
        id: "account",
        label: "个人设置",
        href: "/account",
        permissions: ["nav.account"],
      },
    ],
  },
];

export type ResolvedPrimaryNavItem = PrimaryNavItem & {
  href: string;
  tabs: HubTab[];
};

function hasAnyPermission(
  role: UserRole,
  keys: PermissionKey[],
  check: (role: UserRole, key: PermissionKey) => boolean
) {
  return keys.some((k) => check(role, k));
}

function filterTabs(
  tabs: HubTab[] | undefined,
  role: UserRole,
  check: (role: UserRole, key: PermissionKey) => boolean
): HubTab[] {
  if (!tabs?.length) return [];
  return tabs.filter((t) => hasAnyPermission(role, t.permissions, check));
}

export function resolvePrimaryNav(
  role: UserRole,
  check: (role: UserRole, key: PermissionKey) => boolean = defaultPermissionEnabled
): ResolvedPrimaryNavItem[] {
  const expenseOn = isExpenseFeatureEnabled();
  const out: ResolvedPrimaryNavItem[] = [];

  for (const item of PRIMARY_NAV) {
    if (item.id === "expenses" && !expenseOn) continue;
    if (!hasAnyPermission(role, item.permissions, check)) continue;

    const tabs = filterTabs(item.tabs, role, check);
    const href = tabs[0]?.href ?? item.href;
    out.push({ ...item, href, tabs });
  }
  return out;
}

/** 兼容旧 NavItem 形状（侧栏仍用 label/href） */
export type NavItem = {
  href: string;
  label: string;
  id: string;
  group: NavGroupId;
  badge?: "approvals" | "notifications" | "inbox";
  matchPrefixes: string[];
  tabs: HubTab[];
};

export function toNavItems(resolved: ResolvedPrimaryNavItem[]): NavItem[] {
  return resolved.map((item) => ({
    id: item.id,
    href: item.href,
    label: item.label,
    group: item.group,
    badge: item.badge,
    matchPrefixes: item.matchPrefixes,
    tabs: item.tabs,
  }));
}

export function findHubForPath(
  pathname: string,
  search: string,
  nav: NavItem[]
): NavItem | null {
  const full = search ? `${pathname}${search.startsWith("?") ? search : `?${search}`}` : pathname;
  let best: NavItem | null = null;
  let bestLen = -1;

  for (const item of nav) {
    for (const prefix of item.matchPrefixes) {
      const ok =
        pathname === prefix ||
        pathname.startsWith(`${prefix}/`) ||
        (prefix.includes("?") && full.startsWith(prefix));
      // also match /personnel?tab=costs via pathname /personnel
      const pathOk =
        pathname === prefix ||
        (prefix.includes("?")
          ? pathname === prefix.split("?")[0]
          : pathname.startsWith(`${prefix}/`) || pathname === prefix);
      if (!pathOk && !ok) continue;
      const score = prefix.length;
      if (score > bestLen) {
        best = item;
        bestLen = score;
      }
    }
  }
  return best;
}

export function isHubTabActive(tabHref: string, pathname: string, search: string): boolean {
  const [path, query = ""] = tabHref.split("?");
  if (pathname !== path && !pathname.startsWith(`${path}/`)) {
    // exact path only for list roots to avoid /contracts matching /contracts/external-costs wrongly when tab is list
    if (path === "/contracts" && pathname.startsWith("/contracts/")) {
      if (tabHref === "/contracts") return false;
    }
    if (path === "/projects" && pathname.startsWith("/projects/")) {
      if (tabHref === "/projects") return false;
    }
    if (path === "/hr" && pathname.startsWith("/hr/")) {
      if (tabHref === "/hr") return false;
    }
    if (pathname !== path) return false;
  }

  if (path === "/contracts") {
    // 外部成本等子页仍归在「合同」下高亮
    return (
      pathname === "/contracts" ||
      pathname.startsWith("/contracts/")
    );
  }
  if (path === "/projects") {
    if (tabHref === "/projects") {
      return (
        pathname === "/projects" ||
        pathname.startsWith("/projects/new") ||
        (pathname.startsWith("/projects/") && !pathname.startsWith("/projects/schedule"))
      );
    }
    return pathname.startsWith("/projects/schedule");
  }
  if (path === "/hr") {
    if (tabHref === "/hr") return pathname === "/hr";
    return pathname.startsWith("/hr/employees");
  }
  if (path === "/admin/settings") {
    return pathname.startsWith("/admin/settings");
  }
  if (path === "/admin/users") {
    return pathname.startsWith("/admin/users") || pathname.startsWith("/admin/roles");
  }
  if (path === "/account") {
    return pathname.startsWith("/account");
  }
  if (path === "/personnel") {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const tab = params.get("tab");
    if (query.includes("tab=costs")) return tab === "costs";
    // 实施人员（info）：默认无 tab 或 tab=info
    return tab !== "costs";
  }

  if (pathname === path) return true;
  if (pathname.startsWith(`${path}/`)) return true;
  return false;
}

export function getDefaultHomeFromPrimary(role: UserRole): string {
  const items = resolvePrimaryNav(role);
  return items[0]?.href ?? "/login";
}
