import { z } from "zod";
import { isCustomerTagColor } from "@/lib/customers/tag-colors";
import { SALES_LOG_METHODS } from "@/lib/sales-log/methods";

export const customerFormSchema = z.object({
  name: z.string().min(1, "请输入客户名称"),
  category: z.enum(["HOSPITAL", "COMPANY", "INDIVIDUAL"]),
  hospitalLevel: z
    .enum(["GRADE_3A", "GRADE_3B", "GRADE_3", "GRADE_2A", "GRADE_2B", "GRADE_2", "OTHER"])
    .optional()
    .nullable(),
  province: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  bedCount: z.coerce.number().int().positive().optional().nullable(),
  existingSystem: z.string().optional(),
  source: z.string().optional().nullable(),
  customerType: z.string().min(1, "请选择关系类型"),
  customerGrade: z.string().min(1, "请选择客户等级"),
  tagValues: z.array(z.string()).optional(),
  notes: z.string().optional(),
  ownerId: z.string().optional().nullable(),
  assistantOwnerIds: z.array(z.string()).optional().default([]),
});

export type CustomerFormInput = z.infer<typeof customerFormSchema>;

export { contactFormSchema, quickContactSchema } from "@/lib/validations/contact";

export const followUpFormSchema = z.object({
  customerId: z.string().min(1),
  method: z.enum(SALES_LOG_METHODS),
  content: z.string().min(1, "请填写跟进内容"),
  result: z.string().optional(),
  followUpAt: z.string().min(1),
  nextFollowUpAt: z.string().optional().nullable(),
  nextFollowUpMethod: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && SALES_LOG_METHODS.includes(v as (typeof SALES_LOG_METHODS)[number]) ? v : null)),
  nextFollowUpContent: z.string().optional().nullable(),
  suggestedGrade: z.string().optional().nullable(),
  contactIds: z.array(z.string().min(1)).min(1, "请选择联系人"),
  opportunityId: z.string().optional().nullable(),
  completedPendingKeys: z.array(z.string().min(1)).optional().default([]),
});

export const customerRelationSchema = z.object({
  customerId: z.string().min(1),
  relatedCustomerId: z.string().min(1),
  relationNote: z.string().optional(),
});

export const configOptionSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1, "请输入显示名称"),
});

export const saveCustomerTagOptionsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().nullable(),
      label: z.string().min(1, "标签名称不能为空"),
      enabled: z.boolean(),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, "颜色格式无效")
        .refine(isCustomerTagColor, "请选择预设标签颜色"),
    })
  ),
});

export const saveCustomerGradeOptionsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().nullable(),
      label: z.string().min(1, "文字描述不能为空"),
      enabled: z.boolean(),
      followUpIntervalDays: z.coerce.number().int().min(1, "往来间隔至少 1 天"),
    })
  ),
});

export const saveConfigCategoryOptionsSchema = z.object({
  category: z.string().min(1),
  items: z.array(
    z.object({
      id: z.string().nullable(),
      label: z.string().min(1, "显示名称不能为空"),
      enabled: z.boolean(),
    })
  ),
});
