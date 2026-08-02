import { z } from "zod";

const followUpMethodValues = [
  "PHONE",
  "WECHAT",
  "FACE_VISIT",
  "ONLINE_MEETING",
  "OTHER",
] as const;

const kindValues = ["CUSTOMER_FOLLOW_UP", "GENERAL"] as const;

export const weeklyAssignmentFormSchema = z
  .object({
    kind: z.enum(kindValues).default("CUSTOMER_FOLLOW_UP"),
    assigneeId: z.string().min(1, "请选择指派人"),
    customerId: z.string().optional(),
    opportunityId: z.string().optional(),
    contactId: z.string().optional(),
    plannedMethod: z.enum(followUpMethodValues).optional().or(z.literal("")),
    title: z.string().min(1, "请输入任务标题"),
    description: z.string().optional(),
    dueAt: z.string().min(1, "请选择截止时间"),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "CUSTOMER_FOLLOW_UP" && !data.customerId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请选择客户",
        path: ["customerId"],
      });
    }
  });
