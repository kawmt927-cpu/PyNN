"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole, type FollowUpMethod } from "@prisma/client";
import { revalidateApprovalSurfaces } from "@/lib/approvals/revalidate";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { customerFormSchema, followUpFormSchema, customerRelationSchema } from "@/lib/validations/customer";
import { canManageCustomerOwner, getCustomerForUser, assertCustomerContentWriteAccess, assertCustomerFollowUpWriteAccess, CUSTOMER_ASSIGNABLE_ROLES } from "@/lib/customers/access";
import { replaceCustomerAssistants } from "@/lib/customers/assistants";
import { assertCustomerNameAvailable } from "@/lib/customers/duplicate-name";
import { validateNextFollowUpPlan } from "@/lib/sales-log/next-follow-up-plan";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import {
  enforceCustomerTypeForCategory,
  requireCustomerGradeForType,
} from "@/lib/customers/customer-type-grade";
import { assertSelectableSalesOwner } from "@/lib/sales/selectable-users";
import {
  completeCustomerPendingFollowPlan,
  getCustomerPendingFollowPlans,
  parsePendingPlanSelectionKey,
  pendingPlanSelectionKey,
} from "@/lib/follow-ups/unified";
import { ensureTodayDailyLog } from "@/lib/sales-log/daily-log";
import { createFollowUpFromAgent } from "@/lib/sales-log/write";

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

function parseTagValues(formData: FormData): string[] {
  return formData.getAll("tagValues").map(String).filter(Boolean);
}

function parseOptionalField(raw: FormDataEntryValue | null): string | null {
  const value = raw?.toString().trim() ?? "";
  return value || null;
}

function parseAssistantOwnerIds(formData: FormData): string[] {
  return [
    ...new Set(
      formData
        .getAll("assistantOwnerIds")
        .map((value) => value.toString().trim())
        .filter(Boolean)
    ),
  ];
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
    channelKind: parseOptionalField(formData.get("channelKind")),
    notes: formData.get("notes") || undefined,
    ownerId: parseOwnerField(formData.get("ownerId")),
    assistantOwnerIds: parseAssistantOwnerIds(formData),
  });
}

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

function formatActionError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "表单校验失败" };
  }
  if (error instanceof Error) {
    return { error: error.message };
  }
  return { error: "操作失败，请重试" };
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

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const data = parseCustomerForm(formData);
    const configFields = await validateCustomerConfigFields(data);

    await assertCustomerNameAvailable(data.name);

    const ownerId = await resolveOwnerId(session.user.role, session.user.id, data.ownerId);
    const canSetAssistants =
      canManageCustomerOwner(session.user.role) || session.user.role === "SALES";

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
        channelKind: configFields.channelKind,
        notes: data.notes,
        ownerId,
      },
    });

    if (canSetAssistants && data.assistantOwnerIds.length > 0) {
      await replaceCustomerAssistants(customer.id, data.assistantOwnerIds, ownerId);
    }

    const { replaceCustomerTags } = await import("@/lib/customers/tags");
    await replaceCustomerTags(customer.id, parseTagValues(formData));

    const { isChannelCustomerType } = await import("@/lib/customers/customer-type-grade");
    const { replaceCustomerCoverageProvinces, parseCoverageProvincesFromForm } = await import(
      "@/lib/customers/coverage-provinces"
    );
    const { getConfigOptions, CONFIG_CATEGORY } = await import("@/lib/config-options");
    const typeOptions = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
    await replaceCustomerCoverageProvinces(
      customer.id,
      isChannelCustomerType(configFields.customerType, typeOptions)
        ? parseCoverageProvincesFromForm(formData)
        : []
    );

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.CUSTOMER,
      entityId: customer.id,
      userId: session.user.id,
      action: "创建",
      summary: `创建客户「${customer.name}」`,
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
    await assertCustomerContentWriteAccess(session.user.role, session.user.id, existing);

    const data = parseCustomerForm(formData);
    const {
      assertCustomerCategoryTransitionAllowed,
      assertIndividualToCompanyConversion,
      parseIndividualToCompanyContactFields,
      upsertPrimaryContactFromPerson,
    } = await import("@/lib/customers/convert-individual-to-company");

    assertCustomerCategoryTransitionAllowed(existing.category, data.category);

    const convertingIndividualToCompany =
      existing.category === "INDIVIDUAL" && data.category === "COMPANY";
    const conversionContact = convertingIndividualToCompany
      ? parseIndividualToCompanyContactFields(formData)
      : null;
    if (convertingIndividualToCompany && conversionContact) {
      await assertIndividualToCompanyConversion({
        customerId: id,
        companyName: data.name,
        contactName: conversionContact.contactName,
      });
    } else if (data.name.trim() !== existing.name.trim()) {
      await assertCustomerNameAvailable(data.name, id);
    }

    const configFields = await validateCustomerConfigFields(data);
    const ownerId = canManageCustomerOwner(session.user.role)
      ? await resolveOwnerId(session.user.role, session.user.id, data.ownerId)
      : existing.ownerId;
    const canSetAssistants =
      canManageCustomerOwner(session.user.role) || existing.ownerId === session.user.id;

    const tagValues = parseTagValues(formData);
    const nextAssistants = canSetAssistants ? data.assistantOwnerIds : existing.assistantOwners.map((a) => a.userId);

    const hospitalLevel =
      data.category === "HOSPITAL" ? (data.hospitalLevel ?? null) : null;
    const notesNormalized =
      data.notes?.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() || null;
    const nextData = {
      name: data.name,
      category: data.category,
      hospitalLevel: convertingIndividualToCompany ? null : hospitalLevel,
      province: data.province ?? null,
      city: data.city ?? null,
      district: data.district ?? null,
      bedCount: convertingIndividualToCompany ? null : data.bedCount ?? null,
      existingSystem: data.existingSystem ?? null,
      source: configFields.source,
      customerType: configFields.customerType,
      customerGrade: configFields.customerGrade,
      channelKind: configFields.channelKind,
      notes: notesNormalized,
      ownerId,
    };

    const {
      CONFIG_CATEGORY,
      getConfigOptionMaps,
    } = await import("@/lib/config-options");
    const { isChannelCustomerType } = await import("@/lib/customers/customer-type-grade");
    const { getCustomerTagDefinitions } = await import("@/lib/customers/tags");
    const { buildCustomerEditChanges } = await import("@/lib/customers/edit-log");
    const { HOSPITAL_LEVEL_LABELS } = await import("@/lib/permissions");

    const [optionMaps, tagDefinitions, ownerUser, assistantUsers] = await Promise.all([
      getConfigOptionMaps([
        CONFIG_CATEGORY.CUSTOMER_SOURCE,
        CONFIG_CATEGORY.CUSTOMER_TYPE,
        CONFIG_CATEGORY.CUSTOMER_GRADE,
        CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE,
      ]),
      getCustomerTagDefinitions(),
      ownerId
        ? prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } })
        : Promise.resolve(null),
      nextAssistants.length > 0
        ? prisma.user.findMany({
            where: { id: { in: nextAssistants } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);

    const tagLabelByValue = Object.fromEntries(
      tagDefinitions.map((t) => [t.value, t.label])
    );
    const assistantNameById = new Map(assistantUsers.map((u) => [u.id, u.name]));
    const nextAssistantNames = nextAssistants
      .map((aid) => assistantNameById.get(aid))
      .filter((n): n is string => Boolean(n));
    const typeLabels = optionMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
    const changes = buildCustomerEditChanges(
      existing,
      {
        ...nextData,
        ownerName: ownerUser?.name ?? null,
        assistantOwnerIds: nextAssistants,
        assistantNames: nextAssistantNames,
        tagValues,
        tagLabels: tagValues.map((v) => tagLabelByValue[v] ?? v),
      },
      {
        typeLabels,
        gradeLabels: optionMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {},
        channelGradeLabels: optionMaps[CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE] ?? {},
        hospitalLevelLabels: { ...HOSPITAL_LEVEL_LABELS },
        sourceLabels: optionMaps[CONFIG_CATEGORY.CUSTOMER_SOURCE] ?? {},
        tagLabelByValue,
        isChannelType: (customerType) => isChannelCustomerType(customerType, typeLabels),
      }
    );

    await prisma.customer.update({
      where: { id },
      data: {
        name: nextData.name,
        category: nextData.category,
        hospitalLevel: nextData.hospitalLevel,
        province: nextData.province,
        city: nextData.city,
        district: nextData.district,
        bedCount: nextData.bedCount,
        existingSystem: nextData.existingSystem,
        source: nextData.source,
        customerType: nextData.customerType,
        customerGrade: nextData.customerGrade,
        notes: nextData.notes,
        ownerId,
      },
    });

    if (convertingIndividualToCompany && conversionContact) {
      await upsertPrimaryContactFromPerson({
        customerId: id,
        contactName: conversionContact.contactName,
        contactPhone: conversionContact.contactPhone,
      });
    }

    if (canSetAssistants) {
      await replaceCustomerAssistants(id, data.assistantOwnerIds, ownerId);
    }

    const { replaceCustomerTags } = await import("@/lib/customers/tags");
    await replaceCustomerTags(id, tagValues);

    const { replaceCustomerCoverageProvinces, parseCoverageProvincesFromForm } = await import(
      "@/lib/customers/coverage-provinces"
    );
    await replaceCustomerCoverageProvinces(
      id,
      isChannelCustomerType(configFields.customerType)
        ? parseCoverageProvincesFromForm(formData)
        : []
    );

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    if (convertingIndividualToCompany && conversionContact) {
      const convertLines = [
        ...changes,
        `联系人：${conversionContact.contactName}${
          conversionContact.contactPhone ? `（${conversionContact.contactPhone}）` : ""
        }`,
      ];
      await recordEntityOperation({
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: id,
        userId: session.user.id,
        action: "更新",
        summary: `个人客户「${existing.name}」转为公司「${data.name}」`,
        detail: convertLines.join("\n"),
      });
    } else if (changes.length > 0) {
      await recordEntityOperation({
        entityType: ENTITY_TYPES.CUSTOMER,
        entityId: id,
        userId: session.user.id,
        action: "更新",
        summary: `更新客户「${data.name}」`,
        detail: changes.join("\n"),
      });
    }

    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { redirectTo: `/customers/${id}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function createFollowUp(formData: FormData): Promise<ActionResult> {
  try {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const opportunityIdsJson = formData.get("opportunityIdsJson")?.toString().trim();
  const parsedOpportunityIdsFromJson = opportunityIdsJson
    ? (JSON.parse(opportunityIdsJson) as unknown)
    : null;
  const opportunityIdsFromForm = formData
    .getAll("opportunityIds")
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  const opportunityIdsFromJson = Array.isArray(parsedOpportunityIdsFromJson)
    ? parsedOpportunityIdsFromJson.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      )
    : [];

  const parsed = followUpFormSchema.parse({
    customerId: formData.get("customerId"),
    method: formData.get("method"),
    content: formData.get("content"),
    result: formData.get("result") || undefined,
    followUpAt: formData.get("followUpAt"),
    nextFollowUpAt: formData.get("nextFollowUpAt") || null,
    nextFollowUpMethod: formData.get("nextFollowUpMethod") || null,
    nextFollowUpContent: formData.get("nextFollowUpContent") || null,
    suggestedGrade: formData.get("suggestedGrade") || null,
    contactIds: formData.getAll("contactIds").filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    opportunityId: formData.get("opportunityId") || null,
    opportunityIds:
      opportunityIdsFromForm.length > 0 ? opportunityIdsFromForm : opportunityIdsFromJson,
    completedPendingKeys: formData
      .getAll("completedPendingKeys")
      .filter((key): key is string => typeof key === "string" && key.trim().length > 0),
  });

  const customer = await getCustomerForUser(
    parsed.customerId,
    session.user.role,
    session.user.id
  );
  if (!customer) throw new Error("无权访问该客户");
  await assertCustomerFollowUpWriteAccess(session.user.role, session.user.id, customer);

  const planError = validateNextFollowUpPlan(
    parsed.suggestedGrade,
    parsed.nextFollowUpAt,
    parsed.nextFollowUpMethod,
    customer.customerGrade,
    parsed.nextFollowUpContent
  );
  if (planError) throw new Error(planError);

  const now = new Date();
  const pendingPlans = await getCustomerPendingFollowPlans(parsed.customerId, now);
  const pendingKeySet = new Set(
    pendingPlans.map((item) => pendingPlanSelectionKey(item.source, item.id))
  );
  const completedPendingKeys = [...new Set(parsed.completedPendingKeys)];
  if (pendingPlans.length > 0) {
    if (completedPendingKeys.length === 0) {
      throw new Error("请至少选择一条要完成的待跟进计划");
    }
    for (const key of completedPendingKeys) {
      if (!pendingKeySet.has(key)) {
        throw new Error("所选待跟进计划无效或已完成");
      }
    }
  }

  const dailyLog = await ensureTodayDailyLog(session.user.id);
  await createFollowUpFromAgent(
    {
      userId: session.user.id,
      role: session.user.role,
      dailyLogId: dailyLog.id,
    },
    {
      customerId: parsed.customerId,
      contactIds: parsed.contactIds,
      opportunityId: parsed.opportunityId ?? undefined,
      opportunityIds: parsed.opportunityIds,
      method: parsed.method,
      content: parsed.content,
      result: parsed.result,
      followUpAt: parsed.followUpAt,
      nextFollowUpAt: parsed.nextFollowUpAt ?? undefined,
      nextFollowUpMethod: (parsed.nextFollowUpMethod as FollowUpMethod | null) || undefined,
      nextFollowUpContent: parsed.nextFollowUpContent ?? undefined,
      suggestedGrade: parsed.suggestedGrade,
    }
  );

  if (completedPendingKeys.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const key of completedPendingKeys) {
        const input = parsePendingPlanSelectionKey(key);
        if (!input) throw new Error("所选待跟进计划无效或已完成");
        await completeCustomerPendingFollowPlan(tx, parsed.customerId, input);
      }
    });
  }

  const linkedOpportunityIds = [
    ...new Set([
      ...(parsed.opportunityIds ?? []),
      ...(parsed.opportunityId?.trim() ? [parsed.opportunityId.trim()] : []),
    ]),
  ];

  revalidatePath("/follow-ups");
  revalidatePath(`/customers/${parsed.customerId}`);
  revalidatePath(`/customers/${parsed.customerId}/follow-ups`);
  for (const opportunityId of linkedOpportunityIds) {
    revalidatePath(`/opportunities/${opportunityId}`);
    revalidatePath(`/opportunities/${opportunityId}/follow-ups`);
  }
  if (completedPendingKeys.length > 0) {
    const opportunityFollowUpIds = completedPendingKeys
      .map((key) => parsePendingPlanSelectionKey(key))
      .filter((input): input is NonNullable<typeof input> => input?.source === "opportunity")
      .map((input) => input.id);
    if (opportunityFollowUpIds.length > 0) {
      const oppFollowUps = await prisma.opportunityFollowUp.findMany({
        where: { id: { in: opportunityFollowUpIds } },
        select: { opportunityId: true },
      });
      for (const row of oppFollowUps) {
        revalidatePath(`/opportunities/${row.opportunityId}`);
        revalidatePath(`/opportunities/${row.opportunityId}/follow-ups`);
      }
    }
  }

  return { redirectTo: `/customers/${parsed.customerId}/follow-ups` };
  } catch (error) {
    return formatActionError(error);
  }
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
    const target = await prisma.user.findFirst({
      where: { id: salesUserId, role: { in: CUSTOMER_ASSIGNABLE_ROLES } },
      select: { id: true },
    });
    if (!target) throw new Error("只能分配给销售、销售管理或管理员");

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
  revalidateApprovalSurfaces(customerId);
  revalidatePath(`/customers/${customerId}`);
}

export async function addCustomerRelation(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const parsedResult = customerRelationSchema.safeParse({
    customerId: String(formData.get("customerId") ?? "").trim(),
    relatedCustomerId: String(formData.get("relatedCustomerId") ?? "").trim(),
    relationNote: String(formData.get("relationNote") ?? "").trim() || undefined,
  });
  if (!parsedResult.success) {
    throw new Error("请选择关联客户后再提交");
  }
  const parsed = parsedResult.data;

  if (parsed.customerId === parsed.relatedCustomerId) {
    throw new Error("不能关联自身");
  }

  const customer = await getCustomerForUser(
    parsed.customerId,
    session.user.role,
    session.user.id
  );
  if (!customer) throw new Error("无权访问该客户");
  await assertCustomerContentWriteAccess(session.user.role, session.user.id, customer);

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
  await assertCustomerContentWriteAccess(session.user.role, session.user.id, customer);

  await prisma.customerRelation.delete({ where: { id: relationId } });
  revalidatePath(`/customers/${customerId}`);
}
