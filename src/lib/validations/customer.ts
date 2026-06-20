import { z } from "zod";

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
  customerType: z.string().optional().nullable(),
  customerGrade: z.string().optional().nullable(),
  notes: z.string().optional(),
  ownerId: z.string().optional().nullable(),
});

export type CustomerFormInput = z.infer<typeof customerFormSchema>;

export const followUpFormSchema = z.object({
  customerId: z.string().min(1),
  method: z.enum(["PHONE", "WECHAT", "FACE_VISIT", "ONLINE_MEETING", "OTHER"]),
  content: z.string().min(1, "请填写跟进内容"),
  result: z.string().optional(),
  followUpAt: z.string().min(1),
  nextFollowUpAt: z.string().optional().nullable(),
  suggestedGrade: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  location: z.string().optional(),
  department: z.string().optional(),
  companions: z.string().optional(),
  detailedNotes: z.string().optional(),
});

export const contactFormSchema = z.object({
  customerId: z.string().min(1),
  name: z.string().min(1, "请输入联系人姓名"),
  title: z.string().optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  role: z.enum(["DECISION_MAKER", "TECHNICAL", "OTHER"]),
  isPrimary: z.enum(["true", "false"]).optional(),
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
