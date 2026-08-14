import { UserRole } from "@prisma/client";
import { canManageCustomerOwner, CUSTOMER_ASSIGNABLE_ROLES } from "@/lib/customers/access";
import { assertCustomerNameAvailable } from "@/lib/customers/duplicate-name";
import { prisma } from "@/lib/prisma";
import type { CustomerFormInput } from "@/lib/validations/customer";
import {
  enforceCustomerTypeForCategory,
  requireCustomerGradeForType,
} from "@/lib/customers/customer-type-grade";
import { replaceCustomerTags } from "@/lib/customers/tags";
import { assertSelectableSalesOwner } from "@/lib/sales/selectable-users";

async function validateCustomerConfigFields(data: {
  category: string;
  source?: string | null;
  customerType?: string | null;
  customerGrade?: string | null;
  channelKind?: string | null;
}) {
  const { CONFIG_CATEGORY, assertConfigValue, getConfigOptions } = await import(
    "@/lib/config-options"
  );
  const { resolveChannelKindForCustomer } = await import("@/lib/customers/channel-kind");
  const typeOptions = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  const enforcedType = enforceCustomerTypeForCategory(
    data.category,
    data.customerType,
    typeOptions
  );
  if (!enforcedType) {
    throw new Error("请选择关系类型");
  }
  const customerType = await assertConfigValue(CONFIG_CATEGORY.CUSTOMER_TYPE, enforcedType);
  return {
    source: await assertConfigValue(CONFIG_CATEGORY.CUSTOMER_SOURCE, data.source),
    customerType,
    customerGrade: requireCustomerGradeForType(customerType, data.customerGrade, typeOptions),
    channelKind: await resolveChannelKindForCustomer({
      customerType,
      channelKind: data.channelKind,
      typeOptions,
    }),
  };
}

async function resolveOwnerId(role: UserRole, userId: string, ownerId: string | null | undefined) {
  if (role === "SALES") return userId;
  if (canManageCustomerOwner(role) && ownerId) {
    await assertSelectableSalesOwner(role, userId, ownerId, CUSTOMER_ASSIGNABLE_ROLES);
    return ownerId;
  }
  if (canManageCustomerOwner(role)) return null;
  return userId;
}

export async function createCustomerRecord(
  role: UserRole,
  userId: string,
  data: Omit<CustomerFormInput, "assistantOwnerIds"> & { assistantOwnerIds?: string[] }
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
      channelKind: configFields.channelKind,
      notes: data.notes?.trim() || undefined,
      ownerId: await resolveOwnerId(role, userId, data.ownerId),
    },
    select: { id: true, name: true, customerGrade: true },
  });

  await replaceCustomerTags(customer.id, data.tagValues ?? []);

  const { recordEntityOperation, ENTITY_TYPES } = await import(
    "@/lib/audit/entity-operation-log"
  );
  await recordEntityOperation({
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customer.id,
    userId,
    action: "创建",
    summary: `创建客户「${customer.name}」`,
  });

  return customer;
}
