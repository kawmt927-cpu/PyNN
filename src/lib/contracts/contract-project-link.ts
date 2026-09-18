import type { ContractStatus, UserRole } from "@prisma/client";
import { isSignedContractStatus } from "@/lib/contracts/access";

/** 已签合同是否展示「无关联项目 / 已关联项目」标签 */
export function shouldShowContractProjectLinkBadge(status: ContractStatus) {
  return isSignedContractStatus(status) && status !== "TERMINATED";
}

/** 管理员、销售管理可点「已关联项目」查看进度（进合同详情项目区） */
export function canOpenContractProjectProgress(role: UserRole) {
  return role === "ADMIN" || role === "SALES_MANAGER";
}

export function contractProjectLinkLabel(hasProject: boolean) {
  return hasProject ? "已关联项目" : "无关联项目";
}
