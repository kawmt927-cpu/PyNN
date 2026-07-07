"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { contactFormSchema } from "@/lib/validations/contact";
import {
  assertCustomerContentWriteAccess,
  getCustomerForUser,
} from "@/lib/customers/access";

function formatActionError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "表单校验失败" };
  }
  if (error instanceof Error) {
    return { error: error.message };
  }
  return { error: "操作失败，请重试" };
}

function parseContactFormData(formData: FormData) {
  return contactFormSchema.parse({
    customerId: formData.get("customerId"),
    name: formData.get("name"),
    title: formData.get("title") || undefined,
    department: formData.get("department") || undefined,
    phone: formData.get("phone") || undefined,
    wechat: formData.get("wechat") || undefined,
    role: formData.get("role"),
    isPrimary: formData.has("isPrimary") && formData.get("isPrimary") === "true" ? "true" : "false",
  });
}

export async function createContact(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseContactFormData(formData);

    const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
    const role = await assertConfigValue(CONFIG_CATEGORY.CONTACT_ROLE, parsed.role);
    if (!role) throw new Error("请选择角色");

    const customer = await getCustomerForUser(
      parsed.customerId,
      session.user.role,
      session.user.id
    );
    if (!customer) throw new Error("无权访问该客户");
    await assertCustomerContentWriteAccess(session.user.role, session.user.id, customer);

    const isPrimary = parsed.isPrimary === "true";

    await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.contact.updateMany({
          where: { customerId: parsed.customerId },
          data: { isPrimary: false },
        });
      }
      await tx.contact.create({
        data: {
          customerId: parsed.customerId,
          name: parsed.name,
          title: parsed.title,
          department: parsed.department,
          phone: parsed.phone,
          wechat: parsed.wechat,
          role,
          isPrimary,
        },
      });
    });

    revalidatePath(`/customers/${parsed.customerId}`);
    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function updateContact(contactId: string, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseContactFormData(formData);

    const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
    const role = await assertConfigValue(CONFIG_CATEGORY.CONTACT_ROLE, parsed.role);
    if (!role) throw new Error("请选择角色");

    const customer = await getCustomerForUser(
      parsed.customerId,
      session.user.role,
      session.user.id
    );
    if (!customer) throw new Error("无权访问该客户");
    await assertCustomerContentWriteAccess(session.user.role, session.user.id, customer);

    const isPrimary = parsed.isPrimary === "true";

    await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.contact.updateMany({
          where: { customerId: parsed.customerId, id: { not: contactId } },
          data: { isPrimary: false },
        });
      }
      await tx.contact.update({
        where: { id: contactId },
        data: {
          name: parsed.name,
          title: parsed.title,
          department: parsed.department,
          phone: parsed.phone,
          wechat: parsed.wechat,
          role,
          isPrimary,
        },
      });
    });

    revalidatePath(`/customers/${parsed.customerId}`);
    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function deleteContact(formData: FormData): Promise<void> {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const contactId = String(formData.get("contactId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!contactId || !customerId) throw new Error("参数不完整");

  const customer = await getCustomerForUser(customerId, session.user.role, session.user.id);
  if (!customer) throw new Error("无权访问该客户");
  await assertCustomerContentWriteAccess(session.user.role, session.user.id, customer);

  const existing = await prisma.contact.findFirst({
    where: { id: contactId, customerId },
    select: { id: true },
  });
  if (!existing) throw new Error("联系人不存在或已删除");

  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath(`/customers/${customerId}`);
}

export async function createContactFormAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return createContact(formData);
}

export async function updateContactFormAction(
  contactId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  return updateContact(contactId, formData);
}
