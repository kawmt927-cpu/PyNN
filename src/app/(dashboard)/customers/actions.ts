"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { customerFormSchema, followUpFormSchema, contactFormSchema, customerRelationSchema } from "@/lib/validations/customer";
import { canManageCustomerOwner, getCustomerForUser } from "@/lib/customers/access";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";

function parseOwnerField(raw: FormDataEntryValue | null): string | null {
  const value = raw?.toString().trim() ?? "";
  if (!value || value === POOL_OWNER_VALUE) return null;
  return value;
}

function parseBedCount(raw: FormDataEntryValue | null): number | null {
  const value = raw?.toString().trim() ?? "";
  if (!value) return null;
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.floor(n);
}

function parseOptionalField(raw: FormDataEntryValue | null): string | null {
  const value = raw?.toString().trim() ?? "";
  return value || null;
}

function parseCustomerForm(formData: FormData) {
  const category = formData.get("category") as string;
  const hospitalLevelRaw = formData.get("hospitalLevel");
  const bedCountRaw = formData.get("bedCount");

  return customerFormSchema.parse({
    name: formData.get("name"),
    category,
    hospitalLevel:
      category === "HOSPITAL" && hospitalLevelRaw?.toString().trim()
        ? hospitalLevelRaw.toString().trim()
        : null,
    province: formData.get("province") || undefined,
    city: formData.get("city") || undefined,
    district: formData.get("district") || undefined,
    bedCount: category === "HOSPITAL" ? parseBedCount(bedCountRaw) : null,
    existingSystem: formData.get("existingSystem") || undefined,
    source: parseOptionalField(formData.get("source")),
    customerType: parseOptionalField(formData.get("customerType")),
    customerGrade: parseOptionalField(formData.get("customerGrade")),
    notes: formData.get("notes") || undefined,
    ownerId: parseOwnerField(formData.get("ownerId")),
  });
}

async function validateCustomerConfigFields(data: {
  source?: string | null;
  customerType?: string | null;
  customerGrade?: string | null;
}) {
  const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
  return {
    source: await assertConfigValue(CONFIG_CATEGORY.CUSTOMER_SOURCE, data.source),
    customerType: await assertConfigValue(CONFIG_CATEGORY.CUSTOMER_TYPE, data.customerType),
    customerGrade: await assertConfigValue(CONFIG_CATEGORY.CUSTOMER_GRADE, data.customerGrade),
  };
}

function formatActionError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "表单校验失败" };
  }
  if (error instanceof Error) {
    return { error: error.message };
  }
  return { error: "操作失败，请重试" };
}

function resolveOwnerId(role: UserRole, userId: string, ownerId: string | null | undefined) {
  if (role === "SALES") return userId;
  if (canManageCustomerOwner(role) && ownerId) return ownerId;
  if (canManageCustomerOwner(role)) return null;
  return userId;
}

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const data = parseCustomerForm(formData);
    const configFields = await validateCustomerConfigFields(data);

    const customer = await prisma.customer.create({
      data: {
        name: data.name,
        category: data.category,
        hospitalLevel: data.hospitalLevel ?? undefined,
        province: data.province,
        city: data.city,
        district: data.district,
        bedCount: data.bedCount ?? undefined,
        existingSystem: data.existingSystem,
        source: configFields.source,
        customerType: configFields.customerType,
        customerGrade: configFields.customerGrade,
        notes: data.notes,
        ownerId: resolveOwnerId(session.user.role, session.user.id, data.ownerId),
      },
    });

    revalidatePath("/customers");
    return { redirectTo: `/customers/${customer.id}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function updateCustomer(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const existing = await getCustomerForUser(id, session.user.role, session.user.id);
    if (!existing) return { error: "无权访问该客户" };

    const data = parseCustomerForm(formData);
    const configFields = await validateCustomerConfigFields(data);
    const ownerId = canManageCustomerOwner(session.user.role)
      ? resolveOwnerId(session.user.role, session.user.id, data.ownerId)
      : existing.ownerId;

    await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        category: data.category,
        hospitalLevel: data.category === "HOSPITAL" ? (data.hospitalLevel ?? undefined) : null,
        province: data.province,
        city: data.city,
        district: data.district,
        bedCount: data.bedCount ?? undefined,
        existingSystem: data.existingSystem,
        source: configFields.source,
        customerType: configFields.customerType,
        customerGrade: configFields.customerGrade,
        notes: data.notes,
        ownerId,
      },
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { redirectTo: `/customers/${id}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function createFollowUp(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const parsed = followUpFormSchema.parse({
    customerId: formData.get("customerId"),
    method: formData.get("method"),
    content: formData.get("content"),
    result: formData.get("result") || undefined,
    followUpAt: formData.get("followUpAt"),
    nextFollowUpAt: formData.get("nextFollowUpAt") || null,
    suggestedGrade: formData.get("suggestedGrade") || null,
    applyGrade: formData.get("applyGrade") || "false",
    contactId: formData.get("contactId") || null,
    location: formData.get("location") || undefined,
    department: formData.get("department") || undefined,
    companions: formData.get("companions") || undefined,
    detailedNotes: formData.get("detailedNotes") || undefined,
  });

  const customer = await getCustomerForUser(
    parsed.customerId,
    session.user.role,
    session.user.id
  );
  if (!customer) throw new Error("无权访问该客户");

  const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
  const suggestedGrade = await assertConfigValue(
    CONFIG_CATEGORY.CUSTOMER_GRADE,
    parsed.suggestedGrade
  );
  const applyGrade = parsed.applyGrade === "true" && suggestedGrade;

  await prisma.$transaction(async (tx) => {
    const followUp = await tx.followUp.create({
      data: {
        customerId: parsed.customerId,
        contactId: parsed.contactId || undefined,
        userId: session.user.id,
        method: parsed.method,
        content: parsed.content,
        result: parsed.result,
        followUpAt: new Date(parsed.followUpAt),
        nextFollowUpAt: parsed.nextFollowUpAt ? new Date(parsed.nextFollowUpAt) : undefined,
        suggestedGrade: suggestedGrade ?? undefined,
        gradeApplied: Boolean(applyGrade),
      },
    });

    if (parsed.method === "FACE_VISIT" && parsed.location && parsed.detailedNotes) {
      await tx.faceVisitDetail.create({
        data: {
          followUpId: followUp.id,
          location: parsed.location,
          department: parsed.department,
          companions: parsed.companions,
          detailedNotes: parsed.detailedNotes,
        },
      });
    }

    if (applyGrade && suggestedGrade) {
      await tx.customer.update({
        where: { id: parsed.customerId },
        data: { customerGrade: suggestedGrade },
      });
    }
  });

  revalidatePath("/follow-ups");
  revalidatePath(`/customers/${parsed.customerId}`);
  redirect(`/customers/${parsed.customerId}`);
}


export async function assignCustomerToSales(formData: FormData) {
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
  const customerId = formData.get("customerId") as string;
  const salesUserId = formData.get("salesUserId") as string;
  if (!customerId || !salesUserId) throw new Error("参数不完整");

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("客户不存在");

  if (salesUserId === POOL_OWNER_VALUE) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { ownerId: null },
    });
    await prisma.customerClaimRequest.updateMany({
      where: { customerId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewerId: session.user.id,
        reviewNote: "客户已释放到公海池",
        reviewedAt: new Date(),
      },
    });
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { ownerId: salesUserId },
      });
      await tx.customerClaimRequest.updateMany({
        where: { customerId, status: "PENDING" },
        data: {
          status: "REJECTED",
          reviewerId: session.user.id,
          reviewNote: "客户已由管理员直接分配",
          reviewedAt: new Date(),
        },
      });
    });
  }

  revalidatePath("/customers");
  revalidatePath("/approvals");
  revalidatePath(`/customers/${customerId}`);
}

export async function createContact(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const parsed = contactFormSchema.parse({
    customerId: formData.get("customerId"),
    name: formData.get("name"),
    title: formData.get("title") || undefined,
    department: formData.get("department") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    role: formData.get("role"),
    isPrimary: formData.get("isPrimary") || "false",
  });

  const customer = await getCustomerForUser(
    parsed.customerId,
    session.user.role,
    session.user.id
  );
  if (!customer) throw new Error("无权访问该客户");

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
        email: parsed.email,
        role: parsed.role,
        isPrimary,
      },
    });
  });

  revalidatePath(`/customers/${parsed.customerId}`);
}

export async function updateContact(contactId: string, formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const parsed = contactFormSchema.parse({
    customerId: formData.get("customerId"),
    name: formData.get("name"),
    title: formData.get("title") || undefined,
    department: formData.get("department") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    role: formData.get("role"),
    isPrimary: formData.get("isPrimary") || "false",
  });

  const customer = await getCustomerForUser(
    parsed.customerId,
    session.user.role,
    session.user.id
  );
  if (!customer) throw new Error("无权访问该客户");

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
        email: parsed.email,
        role: parsed.role,
        isPrimary,
      },
    });
  });

  revalidatePath(`/customers/${parsed.customerId}`);
}

export async function deleteContact(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const contactId = formData.get("contactId") as string;
  const customerId = formData.get("customerId") as string;
  if (!contactId || !customerId) throw new Error("参数不完整");

  const customer = await getCustomerForUser(customerId, session.user.role, session.user.id);
  if (!customer) throw new Error("无权访问该客户");

  await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath(`/customers/${customerId}`);
}

export async function addCustomerRelation(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const parsed = customerRelationSchema.parse({
    customerId: formData.get("customerId"),
    relatedCustomerId: formData.get("relatedCustomerId"),
    relationNote: formData.get("relationNote") || undefined,
  });

  if (parsed.customerId === parsed.relatedCustomerId) {
    throw new Error("不能关联自身");
  }

  const customer = await getCustomerForUser(
    parsed.customerId,
    session.user.role,
    session.user.id
  );
  if (!customer) throw new Error("无权访问该客户");

  await prisma.customerRelation.create({
    data: {
      customerId: parsed.customerId,
      relatedCustomerId: parsed.relatedCustomerId,
      relationNote: parsed.relationNote,
    },
  });

  revalidatePath(`/customers/${parsed.customerId}`);
}

export async function removeCustomerRelation(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const relationId = formData.get("relationId") as string;
  const customerId = formData.get("customerId") as string;
  if (!relationId || !customerId) throw new Error("参数不完整");

  const customer = await getCustomerForUser(customerId, session.user.role, session.user.id);
  if (!customer) throw new Error("无权访问该客户");

  await prisma.customerRelation.delete({ where: { id: relationId } });
  revalidatePath(`/customers/${customerId}`);
}
