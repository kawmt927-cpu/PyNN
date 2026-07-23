import type { Prisma, UserRole } from "@prisma/client";

/** 销售功能相关角色（销售 / 销售管理 / 管理员） */
export const SALES_FUNCTION_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

/** 计入团队业绩的用户：销售功能角色 + 已启用档案 + 参与团队业绩 */
export function teamPerformanceMemberWhere(): Prisma.UserWhereInput {
  return {
    role: { in: SALES_FUNCTION_ROLES },
    includeInTeamPerformance: true,
    personnelProfile: { enabled: true },
  };
}

/** 参与月度考核的用户：销售功能角色 + 已启用档案 + 参与月度考核 */
export function monthlyAssessmentMemberWhere(): Prisma.UserWhereInput {
  return {
    role: { in: SALES_FUNCTION_ROLES },
    includeInMonthlyAssessment: true,
    personnelProfile: { enabled: true },
  };
}
