import { z } from "zod";

export const weeklyAssignmentFormSchema = z
  .object({
    assigneeId: z.string().min(1, "请选择销售"),
    customerId: z.string().optional(),
    opportunityId: z.string().optional(),
    title: z.string().min(1, "请输入任务标题"),
    description: z.string().optional(),
    dueAt: z.string().min(1, "请选择截止时间"),
  })
  .refine((data) => Boolean(data.customerId?.trim() || data.opportunityId?.trim()), {
    message: "请指定客户或商机",
    path: ["customerId"],
  });
