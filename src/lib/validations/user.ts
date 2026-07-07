import { z } from "zod";
import { UserRole } from "@prisma/client";

export const userRoleSchema = z.nativeEnum(UserRole);

export const createUserSchema = z.object({
  name: z.string().min(1, "请输入姓名"),
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(6, "密码至少 6 位"),
  role: userRoleSchema,
  enabled: z.boolean().optional(),
  isPresales: z.boolean().optional(),
  dailyRate: z.coerce.number().min(0).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, "请输入姓名"),
  email: z.string().email("邮箱格式不正确"),
  password: z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined))
    .refine((v) => v === undefined || v.length >= 6, { message: "密码至少 6 位" }),
  role: userRoleSchema,
  enabled: z.boolean().optional(),
  isPresales: z.boolean().optional(),
  dailyRate: z.coerce.number().min(0).optional(),
});

export function parseUserFormData(formData: FormData, mode: "create" | "update") {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: (formData.get("password") as string) || undefined,
    role: formData.get("role"),
    enabled: formData.get("enabled") === "on",
    isPresales: formData.get("isPresales") === "on",
    dailyRate: formData.get("dailyRate") || undefined,
  };

  if (mode === "create") {
    return createUserSchema.parse({ ...raw, password: formData.get("password") });
  }

  return updateUserSchema.parse(raw);
}
