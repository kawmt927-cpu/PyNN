import { z } from "zod";
import { SALES_LOG_METHODS } from "@/lib/sales-log/methods";

export const CHECK_IN_MODES = ["without_customer", "interaction"] as const;
export type CheckInMode = (typeof CHECK_IN_MODES)[number];

/** @deprecated 兼容旧值 */
export const LEGACY_CHECK_IN_MODE_WITH_CUSTOMER = "with_customer" as const;

export function normalizeCheckInMode(mode: string | null | undefined): CheckInMode {
  if (mode === "without_customer") return "without_customer";
  return "interaction";
}

export const checkInFollowUpSchema = z.object({
  method: z.enum(SALES_LOG_METHODS),
  content: z.string().min(1, "请填写往来内容"),
  result: z.string().optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  detailedNotes: z.string().optional().nullable(),
});

export const checkInFormSchema = z
  .object({
    checkInMode: z
      .enum([...CHECK_IN_MODES, LEGACY_CHECK_IN_MODE_WITH_CUSTOMER])
      .default("interaction"),
    customerId: z.string().optional().nullable(),
    contactId: z.string().optional().nullable(),
    latitude: z.coerce.number().optional().nullable(),
    longitude: z.coerce.number().optional().nullable(),
    locationText: z.string().min(1, "请先获取定位并解析地址"),
    addressProvince: z.string().optional().nullable(),
    addressCity: z.string().optional().nullable(),
    addressDistrict: z.string().optional().nullable(),
    addressStreet: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    completeInteractionNow: z.boolean().optional().default(false),
    followUp: checkInFollowUpSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const mode = normalizeCheckInMode(data.checkInMode);
    if (mode === "interaction" && !data.customerId?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "请选择客户", path: ["customerId"] });
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

export const manualLogFormSchema = z.object({
  customerId: z.string().min(1, "请选择客户"),
  contactId: z.string().optional().nullable(),
  method: z.enum(SALES_LOG_METHODS),
  content: z.string().min(1, "请填写往来内容"),
  result: z.string().optional().nullable(),
  followUpAt: z.string().min(1, "请选择往来时间"),
  nextFollowUpAt: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  detailedNotes: z.string().optional().nullable(),
});
