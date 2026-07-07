import { revalidatePath } from "next/cache";

/** 审批相关页面与侧栏待办红点 */
export function revalidateApprovalSurfaces(customerId?: string) {
  revalidatePath("/approvals");
  revalidatePath("/customers");
  revalidatePath("/", "layout");
  if (customerId) revalidatePath(`/customers/${customerId}`);
}
