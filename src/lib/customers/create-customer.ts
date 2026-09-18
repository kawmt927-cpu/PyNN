import { UserRole } from "@prisma/client";
import { canManageCustomerOwner, CUSTOMER_ASSIGNABLE_ROLES } from "@/lib/customers/access";
import { assertCustomerNameAvailable } from "@/lib/customers/duplicate-name";
import { prisma } from "@/lib/prisma";
import type { CustomerFormInput } from "@/lib/validations/customer";
import {
  enforceCustomerTypeForCategory,
  isChannelCustomerType,
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
    typeOptions,
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
  data: Omit<CustomerFormInput, "assistantOwnerIds"> & { assistantOwnerIds?: string[] },
  options?: { skipOrgNameVerification?: boolean }
) {
  const { hasPermission } = await import("@/lib/rbac/has-permission");
  if (!(await hasPermission(role, "customers.create"))) {
    throw new Error("无权新建客户");
  }

  const configFields = await validateCustomerConfigFields(data);

  let name = data.name.trim();
  let province = data.province?.trim() || undefined;
  let city = data.city?.trim() || undefined;
  let district = data.district?.trim() || undefined;
  let hospitalLevel = data.hospitalLevel ?? undefined;
  let bedCount = data.bedCount ?? undefined;

  if (
    !options?.skipOrgNameVerification &&
    (data.category === "HOSPITAL" || data.category === "COMPANY")
  ) {
    const { requireVerifiedOrgProfile } = await import("@/lib/customers/kimi-enrich");
    const verified = await requireVerifiedOrgProfile({
      name,
      category: data.category,
      province,
      city,
      district,
      hospitalLevel: hospitalLevel ?? null,
      bedCount: bedCount ?? null,
    });
    name = verified.officialName;
    province = verified.province ?? undefined;
    city = verified.city ?? undefined;
    district = verified.district ?? undefined;
    hospitalLevel = verified.hospitalLevel ?? undefined;
    bedCount = verified.bedCount ?? undefined;
  }

  await assertCustomerNameAvailable(name);

  const isChannel = isChannelCustomerType(configFields.customerType, configFields.typeOptions);
  const nationwideChannel =
    Boolean(data.nationwideChannel) && isChannel && canManageCustomerOwner(role);

  const customer = await prisma.customer.create({
    data: {
      name,
      category: data.category,
      hospitalLevel: data.category === "HOSPITAL" ? hospitalLevel : undefined,
      province,
      city,
      district,
      bedCount: data.category === "HOSPITAL" ? bedCount : undefined,
      existingSystem: data.existingSystem?.trim() || undefined,
      source: configFields.source,
      customerType: configFields.customerType,
      customerGrade: configFields.customerGrade,
      channelKind: configFields.channelKind,
      nationwideChannel,
      notes: data.notes?.trim() || undefined,
      ownerId: await resolveOwnerId(role, userId, data.ownerId),
    },
    select: {
      id: true,
      name: true,
      customerType: true,
      customerGrade: true,
      nationwideChannel: true,
    },
  });

  await replaceCustomerTags(customer.id, data.tagValues ?? []);

  const { replaceCustomerCoverageProvinces } = await import(
    "@/lib/customers/coverage-provinces"
  );
  await replaceCustomerCoverageProvinces(customer.id, []);

  const { recordEntityOperation, ENTITY_TYPES } = await import(
    "@/lib/audit/entity-operation-log"
  );
  await recordEntityOperation({
    entityType: ENTITY_TYPES.CUSTOMER,
    entityId: customer.id,
    userId,
    action: "CREATE",
    summary: `创建客户「${customer.name}」`,
  });

  return customer;
}
