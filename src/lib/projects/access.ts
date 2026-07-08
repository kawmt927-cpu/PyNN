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
