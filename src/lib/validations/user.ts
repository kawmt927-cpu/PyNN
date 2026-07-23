import { z } from "zod";
import { UserRole } from "@prisma/client";
import { normalizePhone, isValidCnMobile } from "@/lib/phone";

export const userRoleSchema = z.nativeEnum(UserRole);

const optionalPhone = z
  .string()
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t ? normalizePhone(t) : undefined;
  })
  .refine((v) => v === undefined || isValidCnMobile(v), {
    message: "请输入有效的 11 位手机号",
  });

const optionalEmail = z
  .string()
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim().toLowerCase();
    return t || undefined;
  })
  .refine((v) => v === undefined || z.string().email().safeParse(v).success, {
    message: "邮箱格式不正确",
  });

const optionalPassword = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined))
  .refine((v) => v === undefined || v.length >= 6, { message: "密码至少 6 位" });

const optionalWecomId = z
  .string()
  .optional()
  .transform((v) => {
    const t = (v ?? "").trim();
    return t || undefined;
  });

export const createUserSchema = z.object({
  name: z.string().min(1, "请输入姓名"),
  phone: optionalPhone,
  email: optionalEmail,
  wecomUserId: optionalWecomId,
  password: optionalPassword,
  role: userRoleSchema,
  enabled: z.boolean().optional(),
  isPresales: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, "请输入姓名"),
  phone: optionalPhone,
  email: optionalEmail,
  wecomUserId: optionalWecomId,
  password: optionalPassword,
  role: userRoleSchema,
  enabled: z.boolean().optional(),
  isPresales: z.boolean().optional(),
});

export function parseUserFormData(formData: FormData, mode: "create" | "update") {
  const raw = {
    name: formData.get("name"),
    phone: (formData.get("phone") as string) || undefined,
    email: (formData.get("email") as string) || undefined,
    wecomUserId: (formData.get("wecomUserId") as string) || undefined,
    password: (formData.get("password") as string) || undefined,
    role: formData.get("role"),
    enabled: formData.get("enabled") === "on",
    isPresales: formData.get("isPresales") === "on",
  };

  if (mode === "create") {
    return createUserSchema.parse(raw);
  }

  return updateUserSchema.parse(raw);
}
