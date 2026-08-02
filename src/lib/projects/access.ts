import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function buildProjectListWhere(
  role: UserRole,
  userId: string
): Prisma.ProjectWhereInput {
  if (role === "ADMIN" || role === "PROJECT_ADMIN") return {};

  if (role === "PROJECT_MANAGER") {
    return {
      OR: [
        { projectManagerId: userId },
        { members: { some: { userId, isProjectManager: true } } },
      ],
    };
  }

  if (role === "PROJECT_STAFF") {
    return { members: { some: { userId } } };
  }

  return { id: "__none__" };
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
  if (role === "ADMIN" || role === "PROJECT_ADMIN") return true;
  if (role === "PROJECT_MANAGER") return project.projectManagerId === userId;
  return false;
}

/** 手动新建项目：管理员、项目管理员 */
export function canCreateProject(role: UserRole): boolean {
  return role === "ADMIN" || role === "PROJECT_ADMIN";
}

/** 资源排班：项目管理员、项目经理、管理员（不含普通项目人员） */
export function canAccessResourceSchedule(role: UserRole): boolean {
  return role === "ADMIN" || role === "PROJECT_ADMIN" || role === "PROJECT_MANAGER";
}
