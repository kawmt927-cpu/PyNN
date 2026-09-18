import { Prisma, UserRole, type ProjectMemberAccess } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { implementationStaffListWhere } from "@/lib/personnel/access";
import { hasPermissionSync } from "@/lib/rbac/has-permission";

/** 可打开项目页的成员访问档 */
const OPENABLE_ACCESS: ProjectMemberAccess[] = ["VIEW", "EDIT"];

function memberOpenableClause(userId: string): Prisma.ProjectWhereInput {
  return {
    members: {
      some: {
        userId,
        accessLevel: { in: OPENABLE_ACCESS },
      },
    },
  };
}

export function buildProjectListWhere(
  role: UserRole,
  userId: string
): Prisma.ProjectWhereInput {
  if (hasPermissionSync(role, "projects.admin")) return {};

  // 销售经理：组合看板只读穿透到项目详情
  if (role === "SALES_MANAGER") return {};

  if (role === "PROJECT_MANAGER") {
    return {
      OR: [
        { projectManagerId: userId },
        { members: { some: { userId, isProjectManager: true } } },
        memberOpenableClause(userId),
      ],
    };
  }

  if (role === "PROJECT_STAFF" || hasPermissionSync(role, "nav.projects")) {
    return memberOpenableClause(userId);
  }

  return { id: "__none__" };
}

/** 项目组合看板：项目管理员 / 管理员 / 销售经理（只读） */
export function canAccessProjectPortfolio(role: UserRole): boolean {
  return (
    hasPermissionSync(role, "projects.admin") || role === "SALES_MANAGER"
  );
}

export async function getProjectForUser(projectId: string, role: UserRole, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, ...buildProjectListWhere(role, userId) },
  });
}

export function canManageProject(
  role: UserRole,
  userId: string,
  project: { projectManagerId: string | null }
): boolean {
  if (hasPermissionSync(role, "projects.admin")) return true;
  if (role === "PROJECT_MANAGER") return project.projectManagerId === userId;
  return false;
}

/** 可编辑项目内容：管理者，或被授予 EDIT */
export function canEditProjectContent(
  role: UserRole,
  userId: string,
  project: { projectManagerId: string | null },
  accessLevel: ProjectMemberAccess | null | undefined
): boolean {
  if (canManageProject(role, userId, project)) return true;
  return accessLevel === "EDIT";
}

export async function getProjectMemberAccessLevel(
  projectId: string,
  userId: string
): Promise<ProjectMemberAccess | null> {
  const row = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { accessLevel: true },
  });
  return row?.accessLevel ?? null;
}

/** 手动新建项目：管理员、项目管理员 */
export function canCreateProject(role: UserRole): boolean {
  return hasPermissionSync(role, "projects.admin");
}

/** 删除项目：仅管理员、项目管理员 */
export function canDeleteProject(role: UserRole): boolean {
  return hasPermissionSync(role, "projects.admin");
}

/**
 * 可出现在项目排班/成员人选中的角色。
 * 「其他」仅计人员成本，不参与项目排班与成员分配。
 */
export function canBeScheduledOnProjects(role: UserRole): boolean {
  return role === "PROJECT_MANAGER" || role === "PROJECT_STAFF";
}

/** Prisma where：在职的项目经理/项目人员（可新排班） */
export function projectSchedulableStaffWhere(): Prisma.UserWhereInput {
  return implementationStaffListWhere({ activeOnly: true });
}

/** 资源排班：项目管理员、项目经理、管理员（不含普通项目人员） */
export function canAccessResourceSchedule(role: UserRole): boolean {
  return hasPermissionSync(role, "projects.schedule");
}

export const PROJECT_MEMBER_ACCESS_LABELS: Record<ProjectMemberAccess, string> = {
  NONE: "不可打开",
  VIEW: "可查看",
  EDIT: "可编辑",
};
