import { z } from "zod";

function trimOptional(value: unknown) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || undefined;
}


export const contactFormSchema = z
  .object({
    customerId: z.string().min(1),
    name: z.string().min(1, "请输入联系人姓名"),
    title: z.preprocess(trimOptional, z.string().optional()),
    department: z.preprocess(trimOptional, z.string().optional()),
    phone: z.preprocess(trimOptional, z.string().optional()),
    wechat: z.preprocess(trimOptional, z.string().optional()),
    role: z.string().min(1, "请选择角色"),
    isPrimary: z.enum(["true", "false"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.phone && !data.wechat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "手机和微信至少填写一项",
        path: ["phone"],
      });
    }
  });

export const quickContactSchema = z
  .object({
    name: z.string().min(1, "请输入联系人姓名"),
    title: z.preprocess(trimOptional, z.string().optional()),
    department: z.preprocess(trimOptional, z.string().optional()),
    phone: z.preprocess(trimOptional, z.string().optional()),
    wechat: z.preprocess(trimOptional, z.string().optional()),
    role: z.string().min(1, "请选择角色").default("OTHER"),
  })
  .superRefine((data, ctx) => {
    if (!data.phone && !data.wechat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "手机和微信至少填写一项",
        path: ["phone"],
      });
    }
  });
