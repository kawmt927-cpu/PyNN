import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SALES_FUNCTION_ROLES } from "@/lib/sales/team-performance";

/** 下拉候选：销售功能角色且人事档案已启用 */
export function enabledSalesTeamMemberWhere(
  roles: UserRole[] = SALES_FUNCTION_ROLES
): Prisma.UserWhereInput {
  return {
    role: { in: roles },
    personnelProfile: { enabled: true },
  };
}

export type SalesSelectUser = { id: string; name: string };

/** 下拉排序：普通销售 → 销售管理 → 管理员，同角色按姓名 */
const SALES_SELECT_ROLE_ORDER: Partial<Record<UserRole, number>> = {
  SALES: 0,
  SALES_MANAGER: 1,
  ADMIN: 2,
};

function sortSalesUsersForSelect<T extends { name: string; role: UserRole }>(users: T[]): T[] {
  return [...users].sort((a, b) => {
    const roleDiff =
      (SALES_SELECT_ROLE_ORDER[a.role] ?? 99) - (SALES_SELECT_ROLE_ORDER[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

type ListSalesUsersForSelectOptions = {
  /** 限制角色；默认销售 / 销管 / 管理员 */
  roles?: UserRole[];
  /**
   * 查看者：普通销售仅返回自己；销管/管理员返回团队内全部启用人员。
   * 不传则返回 roles 下全部启用人员。
   */
  viewer?: { id: string; role: UserRole };
  /** 编辑时强制保留当前人选（即使已停用），避免下拉空白 */
  includeUserIds?: string[];
};

/**
 * 表单「负责销售」等下拉候选。
 * - 永不列出已停用人员（除非在 includeUserIds 中强制保留）
 * - 普通销售只能选自己
 * - 管理员 / 销售管理可选销售团队内全部启用人员
 * - 排序：普通销售 → 销售管理 → 管理员
 */
export async function listSalesUsersForSelect(
  options: ListSalesUsersForSelectOptions = {}
): Promise<SalesSelectUser[]> {
  const roles = options.roles ?? SALES_FUNCTION_ROLES;
  const includeUserIds = [...new Set((options.includeUserIds ?? []).filter(Boolean))];
  const viewer = options.viewer;

  if (viewer?.role === "SALES") {
    const self = await prisma.user.findFirst({
      where: { id: viewer.id },
      select: { id: true, name: true },
    });
    return self ? [self] : [];
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        enabledSalesTeamMemberWhere(roles),
        ...(includeUserIds.length > 0 ? [{ id: { in: includeUserIds } }] : []),
      ],
    },
    select: { id: true, name: true, role: true },
  });

  return sortSalesUsersForSelect(users).map(({ id, name }) => ({ id, name }));
}

/** 校验负责人是否为启用的销售团队成员（普通销售仅允许本人） */
export async function assertSelectableSalesOwner(
  role: UserRole,
  actorUserId: string,
  ownerId: string,
  allowedRoles: UserRole[] = SALES_FUNCTION_ROLES
) {
  if (role === "SALES") {
    if (ownerId !== actorUserId) {
      throw new Error("普通销售只能选择自己作为负责人");
    }
    return;
  }

  const owner = await prisma.user.findFirst({
    where: {
      id: ownerId,
      role: { in: allowedRoles },
      personnelProfile: { enabled: true },
    },
    select: { id: true },
  });
  if (!owner) {
    throw new Error("负责销售无效或已停用");
  }
}
