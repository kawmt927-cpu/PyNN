import { z } from "zod";

const followUpMethodValues = [
  "PHONE",
  "WECHAT",
  "FACE_VISIT",
  "ONLINE_MEETING",
  "OTHER",
] as const;

export const weeklyAssignmentFormSchema = z.object({
  assigneeId: z.string().min(1, "请选择销售"),
  customerId: z.string().min(1, "请选择客户"),
  opportunityId: z.string().optional(),
  contactId: z.string().optional(),
  plannedMethod: z.enum(followUpMethodValues).optional().or(z.literal("")),
  title: z.string().min(1, "请输入任务标题"),
  description: z.string().optional(),
  dueAt: z.string().min(1, "请选择截止时间"),
});
