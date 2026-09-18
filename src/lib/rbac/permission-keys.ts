import type { UserRole } from "@prisma/client";

/**
 * 可配置权限键。
 * - nav.* / 模块入口：对齐侧栏 Hub + Tab
 * - 流程键：销售认领/代录/确认/日报考核等
 * - 明细 scope（本人/全量）仍由各域 access 处理
 */
export const PERMISSION_KEYS = [
  // —— 工作台 Tab ——
  "nav.today_work",
  "nav.follow_ups",
  "nav.plans_tasks",
  "nav.daily_reports",
  // —— 业务 Tab ——
  "nav.customers",
  "nav.opportunities",
  // —— 协作 ——
  "nav.approvals",
  "nav.notifications",
  // —— 合同 / 项目 Tab ——
  "nav.contracts",
  "nav.contracts_external_costs",
  "nav.projects",
  "nav.projects_schedule",
  // —— 人员 Tab ——
  "nav.hr_home",
  "nav.hr_employees",
  "nav.personnel_info",
  "nav.personnel_costs",
  "nav.sales_personnel",
  "nav.sales_costs",
  // —— 经营洞察 / 系统 ——
  "nav.admin_ops",
  "nav.admin_map",
  "nav.admin_stats",
  "nav.admin_settings",
  "nav.admin_users",
  "nav.account",
  // —— 销售流程 ——
  "customers.create",
  "customers.claim",
  "customers.manage",
  "follow_ups.submit_any",
  "contacts.propose",
  "opportunities.propose",
  "opportunities.manage",
  "opportunities.restore",
  "approvals.sales",
  "approvals.projects",
  "daily_reports.required",
  "daily_reports.view_all",
  "today_work.manage_assignments",
  // —— 合同流程 ——
  "contracts.approve",
  "contracts.payment",
  "contracts.attachments",
  // —— 项目 / 人事业务 ——
  "projects.admin",
  "projects.schedule",
  "personnel.info",
  "personnel.costs",
  "sales.personnel",
  "sales.costs",
  "hr.employees",
  // —— 系统配置 ——
  "settings.sales",
  "settings.project",
  "settings.system",
  // —— 报销 ——
  "expense.access",
  "expense.proxy_beneficiary",
  "expense.settings",
  "admin.manage_roles",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  description: string;
  group: string;
  lockedForAdmin?: boolean;
};

export const PERMISSION_DEFS: PermissionDef[] = [
  // ========== 工作台 ==========
  {
    key: "nav.today_work",
    label: "工作台 · 今日",
    description: "显示「工作台」入口及「今日」Tab",
    group: "工作台",
  },
  {
    key: "nav.follow_ups",
    label: "工作台 · 待跟进",
    description: "工作台内「待跟进」Tab",
    group: "工作台",
  },
  {
    key: "nav.plans_tasks",
    label: "工作台 · 计划任务",
    description: "工作台内「计划任务」Tab",
    group: "工作台",
  },
  {
    key: "nav.daily_reports",
    label: "工作台 · 日报",
    description: "工作台内「日报」Tab（可查看/填写）",
    group: "工作台",
  },
  {
    key: "daily_reports.required",
    label: "纳入日报考核",
    description: "工作日需交日报；逾期生成未提交占位、触发提醒（与能否打开日报 Tab 分开）",
    group: "工作台",
  },
  {
    key: "daily_reports.view_all",
    label: "查看全员日报",
    description: "查看全部销售历史日报与团队动态",
    group: "工作台",
  },
  {
    key: "today_work.manage_assignments",
    label: "管理周任务指派",
    description: "向销售指派周任务 / 跟进计划",
    group: "工作台",
  },

  // ========== 客户与商机 ==========
  {
    key: "nav.customers",
    label: "客户列表",
    description: "「业务」入口及客户 Tab",
    group: "业务",
  },
  {
    key: "nav.opportunities",
    label: "商机列表",
    description: "「业务」内商机 Tab",
    group: "业务",
  },
  {
    key: "customers.create",
    label: "新建客户",
    description: "可创建客户档案",
    group: "客户与商机",
  },
  {
    key: "customers.claim",
    label: "申请认领公海客户",
    description: "对公海客户提交认领申请",
    group: "客户与商机",
  },
  {
    key: "customers.manage",
    label: "客户管理（全量/公海分配）",
    description: "查看全量客户、分配/释放公海、管理负责人",
    group: "客户与商机",
  },
  {
    key: "follow_ups.submit_any",
    label: "代录往来（非负责客户）",
    description: "可向非本人负责的客户提交往来（通常待销管确认）",
    group: "客户与商机",
  },
  {
    key: "contacts.propose",
    label: "代建联系人",
    description: "可在非负责客户上新建联系人（通常待确认）",
    group: "客户与商机",
  },
  {
    key: "opportunities.propose",
    label: "代建商机",
    description: "可在非负责客户上创建商机（通常待确认）",
    group: "客户与商机",
  },
  {
    key: "opportunities.manage",
    label: "商机管理",
    description: "全量商机、改负责人与状态等",
    group: "客户与商机",
  },
  {
    key: "opportunities.restore",
    label: "恢复已放弃商机",
    description: "将已放弃商机恢复为未签约",
    group: "客户与商机",
  },

  // ========== 协作 ==========
  {
    key: "nav.approvals",
    label: "审批中心",
    description: "「通知与审批」内审批 Tab",
    group: "协作",
  },
  {
    key: "nav.notifications",
    label: "通知",
    description: "「通知与审批」内通知 Tab",
    group: "协作",
  },
  {
    key: "approvals.sales",
    label: "销售类审批操作",
    description: "客户认领、往来/联系人/商机待确认、合同审核等（管理员 / 销售管理）",
    group: "协作",
  },
  {
    key: "approvals.projects",
    label: "项目类审批操作",
    description: "项目侧审批能力（管理员 / 项目管理员；项目经理暂与项目人员同权）",
    group: "协作",
  },

  // ========== 合同 ==========
  {
    key: "nav.contracts",
    label: "合同列表",
    description: "「业务」内合同 Tab",
    group: "业务",
  },
  {
    key: "nav.contracts_external_costs",
    label: "外部成本",
    description: "合同列表页内「外部成本」入口",
    group: "业务",
  },
  {
    key: "contracts.approve",
    label: "合同审批与编辑",
    description: "新建/编辑/删除合同、审核合同",
    group: "合同",
  },
  {
    key: "contracts.payment",
    label: "登记回款",
    description: "登记合同回款与催款相关操作",
    group: "合同",
  },
  {
    key: "contracts.attachments",
    label: "合同附件",
    description: "上传与管理合同附件",
    group: "合同",
  },

  // ========== 项目 ==========
  {
    key: "nav.projects",
    label: "项目列表",
    description: "侧栏「项目」及列表 Tab",
    group: "项目",
  },
  {
    key: "nav.projects_schedule",
    label: "资源排班",
    description: "项目模块内「资源排班」Tab",
    group: "项目",
  },
  {
    key: "projects.admin",
    label: "项目全局管理",
    description: "新建/删除项目及项目管理员级能力",
    group: "项目",
  },
  {
    key: "projects.schedule",
    label: "操作资源排班",
    description: "进入并编辑资源排班",
    group: "项目",
  },

  // ========== 人员 ==========
  {
    key: "nav.hr_home",
    label: "行政工作台",
    description: "人员中心 · 行政工作台 Tab",
    group: "人员",
  },
  {
    key: "nav.hr_employees",
    label: "员工档案",
    description: "人员中心 · 员工档案 Tab",
    group: "人员",
  },
  {
    key: "nav.personnel_info",
    label: "实施人员",
    description: "人员中心 · 实施人员类型 Tab",
    group: "人员",
  },
  {
    key: "nav.personnel_costs",
    label: "人员成本",
    description: "人员中心 · 人员成本 Tab",
    group: "人员",
  },
  {
    key: "nav.sales_personnel",
    label: "销售人员",
    description: "人员中心 · 销售人员 Tab",
    group: "人员",
  },
  {
    key: "nav.sales_costs",
    label: "销售成本",
    description: "人员中心 · 销售成本 Tab",
    group: "人员",
  },
  {
    key: "personnel.info",
    label: "维护实施人员类型",
    description: "编辑实施人员排班属性/类型",
    group: "人员",
  },
  {
    key: "personnel.costs",
    label: "维护人员月成本",
    description: "编辑人员月成本数据",
    group: "人员",
  },
  {
    key: "sales.personnel",
    label: "维护销售人员",
    description: "销售人员模块写操作（与入口分离预留）",
    group: "人员",
  },
  {
    key: "sales.costs",
    label: "维护销售成本",
    description: "销售成本模块写操作",
    group: "人员",
  },
  {
    key: "hr.employees",
    label: "维护员工档案",
    description: "编辑员工档案与证件",
    group: "人员",
  },

  // ========== 经营洞察 ==========
  {
    key: "nav.admin_ops",
    label: "运营看板",
    description: "经营洞察 · 运营看板",
    group: "经营洞察",
  },
  {
    key: "nav.admin_map",
    label: "地图看板",
    description: "经营洞察 · 地图看板",
    group: "经营洞察",
  },
  {
    key: "nav.admin_stats",
    label: "统计管理",
    description: "经营洞察 · 统计管理",
    group: "经营洞察",
  },

  // ========== 系统 ==========
  {
    key: "nav.admin_settings",
    label: "系统配置入口",
    description: "侧栏「配置」及系统配置 Tab",
    group: "系统",
  },
  {
    key: "nav.admin_users",
    label: "用户管理入口",
    description: "「配置」内「用户管理」Tab",
    group: "系统",
  },
  {
    key: "nav.account",
    label: "个人设置",
    description: "「配置」内个人设置 Tab：账号信息与侧栏顺序",
    group: "系统",
  },
  {
    key: "settings.sales",
    label: "销售相关配置",
    description: "产品服务、KPI、日志助手等",
    group: "系统",
  },
  {
    key: "settings.project",
    label: "项目相关配置",
    description: "项目模型与项目字段选项",
    group: "系统",
  },
  {
    key: "settings.system",
    label: "系统级配置",
    description: "企微、AI、打卡定位、功能开关",
    group: "系统",
  },
  {
    key: "admin.manage_roles",
    label: "角色权限配置",
    description: "管理角色人员归属与权限矩阵",
    group: "系统",
    lockedForAdmin: true,
  },

  // ========== 报销 ==========
  {
    key: "expense.access",
    label: "进入报销",
    description:
      "侧栏报销与填写报销单（默认仅管理员/销售管理/项目管理员；可在此为其他角色开启）",
    group: "报销",
  },
  {
    key: "expense.proxy_beneficiary",
    label: "代他人报销",
    description: "可将「实际报销人」改为他人",
    group: "报销",
  },
  {
    key: "expense.settings",
    label: "报销设置",
    description: "城市线级、住宿标准、费用细类与审批流程",
    group: "报销",
  },
];

export const ALL_ROLES: UserRole[] = [
  "ADMIN",
  "SALES_MANAGER",
  "SALES",
  "HR",
  "PROJECT_ADMIN",
  "PROJECT_MANAGER",
  "PROJECT_STAFF",
  "OTHER",
];

const R = {
  admin: ["ADMIN"] as const,
  salesMgr: ["ADMIN", "SALES_MANAGER"] as const,
  salesLine: ["ADMIN", "SALES_MANAGER", "SALES"] as const,
  salesOnly: ["SALES"] as const,
  projectLine: ["ADMIN", "PROJECT_ADMIN", "PROJECT_MANAGER", "PROJECT_STAFF"] as const,
  /** 项目全局管理（审批/排班等）：管理员 + 项目管理员；项目经理暂与项目人员同权 */
  projectAdmin: ["ADMIN", "PROJECT_ADMIN"] as const,
  hrAdmin: ["ADMIN", "HR"] as const,
  hrOnly: ["HR"] as const,
  settingsPage: ["ADMIN", "SALES_MANAGER", "PROJECT_ADMIN", "HR"] as const,
  approvals: [
    "ADMIN",
    "SALES_MANAGER",
    "SALES",
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "HR",
  ] as const,
  notifications: ["ADMIN", "SALES_MANAGER", "SALES", "PROJECT_ADMIN", "HR"] as const,
  contracts: ["ADMIN", "SALES_MANAGER", "SALES"] as const,
  contractAttach: ["ADMIN", "SALES_MANAGER", "SALES"] as const,
  plans: [
    "ADMIN",
    "SALES_MANAGER",
    "SALES",
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
  ] as const,
  /** 报销入口：先只开管理员 / 销售管理 / 项目管理员，其余角色默认关 */
  expenseAccess: ["ADMIN", "SALES_MANAGER", "PROJECT_ADMIN"] as const,
};

/** 各权限键默认开启的角色（与改前硬编码对齐） */
export const DEFAULT_ENABLED_ROLES: Record<PermissionKey, readonly UserRole[]> = {
  "nav.today_work": R.salesLine,
  "nav.follow_ups": R.salesLine,
  "nav.plans_tasks": R.plans,
  "nav.daily_reports": R.salesLine,
  "nav.customers": R.salesLine,
  "nav.opportunities": R.salesLine,
  "nav.approvals": R.approvals,
  "nav.notifications": R.notifications,
  "nav.contracts": R.contracts,
  "nav.contracts_external_costs": R.contracts,
  "nav.projects": R.projectLine,
  "nav.projects_schedule": R.projectAdmin,
  "nav.hr_home": R.hrAdmin,
  "nav.hr_employees": R.hrAdmin,
  "nav.personnel_info": R.projectAdmin,
  "nav.personnel_costs": R.hrAdmin,
  "nav.sales_personnel": R.salesMgr,
  "nav.sales_costs": R.salesMgr,
  "nav.admin_ops": R.salesMgr,
  "nav.admin_map": R.salesMgr,
  "nav.admin_stats": R.salesMgr,
  "nav.admin_settings": R.settingsPage,
  "nav.admin_users": R.admin,
  "nav.account": [
    "ADMIN",
    "SALES_MANAGER",
    "SALES",
    "HR",
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "OTHER",
  ],

  "customers.create": R.salesLine,
  "customers.claim": R.salesOnly,
  "customers.manage": R.salesMgr,
  "follow_ups.submit_any": R.salesOnly,
  "contacts.propose": R.salesOnly,
  "opportunities.propose": R.salesOnly,
  "opportunities.manage": R.salesMgr,
  "opportunities.restore": R.salesMgr,
  "approvals.sales": R.salesMgr,
  "approvals.projects": R.projectAdmin,
  "daily_reports.required": R.salesOnly,
  "daily_reports.view_all": R.salesMgr,
  "today_work.manage_assignments": R.salesMgr,

  "contracts.approve": R.salesMgr,
  "contracts.payment": R.salesLine,
  "contracts.attachments": R.contractAttach,

  "projects.admin": R.projectAdmin,
  "projects.schedule": R.projectAdmin,
  "personnel.info": R.projectAdmin,
  "personnel.costs": R.hrAdmin,
  "sales.personnel": R.salesMgr,
  "sales.costs": R.salesMgr,
  "hr.employees": R.hrAdmin,

  "settings.sales": R.salesMgr,
  "settings.project": R.projectAdmin,
  "settings.system": R.admin,

  "expense.access": R.expenseAccess,
  "expense.proxy_beneficiary": R.expenseAccess,
  "expense.settings": ["ADMIN", "SALES_MANAGER", "HR"],

  "admin.manage_roles": R.admin,
};

function buildDefaultMatrix(): Record<UserRole, Record<PermissionKey, boolean>> {
  const out = {} as Record<UserRole, Record<PermissionKey, boolean>>;
  for (const role of ALL_ROLES) {
    const row = {} as Record<PermissionKey, boolean>;
    for (const key of PERMISSION_KEYS) {
      row[key] = (DEFAULT_ENABLED_ROLES[key] as readonly string[]).includes(role);
    }
    out[role] = row;
  }
  return out;
}

export const DEFAULT_ROLE_PERMISSIONS = buildDefaultMatrix();

export type RoleUserCounts = {
  total: Record<UserRole, number>;
  active: Record<UserRole, number>;
};

export function defaultPermissionEnabled(role: UserRole, key: PermissionKey): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role]?.[key] ?? false;
}

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}
