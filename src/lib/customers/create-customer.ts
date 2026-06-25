import { UserRole } from "@prisma/client";
import { canManageCustomerOwner } from "@/lib/customers/access";
import { assertCustomerNameAvailable } from "@/lib/customers/duplicate-name";
import { prisma } from "@/lib/prisma";
import type { CustomerFormInput } from "@/lib/validations/customer";
import { requireCustomerGrade } from "@/lib/customers/grade";
import { replaceCustomerTags } from "@/lib/customers/tags";

async function validateCustomerConfigFields(data: {
  source?: string | null;
  customerType?: string | null;
  customerGrade?: string | null;
}) {
  const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
  if (!data.customerType?.trim()) {
    throw new Error("请选择关系类型");
  }
  return {
    source: await assertConfigValue(CONFIG_CATEGORY.CUSTOMER_SOURCE, data.source),
    customerType: await assertConfigValue(CONFIG_CATEGORY.CUSTOMER_TYPE, data.customerType),
    customerGrade: requireCustomerGrade(data.customerGrade),
  };
}

function resolveOwnerId(role: UserRole, userId: string, ownerId: string | null | undefined) {
  if (role === "SALES") return userId;
  if (canManageCustomerOwner(role) && ownerId) return ownerId;
  if (canManageCustomerOwner(role)) return null;
  return userId;
}

export async function createCustomerRecord(
  role: UserRole,
  userId: string,
  data: CustomerFormInput
) {
  const configFields = await validateCustomerConfigFields(data);

  await assertCustomerNameAvailable(data.name);

  const customer = await prisma.customer.create({
    data: {
      name: data.name.trim(),
      category: data.category,
      hospitalLevel: data.category === "HOSPITAL" ? data.hospitalLevel ?? undefined : undefined,
      province: data.province?.trim() || undefined,
      city: data.city?.trim() || undefined,
      district: data.district?.trim() || undefined,
      bedCount: data.category === "HOSPITAL" ? data.bedCount ?? undefined : undefined,
      existingSystem: data.existingSystem?.trim() || undefined,
      source: configFields.source,
      customerType: configFields.customerType,
      customerGrade: configFields.customerGrade,
      notes: data.notes?.trim() || undefined,
      ownerId: resolveOwnerId(role, userId, data.ownerId),
    },
    select: { id: true, name: true, customerGrade: true },
  });

  await replaceCustomerTags(customer.id, data.tagValues ?? []);
  return customer;
}
