import type { ExpenseClaimStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ALL_ROLES,
  DEFAULT_ENABLED_ROLES,
} from "@/lib/rbac/permission-keys";
import { ROLE_LABELS } from "@/lib/permissions";

/** 申请人或审批人：可选角色、固定人员 */
export type ExpenseFlowParty = {
  roles: UserRole[];
  userIds: string[];
};

/** 节点内一条映射：申请人 → 审批人（可跳过） */
export type ExpenseFlowMapping = {
  id: string;
  applicants: ExpenseFlowParty;
  approvers: ExpenseFlowParty & { skip: boolean };
};

/** 审批节点（可含多条映射） */
export type ExpenseFlowStepConfig = {
  id: string;
  sortOrder: number;
  name: string;
  mappings: ExpenseFlowMapping[];
  isFinalPayout: boolean;
};

/**
 * 运行时有效节点：已按申请人匹配到具体映射，展平为审批人侧
 * （写入 claim.activeSteps）
 */
export type ExpenseFlowResolvedStep = {
  id: string;
  sortOrder: number;
  name: string;
  mappingId: string;
  applicants: ExpenseFlowParty;
  approvers: ExpenseFlowParty & { skip: boolean };
  isFinalPayout: boolean;
};

export type ExpenseFlowSnapshot = {
  steps: ExpenseFlowStepConfig[];
  activeSteps?: ExpenseFlowResolvedStep[];
  v?: 3;
};

const FLOW_ID = "default";

export const EXPENSE_FLOW_SUBMITTER_ROLES: UserRole[] = [
  ...(DEFAULT_ENABLED_ROLES["expense.access"] as readonly UserRole[]),
  // 「其他」默认无 expense.access，但仍可能出现在人员名册中，流程映射需可覆盖
  "OTHER",
];

export function emptyParty(): ExpenseFlowParty {
  return { roles: [], userIds: [] };
}

function allSubmitterApplicants(): ExpenseFlowParty {
  return { roles: [...EXPENSE_FLOW_SUBMITTER_ROLES], userIds: [] };
}

function newMappingId(): string {
  return `map-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyMapping(): ExpenseFlowMapping {
  return {
    id: newMappingId(),
    applicants: emptyParty(),
    approvers: { ...emptyParty(), skip: false },
  };
}

export const DEFAULT_EXPENSE_FLOW_STEPS: Omit<ExpenseFlowStepConfig, "id">[] = [
  {
    sortOrder: 0,
    name: "上级审批",
    mappings: [
      {
        id: "map-sales-mgr",
        applicants: { roles: ["SALES_MANAGER"], userIds: [] },
        approvers: { roles: ["SALES_MANAGER"], userIds: [], skip: false },
      },
      {
        id: "map-project-admin",
        applicants: { roles: ["PROJECT_ADMIN"], userIds: [] },
        approvers: { roles: ["PROJECT_ADMIN"], userIds: [], skip: false },
      },
      {
        id: "map-admin-other",
        applicants: { roles: ["ADMIN", "OTHER"], userIds: [] },
        approvers: { roles: ["ADMIN"], userIds: [], skip: false },
      },
    ],
    isFinalPayout: false,
  },
  {
    sortOrder: 1,
    name: "行政确认",
    mappings: [
      {
        id: "map-hr-confirm",
        applicants: allSubmitterApplicants(),
        approvers: { roles: ["HR"], userIds: [], skip: false },
      },
    ],
    isFinalPayout: false,
  },
  {
    sortOrder: 2,
    name: "管理员打款",
    mappings: [
      {
        id: "map-payout",
        applicants: allSubmitterApplicants(),
        approvers: { roles: ["ADMIN"], userIds: [], skip: false },
      },
    ],
    isFinalPayout: true,
  },
];

function roleLabelList(roles: UserRole[]): string {
  return roles.map((r) => ROLE_LABELS[r] ?? r).join("、");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function asRoleArray(value: unknown): UserRole[] {
  const allowed = new Set<string>(ALL_ROLES);
  return asStringArray(value).filter((r): r is UserRole => allowed.has(r));
}

/** 角色与固定人员二选一：有人员则只保留人员 */
export function exclusiveParty(party: ExpenseFlowParty): ExpenseFlowParty {
  if (party.userIds.length > 0) {
    return { roles: [], userIds: party.userIds };
  }
  return { roles: party.roles, userIds: [] };
}

export function parseParty(raw: unknown): ExpenseFlowParty {
  if (!raw || typeof raw !== "object") return emptyParty();
  const rec = raw as Record<string, unknown>;
  return exclusiveParty({
    roles: asRoleArray(rec.roles),
    userIds: asStringArray(rec.userIds),
  });
}

export function partyMatches(
  party: ExpenseFlowParty,
  user: { id: string; role: UserRole | string }
): boolean {
  if (party.userIds.includes(user.id)) return true;
  if (party.roles.includes(user.role as UserRole)) return true;
  return false;
}

export function partyIsEmpty(party: ExpenseFlowParty): boolean {
  return party.roles.length === 0 && party.userIds.length === 0;
}

export function parseMapping(raw: unknown, index: number): ExpenseFlowMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const applicants = parseParty(rec.applicants);
  const approversRec =
    rec.approvers && typeof rec.approvers === "object"
      ? (rec.approvers as Record<string, unknown>)
      : {};
  const skip = Boolean(approversRec.skip);
  const approvers = {
    ...parseParty(rec.approvers),
    skip,
  };
  return {
    id:
      typeof rec.id === "string" && rec.id.trim()
        ? rec.id.trim()
        : `map-${index}-${Date.now()}`,
    applicants,
    approvers: skip ? { roles: [], userIds: [], skip: true } : approvers,
  };
}

export function parseMappings(raw: unknown): ExpenseFlowMapping[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => parseMapping(row, i))
    .filter((m): m is ExpenseFlowMapping => Boolean(m));
}

/** 在节点内为申请人找到匹配映射：固定人员优先于角色 */
export function findMappingForApplicant(
  step: ExpenseFlowStepConfig,
  user: { id: string; role: UserRole | string }
): ExpenseFlowMapping | null {
  for (const m of step.mappings) {
    if (m.applicants.userIds.includes(user.id)) return m;
  }
  for (const m of step.mappings) {
    if (m.applicants.roles.includes(user.role as UserRole)) return m;
  }
  return null;
}

/**
 * 按顺序走节点：每个节点匹配一条映射；跳过则略过该节点
 */
export function resolveActiveStepsForApplicant(
  steps: ExpenseFlowStepConfig[],
  user: { id: string; role: UserRole | string }
): { ok: true; steps: ExpenseFlowResolvedStep[] } | { ok: false; error: string } {
  const out: ExpenseFlowResolvedStep[] = [];
  for (const step of steps) {
    const mapping = findMappingForApplicant(step, user);
    if (!mapping) {
      return {
        ok: false,
        error: `节点「${step.name}」没有匹配到你的申请人映射，请联系管理员补全`,
      };
    }
    if (mapping.approvers.skip) continue;
    out.push({
      id: step.id,
      sortOrder: out.length,
      name: step.name,
      mappingId: mapping.id,
      applicants: mapping.applicants,
      approvers: mapping.approvers,
      isFinalPayout: step.isFinalPayout,
    });
  }
  if (out.length === 0) {
    return { ok: false, error: "有效审批路径为空（节点可能全部被跳过）" };
  }
  if (!out.some((s) => s.isFinalPayout)) {
    return { ok: false, error: "有效审批路径缺少打款结案节点" };
  }
  return { ok: true, steps: out };
}

/** 某节点申请人侧未覆盖的可报销角色 */
export function missingSubmitterRolesInStep(
  step: ExpenseFlowStepConfig
): UserRole[] {
  const covered = new Set<UserRole>();
  for (const m of step.mappings) {
    for (const r of m.applicants.roles) covered.add(r);
  }
  return EXPENSE_FLOW_SUBMITTER_ROLES.filter((r) => !covered.has(r));
}

/** 全流程：任一节点有缺口则返回（用于设置页总览） */
export function missingSubmitterRolesInFlow(
  steps: ExpenseFlowStepConfig[]
): Array<{ stepName: string; roles: UserRole[] }> {
  const out: Array<{ stepName: string; roles: UserRole[] }> = [];
  for (const step of steps) {
    const roles = missingSubmitterRolesInStep(step);
    if (roles.length > 0) out.push({ stepName: step.name, roles });
  }
  return out;
}

/** @deprecated */
export const missingSubmitterRolesInSuperiorMappings = (
  steps: ExpenseFlowStepConfig[]
): UserRole[] => {
  const first = missingSubmitterRolesInFlow(steps)[0];
  return first?.roles ?? [];
};

/** 将旧版「每节点一对申请人/审批人」或更旧 kind 结构迁到 mappings */
export function migrateStepToMappings(row: Record<string, unknown>): ExpenseFlowStepConfig {
  const id =
    typeof row.id === "string" && row.id.trim() ? row.id.trim() : `step-${Date.now()}`;
  const name = String(row.name ?? "").trim() || "审批节点";
  const isFinalPayout = Boolean(row.isFinalPayout);

  if (Array.isArray(row.mappings) && row.mappings.length > 0) {
    return {
      id,
      sortOrder: Number(row.sortOrder ?? 0),
      name,
      mappings: parseMappings(row.mappings),
      isFinalPayout,
    };
  }

  // v2 扁平字段
  if (row.applicants || row.approvers || row.applicantRoles != null) {
    const applicants =
      row.applicants != null
        ? parseParty(row.applicants)
        : {
            roles: asRoleArray(row.applicantRoles),
            userIds: asStringArray(row.applicantUserIds),
          };
    const skip = Boolean(
      row.approvers && typeof row.approvers === "object"
        ? (row.approvers as { skip?: boolean }).skip
        : row.approverSkip
    );
    const approvers = skip
      ? { roles: [] as UserRole[], userIds: [] as string[], skip: true }
      : row.approvers != null
        ? { ...parseParty(row.approvers), skip: false }
        : {
            roles: asRoleArray(row.approverRoles),
            userIds: asStringArray(row.approverUserIds),
            skip: false,
          };
    return {
      id,
      sortOrder: Number(row.sortOrder ?? 0),
      name,
      mappings: [
        {
          id: `${id}-map-0`,
          applicants,
          approvers,
        },
      ],
      isFinalPayout,
    };
  }

  // v1 kind
  const kind = String(row.kind ?? "");
  if (kind === "SUPERIOR_PICK") {
    const mappings: ExpenseFlowMapping[] = [];
    const legacyMaps = Array.isArray(row.roleMappings) ? row.roleMappings : [];
    legacyMaps.forEach((m, i) => {
      if (!m || typeof m !== "object") return;
      const rec = m as Record<string, unknown>;
      const applicantRoles = asRoleArray(rec.applicantRoles);
      const approverRoles = asRoleArray(rec.approverRoles);
      if (!applicantRoles.length || !approverRoles.length) return;
      mappings.push({
        id: `${id}-map-${i}`,
        applicants: { roles: applicantRoles, userIds: [] },
        approvers: { roles: approverRoles, userIds: [], skip: false },
      });
    });
    return { id, sortOrder: 0, name, mappings, isFinalPayout: false };
  }
  if (kind === "ROLE_POOL") {
    return {
      id,
      sortOrder: 0,
      name,
      mappings: [
        {
          id: `${id}-map-0`,
          applicants: allSubmitterApplicants(),
          approvers: {
            roles: asRoleArray(row.roleKeys),
            userIds: [],
            skip: false,
          },
        },
      ],
      isFinalPayout,
    };
  }
  if (kind === "FIXED_USERS") {
    return {
      id,
      sortOrder: 0,
      name,
      mappings: [
        {
          id: `${id}-map-0`,
          applicants: allSubmitterApplicants(),
          approvers: {
            roles: [],
            userIds: asStringArray(row.userIds),
            skip: false,
          },
        },
      ],
      isFinalPayout,
    };
  }

  return { id, sortOrder: 0, name, mappings: [emptyMapping()], isFinalPayout };
}

export function migrateLegacyFlowSteps(rawSteps: unknown[]): ExpenseFlowStepConfig[] {
  const out: ExpenseFlowStepConfig[] = [];
  for (const raw of rawSteps) {
    if (!raw || typeof raw !== "object") continue;
    const step = migrateStepToMappings(raw as Record<string, unknown>);
    // SUPERIOR_PICK 已在 migrateStepToMappings 拆成多映射单节点
    step.sortOrder = out.length;
    out.push(step);
  }
  return out;
}

export function normalizeExpenseFlowSteps(
  raw: unknown
): { ok: true; steps: ExpenseFlowStepConfig[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "请至少配置一个审批节点" };
  }
  if (raw.length > 20) {
    return { ok: false, error: "审批节点过多（最多 20 个）" };
  }

  const looksFlatV2 = raw.some(
    (r) =>
      r &&
      typeof r === "object" &&
      !("mappings" in (r as object)) &&
      ("applicants" in (r as object) || "kind" in (r as object))
  );
  const source = looksFlatV2 ? migrateLegacyFlowSteps(raw) : raw;

  const steps: ExpenseFlowStepConfig[] = [];
  let finalCount = 0;

  for (let i = 0; i < source.length; i++) {
    const row = source[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `第 ${i + 1} 个节点格式无效` };
    }
    const rec = row as Record<string, unknown>;
    const name = String(rec.name ?? "").trim();
    if (!name) return { ok: false, error: `第 ${i + 1} 个节点请填写名称` };

    const isFinalPayout = Boolean(rec.isFinalPayout);
    if (isFinalPayout) finalCount += 1;

    let mappings = parseMappings(rec.mappings);
    if (mappings.length === 0 && (rec.applicants || rec.kind)) {
      mappings = migrateStepToMappings(rec).mappings;
    }
    if (mappings.length === 0) {
      return { ok: false, error: `「${name}」请至少添加一条映射` };
    }

    for (let mi = 0; mi < mappings.length; mi++) {
      const m = mappings[mi]!;
      if (partyIsEmpty(m.applicants)) {
        return { ok: false, error: `「${name}」第 ${mi + 1} 条映射请配置申请人` };
      }
      if (m.approvers.skip && isFinalPayout) {
        return { ok: false, error: `「${name}」打款结案节点的映射不能设为跳过` };
      }
      if (!m.approvers.skip && partyIsEmpty(m.approvers)) {
        return {
          ok: false,
          error: `「${name}」第 ${mi + 1} 条映射请配置审批人，或勾选跳过`,
        };
      }
    }

    const missing = missingSubmitterRolesInStep({
      id: "tmp",
      sortOrder: i,
      name,
      mappings,
      isFinalPayout,
    });
    if (missing.length > 0) {
      return {
        ok: false,
        error: `「${name}」的映射未覆盖可报销角色：${roleLabelList(missing)}。请继续添加映射直到覆盖所有人。`,
      };
    }

    steps.push({
      id: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : `tmp-${i}`,
      sortOrder: i,
      name,
      mappings,
      isFinalPayout,
    });
  }

  if (finalCount !== 1) {
    return { ok: false, error: "请恰好指定一个「打款结案」节点" };
  }

  return { ok: true, steps };
}

const enabledUserWhere = {
  OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
};

export async function assertExpenseFlowActorCoverage(
  steps: ExpenseFlowStepConfig[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const step of steps) {
    for (const mapping of step.mappings) {
      if (mapping.approvers.skip) continue;
      for (const role of mapping.approvers.roles) {
        const n = await prisma.user.count({
          where: { role, ...enabledUserWhere },
        });
        if (n === 0) {
          return {
            ok: false,
            error: `「${step.name}」审批角色「${ROLE_LABELS[role] ?? role}」当前没有启用账号`,
          };
        }
      }
      if (mapping.approvers.userIds.length > 0) {
        const found = await prisma.user.count({
          where: { id: { in: mapping.approvers.userIds }, ...enabledUserWhere },
        });
        if (found < mapping.approvers.userIds.length) {
          return {
            ok: false,
            error: `「${step.name}」部分固定审批人不可用，请重新选择`,
          };
        }
      }
      if (mapping.applicants.userIds.length > 0) {
        const found = await prisma.user.count({
          where: {
            id: { in: mapping.applicants.userIds },
            ...enabledUserWhere,
          },
        });
        if (found < mapping.applicants.userIds.length) {
          return {
            ok: false,
            error: `「${step.name}」部分固定申请人不可用，请重新选择`,
          };
        }
      }
    }
  }

  const expenseUsers = await prisma.user.findMany({
    where: {
      role: { in: EXPENSE_FLOW_SUBMITTER_ROLES },
      ...enabledUserWhere,
    },
    select: { id: true, name: true, role: true },
    take: 500,
  });

  for (const step of steps) {
    const uncovered = expenseUsers.filter(
      (u) => !findMappingForApplicant(step, u)
    );
    if (uncovered.length > 0) {
      const sample = uncovered
        .slice(0, 5)
        .map((u) => u.name)
        .join("、");
      return {
        ok: false,
        error: `节点「${step.name}」仍有 ${uncovered.length} 人未被映射覆盖（如 ${sample}${uncovered.length > 5 ? "…" : ""}）。请添加映射直到覆盖所有人。`,
      };
    }
  }

  return { ok: true };
}

function rowToStep(row: {
  id: string;
  sortOrder: number;
  name: string;
  mappings?: unknown;
  isFinalPayout: boolean;
  applicantRoles?: unknown;
  applicantUserIds?: unknown;
  approverRoles?: unknown;
  approverUserIds?: unknown;
  approverSkip?: boolean | null;
  kind?: string | null;
  roleKeys?: unknown;
  userIds?: unknown;
  roleMappings?: unknown;
}): ExpenseFlowStepConfig {
  if (Array.isArray(row.mappings) && row.mappings.length > 0) {
    return {
      id: row.id,
      sortOrder: row.sortOrder,
      name: row.name,
      mappings: parseMappings(row.mappings),
      isFinalPayout: Boolean(row.isFinalPayout),
    };
  }
  return migrateStepToMappings(row as unknown as Record<string, unknown>);
}

export async function ensureDefaultExpenseApprovalFlow() {
  const existing = await prisma.expenseApprovalFlow.findUnique({
    where: { id: FLOW_ID },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });

  if (existing && existing.steps.length > 0) {
    await migrateDbStepsToMappingsIfNeeded(existing.steps);
    return prisma.expenseApprovalFlow.findUniqueOrThrow({
      where: { id: FLOW_ID },
      include: { steps: { orderBy: { sortOrder: "asc" } } },
    });
  }

  await prisma.expenseApprovalFlow.upsert({
    where: { id: FLOW_ID },
    create: { id: FLOW_ID },
    update: {},
  });

  await prisma.expenseApprovalFlowStep.createMany({
    data: DEFAULT_EXPENSE_FLOW_STEPS.map((s, i) => ({
      flowId: FLOW_ID,
      sortOrder: i,
      name: s.name,
      kind: "ROLE_POOL",
      mappings: s.mappings,
      isFinalPayout: s.isFinalPayout,
      roleKeys: [],
      userIds: [],
      roleMappings: [],
      applicantRoles: [],
      applicantUserIds: [],
      approverRoles: [],
      approverUserIds: [],
      approverSkip: false,
    })),
  });

  return prisma.expenseApprovalFlow.findUniqueOrThrow({
    where: { id: FLOW_ID },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
}

async function migrateDbStepsToMappingsIfNeeded(
  steps: Array<{
    id: string;
    sortOrder: number;
    name: string;
    mappings?: unknown;
    isFinalPayout: boolean;
    applicantRoles?: unknown;
    applicantUserIds?: unknown;
    approverRoles?: unknown;
    approverUserIds?: unknown;
    approverSkip?: boolean | null;
    kind?: string | null;
    roleKeys?: unknown;
    userIds?: unknown;
    roleMappings?: unknown;
  }>
) {
  const needs = steps.some(
    (s) => !Array.isArray(s.mappings) || (s.mappings as unknown[]).length === 0
  );
  if (!needs) return;

  const migrated = steps.map((s) => rowToStep(s));
  // 若仍是多个「销售上级/项目上级」扁平节点，合并第一批非打款非全员节点？保持简单：逐节点迁成单映射即可
  await prisma.$transaction(async (tx) => {
    await tx.expenseApprovalFlowStep.deleteMany({ where: { flowId: FLOW_ID } });
    await tx.expenseApprovalFlowStep.createMany({
      data: migrated.map((s, i) => ({
        flowId: FLOW_ID,
        sortOrder: i,
        name: s.name,
        kind: "ROLE_POOL",
        mappings: s.mappings,
        isFinalPayout: s.isFinalPayout,
        roleKeys: [],
        userIds: [],
        roleMappings: [],
        applicantRoles: [],
        applicantUserIds: [],
        approverRoles: [],
        approverUserIds: [],
        approverSkip: false,
      })),
    });
  });
}

export async function getExpenseApprovalFlowForAdmin(): Promise<{
  steps: ExpenseFlowStepConfig[];
  updatedAt: Date | null;
}> {
  const flow = await ensureDefaultExpenseApprovalFlow();
  const fresh = await prisma.expenseApprovalFlow.findUniqueOrThrow({
    where: { id: FLOW_ID },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
  return {
    steps: fresh.steps.map((s) => rowToStep(s)),
    updatedAt: flow.updatedAt,
  };
}

export async function getExpenseFlowSnapshotFromConfig(): Promise<ExpenseFlowSnapshot> {
  const { steps } = await getExpenseApprovalFlowForAdmin();
  return { steps, v: 3 };
}

export function parseClaimFlowSnapshot(raw: unknown): ExpenseFlowSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const stepsRaw = (raw as { steps?: unknown }).steps;
  if (!Array.isArray(stepsRaw)) return null;
  const normalized = normalizeExpenseFlowSteps(stepsRaw);
  if (normalized.ok) {
    const activeRaw = (raw as { activeSteps?: unknown }).activeSteps;
    return {
      steps: normalized.steps,
      activeSteps: Array.isArray(activeRaw)
        ? (activeRaw as ExpenseFlowResolvedStep[])
        : undefined,
      v: 3,
    };
  }
  const migrated = migrateLegacyFlowSteps(stepsRaw);
  if (migrated.length === 0) return null;
  return { steps: migrated.map((s, i) => ({ ...s, sortOrder: i })), v: 3 };
}

export function legacyExpenseFlowSnapshot(): ExpenseFlowSnapshot {
  return {
    steps: DEFAULT_EXPENSE_FLOW_STEPS.map((s, i) => ({
      ...s,
      id: `legacy-${i}`,
    })),
    v: 3,
  };
}

export function resolveClaimFlowSnapshot(claim: {
  flowSnapshot?: unknown;
}): ExpenseFlowSnapshot {
  return parseClaimFlowSnapshot(claim.flowSnapshot) ?? legacyExpenseFlowSnapshot();
}

function parseResolvedStep(raw: unknown, index: number): ExpenseFlowResolvedStep | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const applicants = parseParty(rec.applicants);
  const approversRec =
    rec.approvers && typeof rec.approvers === "object"
      ? (rec.approvers as Record<string, unknown>)
      : {};
  return {
    id: typeof rec.id === "string" ? rec.id : `active-${index}`,
    sortOrder: index,
    name: String(rec.name ?? `步骤 ${index + 1}`),
    mappingId: typeof rec.mappingId === "string" ? rec.mappingId : `map-${index}`,
    applicants,
    approvers: { ...parseParty(rec.approvers), skip: Boolean(approversRec.skip) },
    isFinalPayout: Boolean(rec.isFinalPayout),
  };
}

export function getClaimActivePath(claim: {
  flowSnapshot?: unknown;
}): ExpenseFlowResolvedStep[] {
  const raw = claim.flowSnapshot;
  if (raw && typeof raw === "object") {
    const active = (raw as { activeSteps?: unknown }).activeSteps;
    if (Array.isArray(active) && active.length > 0) {
      return active
        .map((row, i) => parseResolvedStep(row, i))
        .filter((s): s is ExpenseFlowResolvedStep => Boolean(s));
    }
  }
  // 无 activeSteps 的旧单：无法按人解析，退回空（由调用方兼容）
  return [];
}

export function getClaimCurrentStep(claim: {
  flowSnapshot?: unknown;
  currentStepIndex?: number | null;
  status: string;
}): ExpenseFlowResolvedStep | null {
  if (claim.status === "DRAFT" || claim.status === "REJECTED" || claim.status === "PAID") {
    return null;
  }
  const path = getClaimActivePath(claim);
  if (path.length === 0) {
    // 兼容旧快照：把 steps 展平为仅审批人侧（无申请人匹配）
    const snap = resolveClaimFlowSnapshot(claim);
    const fallback: ExpenseFlowResolvedStep[] = [];
    for (const step of snap.steps) {
      const m = step.mappings[0];
      if (!m || m.approvers.skip) continue;
      fallback.push({
        id: step.id,
        sortOrder: fallback.length,
        name: step.name,
        mappingId: m.id,
        applicants: m.applicants,
        approvers: m.approvers,
        isFinalPayout: step.isFinalPayout,
      });
    }
    if (fallback.length === 0) return null;
    let idx = claim.currentStepIndex ?? 0;
    if (claim.status === "PENDING_PAYOUT") {
      idx = fallback.findIndex((s) => s.isFinalPayout);
      if (idx < 0) idx = fallback.length - 1;
    } else if (claim.status === "PENDING_HR") {
      idx = Math.min(1, fallback.length - 1);
    }
    return fallback[idx] ?? null;
  }

  let idx = claim.currentStepIndex;
  if (idx == null) {
    if (claim.status === "PENDING_MANAGER") idx = 0;
    else if (claim.status === "PENDING_PAYOUT") {
      idx = path.findIndex((s) => s.isFinalPayout);
      if (idx < 0) idx = path.length - 1;
    } else if (claim.status === "PENDING_HR") {
      idx = Math.min(1, path.length - 1);
    } else idx = 0;
  }
  if (idx < 0 || idx >= path.length) return null;
  return path[idx] ?? null;
}

export function getClaimCurrentStepIndex(claim: {
  flowSnapshot?: unknown;
  currentStepIndex?: number | null;
  status: string;
}): number {
  if (claim.currentStepIndex != null && claim.currentStepIndex >= 0) {
    return claim.currentStepIndex;
  }
  const step = getClaimCurrentStep(claim);
  if (!step) return -1;
  const path = getClaimActivePath(claim);
  if (path.length > 0) {
    return path.findIndex((s) => s.id === step.id && s.mappingId === step.mappingId);
  }
  return 0;
}

export function buildSubmitFlowSnapshot(
  config: ExpenseFlowSnapshot,
  applicant: { id: string; role: UserRole | string }
):
  | { ok: true; snapshot: ExpenseFlowSnapshot & { activeSteps: ExpenseFlowResolvedStep[] } }
  | { ok: false; error: string } {
  const resolved = resolveActiveStepsForApplicant(config.steps, applicant);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    snapshot: { steps: config.steps, activeSteps: resolved.steps, v: 3 },
  };
}

export function statusForActiveStep(
  step: ExpenseFlowResolvedStep,
  indexInActivePath: number
): ExpenseClaimStatus {
  if (step.isFinalPayout) return "PENDING_PAYOUT";
  if (indexInActivePath === 0) return "PENDING_MANAGER";
  return "PENDING_HR";
}

export function approvalRecordStepForFlow(
  step: ExpenseFlowResolvedStep,
  indexInActivePath: number
): "MANAGER" | "HR" | "FINANCE" {
  if (step.isFinalPayout) return "FINANCE";
  if (indexInActivePath === 0) return "MANAGER";
  return "HR";
}

/** 审批记录步骤展示名（与流程节点语义对齐） */
export function expenseApprovalStepLabel(
  step: "MANAGER" | "HR" | "FINANCE" | string
): string {
  if (step === "MANAGER") return "上级";
  if (step === "HR") return "行政";
  if (step === "FINANCE") return "打款";
  return step;
}

export function approverCandidateFilter(step: ExpenseFlowResolvedStep): {
  roles: UserRole[];
  userIds: string[];
} {
  if (step.approvers.skip) return { roles: [], userIds: [] };
  return { roles: step.approvers.roles, userIds: step.approvers.userIds };
}

export function userCanActOnFlowStep(input: {
  step: ExpenseFlowResolvedStep;
  user: { id: string; role: UserRole | string };
  managerId?: string | null;
  allowAdminBypass?: boolean;
  isFirstActiveStep?: boolean;
}): boolean {
  const {
    step,
    user,
    managerId,
    allowAdminBypass = true,
    isFirstActiveStep = false,
  } = input;
  if (step.approvers.skip) return false;
  if (allowAdminBypass && user.role === "ADMIN") return true;
  if (isFirstActiveStep && managerId) {
    return managerId === user.id;
  }
  return partyMatches(
    { roles: step.approvers.roles, userIds: step.approvers.userIds },
    user
  );
}

export function editorModeForFlowStep(
  step: ExpenseFlowResolvedStep | null,
  indexInActivePath = 0
): "manager" | "hr" | "finance" | null {
  if (!step) return null;
  if (step.isFinalPayout) return "finance";
  if (indexInActivePath === 0) return "manager";
  return "hr";
}

export async function saveExpenseApprovalFlowSteps(input: {
  steps: ExpenseFlowStepConfig[];
  updatedById: string;
}) {
  await ensureDefaultExpenseApprovalFlow();
  await prisma.$transaction(async (tx) => {
    await tx.expenseApprovalFlowStep.deleteMany({ where: { flowId: FLOW_ID } });
    await tx.expenseApprovalFlowStep.createMany({
      data: input.steps.map((s, i) => ({
        flowId: FLOW_ID,
        sortOrder: i,
        name: s.name,
        kind: "ROLE_POOL",
        mappings: s.mappings,
        isFinalPayout: s.isFinalPayout,
        roleKeys: [],
        userIds: [],
        roleMappings: [],
        applicantRoles: [],
        applicantUserIds: [],
        approverRoles: [],
        approverUserIds: [],
        approverSkip: false,
      })),
    });
    await tx.expenseApprovalFlow.update({
      where: { id: FLOW_ID },
      data: { updatedById: input.updatedById },
    });
  });
}

/** @deprecated */
export function superiorApproverRolesFromMappings(): UserRole[] {
  return [];
}

/** @deprecated */
export function statusForFlowStep(
  step: ExpenseFlowResolvedStep
): ExpenseClaimStatus {
  return statusForActiveStep(step, step.isFinalPayout ? 1 : 0);
}
