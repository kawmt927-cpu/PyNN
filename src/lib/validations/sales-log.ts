import { z } from "zod";
import { SALES_LOG_METHODS } from "@/lib/sales-log/methods";

export { quickContactSchema } from "@/lib/validations/contact";

export const CHECK_IN_MODES = ["without_customer", "interaction"] as const;
export type CheckInMode = (typeof CHECK_IN_MODES)[number];

/** @deprecated 兼容旧值 */
export const LEGACY_CHECK_IN_MODE_WITH_CUSTOMER = "with_customer" as const;

export function normalizeCheckInMode(mode: string | null | undefined): CheckInMode {
  if (mode === "without_customer") return "without_customer";
  return "interaction";
}

export function normalizeContactIds(input: {
  contactId?: string | null;
  contactIds?: string[] | null;
}): string[] {
  const fromArray = (input.contactIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (fromArray.length > 0) return [...new Set(fromArray)];
  const single = input.contactId?.trim();
  return single ? [single] : [];
}

export const checkInFollowUpSchema = z.object({
  method: z.enum(SALES_LOG_METHODS),
  content: z.string().min(1, "请填写往来内容"),
  result: z.string().optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  nextFollowUpMethod: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && SALES_LOG_METHODS.includes(v as (typeof SALES_LOG_METHODS)[number]) ? v : null)),
  nextFollowUpContent: z.string().optional().nullable(),
  suggestedGrade: z.string().optional().nullable(),
  opportunityId: z.string().optional().nullable(),
  opportunityIds: z.array(z.string().min(1)).optional(),
});

export const checkInFormSchema = z
  .object({
    checkInMode: z
      .enum([...CHECK_IN_MODES, LEGACY_CHECK_IN_MODE_WITH_CUSTOMER])
      .default("interaction"),
    customerId: z.string().optional().nullable(),
    contactId: z.string().optional().nullable(),
    contactIds: z.array(z.string().min(1)).optional().default([]),
    latitude: z.coerce.number().optional().nullable(),
    longitude: z.coerce.number().optional().nullable(),
    locationText: z.string().optional().nullable(),
    addressProvince: z.string().optional().nullable(),
    addressCity: z.string().optional().nullable(),
    addressDistrict: z.string().optional().nullable(),
    addressStreet: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    completeInteractionNow: z.boolean().optional().default(false),
    followUp: checkInFollowUpSchema.optional().nullable(),
    updateCheckInId: z.string().optional().nullable(),
    completedPendingKeys: z.array(z.string().min(1)).optional().default([]),
  })
  .superRefine((data, ctx) => {
    const mode = normalizeCheckInMode(data.checkInMode);
    if (mode === "without_customer" && !data.locationText?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请先获取定位并解析地址",
        path: ["locationText"],
      });
    }
    if (mode === "interaction" && !data.customerId?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "请选择客户", path: ["customerId"] });
    }
    if (mode === "interaction" && normalizeContactIds(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请至少选择一位联系人",
        path: ["contactIds"],
      });
    }
    if (mode === "interaction" && data.completeInteractionNow) {
      if (!data.followUp?.content?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "请填写往来内容",
          path: ["followUp", "content"],
        });
      }
    }
  });


export type CheckInFollowUpInput = z.infer<typeof checkInFollowUpSchema>;

export const completeCheckInSchema = z
  .object({
    contactId: z.string().optional().nullable(),
    contactIds: z.array(z.string().min(1)).optional().default([]),
    method: z.enum(SALES_LOG_METHODS),
    content: z.string().min(1, "请填写往来内容"),
    result: z.string().optional().nullable(),
    suggestedGrade: z.string().optional().nullable(),
    opportunityId: z.string().optional().nullable(),
    opportunityIds: z.array(z.string().min(1)).optional().default([]),
    nextFollowUpAt: z.string().optional().nullable(),
    nextFollowUpMethod: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v && SALES_LOG_METHODS.includes(v as (typeof SALES_LOG_METHODS)[number]) ? v : null)),
    nextFollowUpContent: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (normalizeContactIds(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请至少选择一位联系人",
        path: ["contactIds"],
      });
    }
  });

export const manualLogFormSchema = z.object({
  customerId: z.string().min(1, "请选择客户"),
  contactId: z.string().min(1, "请选择联系人"),
  method: z.enum(SALES_LOG_METHODS),
  content: z.string().min(1, "请填写往来内容"),
  result: z.string().optional().nullable(),
  followUpAt: z.string().min(1, "请选择往来时间"),
  suggestedGrade: z.string().optional().nullable(),
  opportunityId: z.string().optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  nextFollowUpMethod: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && SALES_LOG_METHODS.includes(v as (typeof SALES_LOG_METHODS)[number]) ? v : null)),
  nextFollowUpContent: z.string().optional().nullable(),
});

export const quickOpportunitySchema = z.object({
  customerId: z.string().min(1),
  title: z.string().min(1, "请输入商机名称"),
  stage: z.string().min(1, "请选择商机阶段"),
  expectedAmount: z.coerce.number().positive("预计金额须大于 0"),
  expectedCloseDate: z.string().min(1, "请选择预计签约月份"),
});
