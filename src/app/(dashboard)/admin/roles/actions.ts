"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/session";
import {
  ALL_ROLES,
  PERMISSION_DEFS,
  isPermissionKey,
} from "@/lib/rbac/permission-keys";
import {
  clearPermissionCache,
  ensureDefaultRolePermissions,
} from "@/lib/rbac/has-permission";
import { staffCategoryForRole } from "@/lib/wecom/access-request";
import { StaffCategory } from "@prisma/client";

async function requireRolesAdmin() {
  return requireRole(["ADMIN"]);
}

export async function saveRolePermissions(
  role: UserRole,
  enabledKeys: string[]
): Promise<ActionResult> {
  try {
    await requireRolesAdmin();
    if (!ALL_ROLES.includes(role)) return { error: "无效角色" };

    await ensureDefaultRolePermissions();
    const enabledSet = new Set(enabledKeys.filter(isPermissionKey));

    for (const def of PERMISSION_DEFS) {
      let enabled = enabledSet.has(def.key);
      if (role === "ADMIN" && def.lockedForAdmin) {
        enabled = true;
      }
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey: def.key } },
        create: { role, permissionKey: def.key, enabled },
        update: { enabled },
      });
    }

    clearPermissionCache();
    revalidatePath("/admin/settings");
    return {};
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "保存失败" };
  }
}

export async function updateUserRoleQuick(
  userId: string,
  role: UserRole
): Promise<ActionResult> {
  try {
    const session = await requireRolesAdmin();
    if (!ALL_ROLES.includes(role)) return { error: "无效角色" };
    if (!userId) return { error: "缺少用户" };

    if (userId === session.user.id && role !== "ADMIN") {
      return { error: "不能取消自己的管理员角色" };
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      include: { personnelProfile: true },
    });
    if (!existing) return { error: "用户不存在" };

    const staffCategory = staffCategoryForRole(role);
    const canImplementation = staffCategory === StaffCategory.IMPLEMENTATION;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          role,
          includeInTeamPerformance: role !== "OTHER",
          includeInMonthlyAssessment: role !== "OTHER",
        },
      });
      if (existing.personnelProfile) {
        await tx.personnelProfile.update({
          where: { userId },
          data: {
            staffCategory,
            isPresales: canImplementation ? existing.personnelProfile.isPresales : false,
            dailyRate: canImplementation ? existing.personnelProfile.dailyRate : null,
          },
        });
      }
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/users");
    return {};
  } catch (error) {
    if (error instanceof Error) return { error: error.message };
    return { error: "更新失败" };
  }
}
