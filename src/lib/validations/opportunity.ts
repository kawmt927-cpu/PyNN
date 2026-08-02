import { z } from "zod";
import { expectedCloseMonthSchema } from "@/lib/opportunities/expected-close-date";

export const opportunityFormSchema = z.object({
  title: z.string().min(1, "请输入商机名称"),
  customerId: z.string().optional(),
  customerMode: z.enum(["existing", "new"]),
  expectedAmount: z.coerce.number().positive("预计金额须大于 0"),
  expectedCloseDate: expectedCloseMonthSchema,
  stage: z.string().min(1, "请选择商机阶段"),
  grade: z.string().min(1, "请选择商机等级"),
  requirementDesc: z.string().optional(),
  winProbability: z.coerce.number().int().min(0).max(100).optional().nullable(),
  competitor: z.string().optional(),
  notes: z.string().optional(),
  ownerId: z.string().optional().nullable(),
});

export const opportunityFollowUpSchema = z.object({
  opportunityId: z.string().min(1),
  followUpId: z.string().optional(),
  method: z.enum(["PHONE", "WECHAT", "FACE_VISIT", "ONLINE_MEETING", "OTHER"]),
  content: z.string().min(1, "请填写跟进内容"),
  followUpAt: z.string().min(1),
  nextFollowUpAt: z.string().optional().nullable(),
  expectedAmount: z.coerce.number().positive("预计金额须大于 0"),
  expectedCloseDate: expectedCloseMonthSchema,
  stage: z.string().min(1, "请选择商机阶段"),
  requirementDesc: z.string().optional(),
  winProbability: z.coerce.number().int().min(0).max(100).optional().nullable(),
  competitor: z.string().optional(),
  notes: z.string().optional(),
});

export const opportunityStatusSchema = z.enum(["NOT_SIGNED", "SIGNED", "ABANDONED"]);

export const abandonOpportunitySchema = z
  .object({
    opportunityId: z.string().min(1),
    reason: z.enum(["PRICE", "BUSINESS_RELATIONSHIP", "OPERATION_ERROR", "OTHER"]),
    note: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === "OTHER" && !data.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "选择「其他」时请填写文字说明",
        path: ["note"],
      });
    }
  });

export const restoreOpportunityStatusSchema = z.object({
  opportunityId: z.string().min(1),
});

export { contractFormSchema } from "@/lib/validations/contract";
