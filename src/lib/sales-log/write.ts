import {
  CustomerCategory,
  FollowUpMethod,
  Prisma,
  SalesDailyLogStatus,
  UserRole,
} from "@prisma/client";
import { canManageCustomerOwner, getCustomerForUser, assertCustomerFollowUpWriteAccess, canEditCustomerFollowUp } from "@/lib/customers/access";
import { findDuplicateCustomerByName } from "@/lib/customers/duplicate-name";
import { assertCustomerGrade } from "@/lib/customers/grade";
import {
  categoryLocksToDirectCustomer,
  enforceCustomerTypeForCategory,
  requireCustomerGradeForType,
} from "@/lib/customers/customer-type-grade";
import { parsePlannedFollowUpDateInput } from "@/lib/dates/local-date";
import { validateNextFollowUpPlan } from "@/lib/sales-log/next-follow-up-plan";
import { prisma } from "@/lib/prisma";
import { assertSelectableSalesOwner } from "@/lib/sales/selectable-users";
import { CUSTOMER_ASSIGNABLE_ROLES } from "@/lib/customers/access";
import { searchCustomersForUser } from "@/lib/search/entity-suggest";
import {
  resolveTomorrowPlanForSubmit,
  validateTomorrowPlan,
} from "@/lib/sales-log/tomorrow-plan";
import type { PendingCheckInLocation } from "@/lib/sales-log/auto-daily-log-check-in-on-submit";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export type AgentWriteContext = {
  userId: string;
  role: UserRole;
  dailyLogId: string;
  clientIp?: string | null;
};

export function assertSalesLogRole(role: UserRole) {
  if (!SALES_LOG_ROLES.includes(role)) {
    throw new Error("当前角色无权写入销售日志");
  }
}

function isSamePersonLabel(a: string, b: string) {
  return a.trim().replace(/\s+/g, "") === b.trim().replace(/\s+/g, "");
}

async function resolveOwnerId(role: UserRole, userId: string, ownerId?: string | null) {
  if (role === "SALES") return userId;
  if (canManageCustomerOwner(role) && ownerId) {
    await assertSelectableSalesOwner(role, userId, ownerId, CUSTOMER_ASSIGNABLE_ROLES);
    return ownerId;
  }
  if (canManageCustomerOwner(role)) return null;
  return userId;
}

async function validateCustomerConfigFields(data: {
  category: string;
  source?: string | null;
  customerType?: string | null;
  customerGrade?: string | null;
  channelKind?: string | null;
}) {
  const { CONFIG_CATEGORY, resolveConfigValue, getConfigOptions } = await import(
    "@/lib/config-options"
  );
  const { resolveChannelKindForCustomer } = await import("@/lib/customers/channel-kind");
  const typeOptions = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);

  let typeInput = data.customerType?.trim() || null;
  if (!categoryLocksToDirectCustomer(data.category) && typeInput) {
    try {
      typeInput = await resolveConfigValue(CONFIG_CATEGORY.CUSTOMER_TYPE, typeInput);
    } catch {
      // 留给下方最终 resolve 抛出带可用列表的错误
    }
  }

  const enforcedType = enforceCustomerTypeForCategory(
    data.category,
    typeInput,
    typeOptions
  );
  if (!enforcedType) {
    throw new Error("请选择关系类型");
  }
  const customerType = await resolveConfigValue(
    CONFIG_CATEGORY.CUSTOMER_TYPE,
    enforcedType
  );
  if (!customerType) {
    throw new Error("请选择关系类型");
  }
  return {
    source: await resolveConfigValue(CONFIG_CATEGORY.CUSTOMER_SOURCE, data.source),
    customerType,
    customerGrade: requireCustomerGradeForType(customerType, data.customerGrade, typeOptions),
    channelKind: await resolveChannelKindForCustomer({
      customerType,
      channelKind: data.channelKind,
      typeOptions,
    }),
  };
}

async function resolveCustomerId(
  ctx: AgentWriteContext,
  customerId?: string,
  customerName?: string
): Promise<string> {
  if (customerId) {
    const customer = await getCustomerForUser(customerId, ctx.role, ctx.userId);
    if (!customer) throw new Error("客户不存在或无权访问");
    await assertCustomerFollowUpWriteAccess(ctx.role, ctx.userId, customer);
    return customerId;
  }

  const name = customerName?.trim();
  if (!name) throw new Error("请提供 customerId 或 customerName");

  const rows = await searchCustomersForUser(ctx.role, ctx.userId, name, {
    markWritable: true,
  });
  const exact = rows.filter((row) => row.name === name);
  const matches = exact.length > 0 ? exact : rows;

  if (matches.length === 0) {
    throw new Error(`未找到客户「${name}」，请先使用 createCustomer 新建`);
  }
  // 精确同名优先；多条精确同名时取可写的
  if (exact.length > 1) {
    const writableExact = exact.filter((row) => row.writable);
    if (writableExact.length === 1) return writableExact[0].id;
    throw new Error(
      `客户「${name}」存在 ${exact.length} 条同名记录，请使用 customerId 指定`
    );
  }
  if (exact.length === 1) {
    if (!exact[0].writable) {
      throw new Error(
        `客户「${name}」已存在但非本人负责（负责人：${exact[0].ownerName ?? "无"}），无法录入往来`
      );
    }
    return exact[0].id;
  }
  if (matches.length > 1) {
    throw new Error(
      `客户「${name}」存在 ${matches.length} 条相似匹配，请使用 customerId 指定`
    );
  }
  if (!matches[0].writable) {
    throw new Error(
      `客户「${matches[0].name}」非本人负责（负责人：${matches[0].ownerName ?? "无"}），无法录入往来`
    );
  }
  return matches[0].id;
}

/**
 * 日报确认写往来：任意已存在客户均可记入（userId=当前销售）。
 * 不要求负责人/协助负责人；改等级等仍按可写权限另判。
 */
async function resolveCustomerIdForAgentFollowUp(
  ctx: AgentWriteContext,
  customerId?: string,
  customerName?: string
): Promise<{ id: string; canEditCustomer: boolean }> {
  if (customerId?.trim()) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId.trim() },
      select: {
        id: true,
        ownerId: true,
        assistantOwners: { select: { userId: true } },
      },
    });
    if (!customer) throw new Error("客户不存在");
    return {
      id: customer.id,
      canEditCustomer: canEditCustomerFollowUp(ctx.role, ctx.userId, customer),
    };
  }

  const name = customerName?.trim();
  if (!name) throw new Error("请提供 customerId 或 customerName");

  const rows = await searchCustomersForUser(ctx.role, ctx.userId, name, {
    markWritable: true,
  });
  const exact = rows.filter((row) => row.name === name);
  const matches = exact.length > 0 ? exact : rows;

  if (matches.length === 0) {
    throw new Error(`未找到客户「${name}」，请先使用 createCustomer 新建`);
  }
  if (exact.length > 1) {
    const writableExact = exact.filter((row) => row.writable);
    if (writableExact.length === 1) {
      return { id: writableExact[0].id, canEditCustomer: true };
    }
    // 多条同名且均不可写 / 多条可写：优先取第一条精确名，仍允许记往来
    throw new Error(
      `客户「${name}」存在 ${exact.length} 条同名记录，请使用 customerId 指定`
    );
  }
  if (exact.length === 1) {
    return {
      id: exact[0].id,
      canEditCustomer: exact[0].writable,
    };
  }
  if (matches.length > 1) {
    throw new Error(
      `客户「${name}」存在 ${matches.length} 条相似匹配，请使用 customerId 指定`
    );
  }
  return {
    id: matches[0].id,
    canEditCustomer: matches[0].writable,
  };
}

export async function createCustomerFromAgent(
  ctx: AgentWriteContext,
  input: {
    name: string;
    category: CustomerCategory;
    province?: string;
    city?: string;
    district?: string;
    hospitalLevel?: string | null;
    bedCount?: number | null;
    existingSystem?: string;
    source?: string | null;
    customerType?: string | null;
    customerGrade?: string | null;
    channelKind?: string | null;
    notes?: string;
    contactName?: string;
    contactPhone?: string;
    contactTitle?: string;
  }
) {
  assertSalesLogRole(ctx.role);

  const { hasPermission } = await import("@/lib/rbac/has-permission");
  if (!(await hasPermission(ctx.role, "customers.create"))) {
    throw new Error("无权新建客户");
  }

  const { looksLikeOrganizationName, looksLikePersonName } = await import(
    "@/lib/customers/org-name-heuristics"
  );

  const name = input.name.trim();
  if (!name) throw new Error("客户名称不能为空");

  if (input.category === "INDIVIDUAL") {
    if (looksLikeOrganizationName(name)) {
      throw new Error(
        `「${name}」像医院/公司等机构名称，不能建为个人客户。请先确认机构全称，用 HOSPITAL 或 COMPANY 建档，并把见到的人写入 contactName 作为联系人`
      );
    }
    if (input.contactName?.trim() && !isSamePersonLabel(name, input.contactName)) {
      throw new Error(
        "个人客户的客户名称就是本人；若对方属于某家医院/公司，请先建机构客户，把此人作为联系人，不要再建一条个人客户"
      );
    }
  } else if (looksLikePersonName(name) && !input.contactName?.trim()) {
    throw new Error(
      `「${name}」更像人名。请先向销售确认所属医院或公司全称后，用 HOSPITAL/COMPANY 建档，并把「${name}」写入 contactName；仅当确认无所属机构时才可建个人客户`
    );
  }

  if (
    (input.category === "HOSPITAL" || input.category === "COMPANY") &&
    input.contactName?.trim() &&
    looksLikeOrganizationName(input.contactName)
  ) {
    throw new Error(
      `contactName「${input.contactName.trim()}」像机构名，联系人须是自然人姓名，机构全称应写在客户 name 中`
    );
  }

  let resolvedName = name;
  let resolvedProvince = input.province?.trim() || null;
  let resolvedCity = input.city?.trim() || null;
  let resolvedDistrict = input.district?.trim() || null;
  let resolvedHospitalLevel = input.hospitalLevel ?? null;
  let resolvedBedCount = input.bedCount ?? null;
  let nameCorrected = false;

  if (input.category === "HOSPITAL" || input.category === "COMPANY") {
    const { requireVerifiedOrgProfile } = await import("@/lib/customers/kimi-enrich");
    const verified = await requireVerifiedOrgProfile({
      name,
      category: input.category,
      province: input.province,
      city: input.city,
      district: input.district,
      hospitalLevel: input.hospitalLevel,
      bedCount: input.bedCount,
    });
    resolvedName = verified.officialName;
    resolvedProvince = verified.province;
    resolvedCity = verified.city;
    resolvedDistrict = verified.district;
    resolvedHospitalLevel = verified.hospitalLevel;
    resolvedBedCount = verified.bedCount;
    nameCorrected = verified.nameCorrected;
  }

  const duplicate = await findDuplicateCustomerByName(resolvedName);
  if (duplicate) {
    return {
      success: false as const,
      error: `客户「${duplicate.name}」已存在`,
      existingCustomerId: duplicate.id,
    };
  }

  const configFields = await validateCustomerConfigFields(input);

  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        name: resolvedName,
        category: input.category,
        hospitalLevel:
          input.category === "HOSPITAL" && resolvedHospitalLevel
            ? (resolvedHospitalLevel as never)
            : undefined,
        province: resolvedProvince,
        city: resolvedCity,
        district: resolvedDistrict,
        bedCount: resolvedBedCount ?? undefined,
        existingSystem: input.existingSystem?.trim() || null,
        source: configFields.source,
        customerType: configFields.customerType,
        customerGrade: configFields.customerGrade,
        channelKind: configFields.channelKind,
        notes: input.notes?.trim() || null,
        ownerId: await resolveOwnerId(ctx.role, ctx.userId),
      },
    });

    if (input.contactName?.trim()) {
      await tx.contact.create({
        data: {
          customerId: created.id,
          name: input.contactName.trim(),
          title: input.contactTitle?.trim() || null,
          phone: input.contactPhone?.trim() || null,
          isPrimary: true,
        },
      });
    }

    return created;
  });

  return {
    success: true as const,
    customerId: customer.id,
    customerName: customer.name,
    nameCorrected,
    message: nameCorrected
      ? `已按官方全称新建客户「${customer.name}」（原口述：「${name}」）`
      : `已新建客户「${customer.name}」`,
  };
}

function resolveFollowUpOpportunityIds(input: {
  opportunityId?: string;
  opportunityIds?: string[];
}): string[] {
  return [
    ...new Set(
      [
        ...(input.opportunityIds ?? []),
        ...(input.opportunityId?.trim() ? [input.opportunityId.trim()] : []),
      ]
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
}

async function assertOpportunitiesBelongToCustomer(
  customerId: string,
  opportunityIds: string[],
  viewerUserId?: string
) {
  if (opportunityIds.length === 0) return;

  const { opportunitySelectableWhere } = await import("@/lib/opportunities/confirm-status");
  const opportunities = await prisma.opportunity.findMany({
    where: {
      id: { in: opportunityIds },
      AND: [
        { OR: [{ customerId }, { parties: { some: { customerId } } }] },
        viewerUserId
          ? opportunitySelectableWhere(viewerUserId)
          : { confirmStatus: "CONFIRMED" as const },
      ],
    },
    select: { id: true },
  });
  if (opportunities.length !== opportunityIds.length) {
    throw new Error("商机不存在、未确认或不属于该客户");
  }
}

async function resolveContactIdsForAgentFollowUp(input: {
  customerId: string;
  canEditCustomer: boolean;
  viewerUserId?: string;
  viewerRole?: UserRole;
  contactId?: string;
  contactIds?: string[];
  contactName?: string;
  contactNames?: string[];
}): Promise<string[]> {
  const fromIds = [
    ...new Set(
      (input.contactIds?.length
        ? input.contactIds
        : input.contactId?.trim()
          ? [input.contactId.trim()]
          : []
      )
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
  const names = [
    ...new Set(
      (input.contactNames?.length
        ? input.contactNames
        : input.contactName?.trim()
          ? [input.contactName.trim()]
          : []
      )
        .map((n) => n.trim())
        .filter(Boolean)
    ),
  ];

  if (fromIds.length === 0 && names.length === 0) {
    throw new Error("请至少指定一位联系人（contactIds 或 contactName）");
  }

  const resolved: string[] = [];

  if (fromIds.length > 0) {
    const { contactSelectableWhere } = await import("@/lib/customers/contact-confirm-status");
    const contacts = await prisma.contact.findMany({
      where: {
        id: { in: fromIds },
        customerId: input.customerId,
        ...contactSelectableWhere(input.viewerUserId ?? ""),
      },
      select: { id: true },
    });
    if (contacts.length !== fromIds.length) {
      throw new Error("联系人不属于该客户或尚未可用");
    }
    resolved.push(...fromIds);
  }

  for (const name of names) {
    const { contactSelectableWhere } = await import("@/lib/customers/contact-confirm-status");
    const matches = await prisma.contact.findMany({
      where: {
        customerId: input.customerId,
        name,
        ...contactSelectableWhere(input.viewerUserId ?? ""),
      },
      select: { id: true },
      orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
    });
    if (matches.length === 1) {
      if (!resolved.includes(matches[0].id)) resolved.push(matches[0].id);
      continue;
    }
    if (matches.length > 1) {
      throw new Error(
        `客户下存在多名联系人「${name}」，请使用 contactIds 指定具体联系人`
      );
    }
    // 非负责人也可代建，提交待确认
    const { resolveContactConfirmStatus } = await import(
      "@/lib/customers/contact-confirm-status"
    );
    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        assistantOwners: { select: { userId: true } },
      },
    });
    if (!customer) throw new Error("客户不存在");
    if (!input.viewerUserId || !input.viewerRole) {
      throw new Error(`未找到联系人「${name}」，无法代建`);
    }
    const confirmStatus = resolveContactConfirmStatus({
      role: input.viewerRole,
      userId: input.viewerUserId,
      customer,
    });
    const created = await prisma.contact.create({
      data: {
        customerId: input.customerId,
        name,
        role: "OTHER",
        createdById: input.viewerUserId,
        confirmStatus,
        confirmedAt: confirmStatus === "CONFIRMED" ? new Date() : undefined,
        confirmedById: confirmStatus === "CONFIRMED" ? input.viewerUserId : undefined,
      },
      select: { id: true, name: true },
    });
    if (confirmStatus === "PENDING_MANAGER") {
      // 随往来代录一并确认，不单独通知
    }
    resolved.push(created.id);
  }

  if (resolved.length === 0) {
    throw new Error("请至少指定一位联系人（contactIds 或 contactName）");
  }
  return [...new Set(resolved)];
}

async function assertNationwideContactProvincesOrHint(
  customerId: string,
  contactIds: string[]
) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { nationwideChannel: true, customerType: true },
  });
  if (!customer?.nationwideChannel) return;

  const { getConfigOptions, CONFIG_CATEGORY } = await import("@/lib/config-options");
  const { isChannelCustomerType } = await import("@/lib/customers/customer-type-grade");
  const typeOptions = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  if (!isChannelCustomerType(customer.customerType, typeOptions)) return;

  const contacts = await prisma.contact.findMany({
    where: {
      id: { in: contactIds },
      customerId,
      // 待确认联系人：负责省可在确认入库后再补，代录往来不拦
      confirmStatus: "CONFIRMED",
    },
    select: {
      id: true,
      name: true,
      responsibleProvinces: { select: { province: true } },
    },
  });
  const missing = contacts.filter((c) => c.responsibleProvinces.length === 0);
  if (missing.length === 0) return;

  const names = missing.map((c) => c.name).join("、");
  throw new Error(
    `全国性渠道联系人「${names}」尚未标注负责省区。请先向销售确认负责哪些省，再调用 setContactResponsibleProvinces，或在 createFollowUp 传入 responsibleProvinces；若确认为总部对接、暂不划分，可传 skipResponsibleProvinces=true`
  );
}

async function applyResponsibleProvincesForNationwideContacts(input: {
  customerId: string;
  contactIds: string[];
  provinces: string[];
  canEditCustomer: boolean;
}) {
  if (!input.canEditCustomer) {
    throw new Error("非负责人无法修改联系人负责省区");
  }
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { nationwideChannel: true, customerType: true },
  });
  if (!customer?.nationwideChannel) {
    throw new Error("仅全国性渠道可为联系人标注负责省区");
  }
  const { getConfigOptions, CONFIG_CATEGORY } = await import("@/lib/config-options");
  const { isChannelCustomerType } = await import("@/lib/customers/customer-type-grade");
  const typeOptions = await getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE);
  if (!isChannelCustomerType(customer.customerType, typeOptions)) {
    throw new Error("仅渠道客户可为联系人标注负责省区");
  }
  const { replaceContactResponsibleProvinces } = await import(
    "@/lib/customers/contact-responsible-provinces"
  );
  for (const contactId of input.contactIds) {
    await replaceContactResponsibleProvinces(contactId, input.provinces);
  }
}

export async function setContactResponsibleProvincesFromAgent(
  ctx: AgentWriteContext,
  input: {
    customerId?: string;
    customerName?: string;
    contactId?: string;
    contactName?: string;
    provinces: string[];
  }
) {
  assertSalesLogRole(ctx.role);
  const { id: customerId, canEditCustomer } = await resolveCustomerIdForAgentFollowUp(
    ctx,
    input.customerId,
    input.customerName
  );
  if (!canEditCustomer) {
    throw new Error("非负责人无法修改联系人负责省区");
  }
  const contactIds = await resolveContactIdsForAgentFollowUp({
    customerId,
    canEditCustomer,
    viewerUserId: ctx.userId,
    viewerRole: ctx.role,
    contactId: input.contactId,
    contactName: input.contactName,
  });
  if (contactIds.length !== 1) {
    throw new Error("设置负责省区时请只指定一位联系人");
  }
  if (!input.provinces?.length) {
    throw new Error("请至少提供一个负责省区");
  }
  await applyResponsibleProvincesForNationwideContacts({
    customerId,
    contactIds,
    provinces: input.provinces,
    canEditCustomer,
  });
  const contact = await prisma.contact.findUnique({
    where: { id: contactIds[0] },
    select: {
      id: true,
      name: true,
      responsibleProvinces: { select: { province: true }, orderBy: { province: "asc" } },
    },
  });
  return {
    success: true as const,
    contactId: contact?.id,
    contactName: contact?.name,
    provinces: contact?.responsibleProvinces.map((r) => r.province) ?? [],
    message: `已为联系人「${contact?.name}」标注负责省区：${(contact?.responsibleProvinces ?? [])
      .map((r) => r.province)
      .join("、")}`,
  };
}

export async function createFollowUpFromAgent(
  ctx: AgentWriteContext,
  input: {
    customerId?: string;
    customerName?: string;
    contactId?: string;
    contactIds?: string[];
    contactName?: string;
    contactNames?: string[];
    /** 全国性渠道：一并写入所选联系人的负责省 */
    responsibleProvinces?: string[];
    /** 全国性渠道且确认为总部对接、暂不划分省区时跳过校验 */
    skipResponsibleProvinces?: boolean;
    /** 销售助手写入时强制校验全国性渠道负责省；手工表单不传 */
    enforceNationwideProvinces?: boolean;
    /** 跳过自动完成指派任务 */
    skipAssignmentCompletion?: boolean;
    /** 显式完成的指派 ID；助手未传时自动匹配完成 */
    completedAssignmentIds?: string[];
    opportunityId?: string;
    opportunityIds?: string[];
    method: FollowUpMethod;
    content: string;
    result?: string;
    followUpAt: string;
    nextFollowUpAt?: string;
    nextFollowUpMethod?: FollowUpMethod;
    nextFollowUpContent?: string;
    suggestedGrade?: string | null;
  }
) {
  assertSalesLogRole(ctx.role);

  const { id: customerId, canEditCustomer } = await resolveCustomerIdForAgentFollowUp(
    ctx,
    input.customerId,
    input.customerName
  );
  const content = input.content.trim();
  if (!content) throw new Error("跟进内容不能为空");

  const customerRow = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      customerGrade: true,
      ownerId: true,
      assistantOwners: { select: { userId: true } },
    },
  });
  const planError = validateNextFollowUpPlan(
    input.suggestedGrade,
    input.nextFollowUpAt,
    input.nextFollowUpMethod,
    customerRow?.customerGrade,
    input.nextFollowUpContent
  );
  if (planError) throw new Error(planError);

  const contactIds = await resolveContactIdsForAgentFollowUp({
    customerId,
    canEditCustomer,
    viewerUserId: ctx.userId,
    viewerRole: ctx.role,
    contactId: input.contactId,
    contactIds: input.contactIds,
    contactName: input.contactName,
    contactNames: input.contactNames,
  });

  if (input.responsibleProvinces?.length) {
    await applyResponsibleProvincesForNationwideContacts({
      customerId,
      contactIds,
      provinces: input.responsibleProvinces,
      canEditCustomer,
    });
  } else if (input.enforceNationwideProvinces && !input.skipResponsibleProvinces) {
    await assertNationwideContactProvincesOrHint(customerId, contactIds);
  }

  const opportunityIds = resolveFollowUpOpportunityIds(input);
  await assertOpportunitiesBelongToCustomer(customerId, opportunityIds, ctx.userId);
  if (opportunityIds.length > 0 && !input.nextFollowUpAt?.trim()) {
    throw new Error("已关联商机时须填写下次拜访时间");
  }

  const { listPendingAssignmentsForFollowUp } = await import(
    "@/lib/today-work/assignment-follow-up-complete"
  );
  const pendingAssignments = await listPendingAssignmentsForFollowUp({
    assigneeId: ctx.userId,
    customerId,
    opportunityIds,
  });
  const hasPendingAssignment = pendingAssignments.length > 0;

  const { resolveFollowUpConfirmStatus } = await import("@/lib/follow-ups/confirm-status");
  const confirmStatus = resolveFollowUpConfirmStatus({
    role: ctx.role,
    userId: ctx.userId,
    customer: customerRow ?? { id: customerId, ownerId: null },
    hasPendingAssignment:
      hasPendingAssignment &&
      !input.skipAssignmentCompletion &&
      (input.completedAssignmentIds == null || input.completedAssignmentIds.length > 0),
  });

  const suggestedGrade = assertCustomerGrade(input.suggestedGrade);
  // 非负责人或待确认：不改客户等级
  const applyGrade = Boolean(suggestedGrade) && canEditCustomer && confirmStatus === "CONFIRMED";

  const followUpAt = new Date(input.followUpAt);
  if (Number.isNaN(followUpAt.getTime())) throw new Error("跟进时间格式无效");

  // 防止 AI 重试 / 弱网连点导致并行写入多条相同往来（窗口 10 分钟）
  const duplicateSince = new Date(Date.now() - 10 * 60_000);
  const duplicate = await prisma.followUp.findFirst({
    where: {
      userId: ctx.userId,
      customerId,
      content,
      createdAt: { gte: duplicateSince },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      customer: { select: { name: true } },
    },
  });
  if (duplicate) {
    return {
      success: true as const,
      followUpId: duplicate.id,
      customerId,
      customerName: duplicate.customer.name,
      message: "相同往来已存在，未重复写入",
      deduplicated: true as const,
    };
  }

  const followUp = await prisma.$transaction(async (tx) => {
    const created = await tx.followUp.create({
      data: {
        customerId,
        contactId: contactIds[0] || undefined,
        opportunityId: opportunityIds[0] ?? undefined,
        userId: ctx.userId,
        method: input.method,
        content,
        result: input.result?.trim() || null,
        followUpAt,
        nextFollowUpAt: parsePlannedFollowUpDateInput(input.nextFollowUpAt),
        nextFollowUpMethod: input.nextFollowUpMethod || undefined,
        nextFollowUpContent: input.nextFollowUpContent?.trim() || undefined,
        suggestedGrade: suggestedGrade ?? undefined,
        gradeApplied: applyGrade,
        confirmStatus,
        confirmedAt: confirmStatus === "CONFIRMED" ? new Date() : undefined,
        confirmedById: confirmStatus === "CONFIRMED" ? ctx.userId : undefined,
        salesDailyLogId: ctx.dailyLogId,
        ...(contactIds.length > 0
          ? {
              linkedContacts: {
                create: contactIds.map((contactId) => ({ contactId })),
              },
            }
          : {}),
        ...(opportunityIds.length > 0
          ? {
              linkedOpportunities: {
                create: opportunityIds.map((opportunityId) => ({ opportunityId })),
              },
            }
          : {}),
      },
      include: { customer: { select: { name: true } } },
    });

    if (applyGrade && suggestedGrade) {
      await tx.customer.update({
        where: { id: customerId },
        data: { customerGrade: suggestedGrade },
      });
    }

    return created;
  });

  void notifyFollowUpWeCom({
    userId: ctx.userId,
    role: ctx.role,
    followUpId: followUp.id,
    customerId,
    customerName: followUp.customer.name,
    method: input.method,
    content,
    nextFollowUpAt: input.nextFollowUpAt,
    nextFollowUpMethod: input.nextFollowUpMethod,
    nextFollowUpContent: input.nextFollowUpContent,
  });

  if (!input.skipAssignmentCompletion) {
    const { autoCompleteMatchingAssignments, completeWeeklyAssignmentsByIds } = await import(
      "@/lib/today-work/assignment-follow-up-complete"
    );
    if (input.completedAssignmentIds?.length) {
      await prisma.$transaction(async (tx) => {
        await completeWeeklyAssignmentsByIds(tx, {
          assigneeId: ctx.userId,
          assignmentIds: input.completedAssignmentIds!,
        });
      });
    } else {
      await autoCompleteMatchingAssignments({
        assigneeId: ctx.userId,
        customerId,
        opportunityIds,
      });
    }
  }

  if (confirmStatus === "PENDING_MANAGER") {
    const { createAppNotification, NOTIFICATION_TYPES } = await import(
      "@/lib/notifications/app-notifications"
    );
    await createAppNotification({
      type: NOTIFICATION_TYPES.FOLLOW_UP_PENDING_CONFIRM,
      title: "非本人客户录入待确认",
      body: `${followUp.customer.name}：有一条非本人客户往来（含同次联系人/商机）待确认`,
      linkHref: "/approvals?type=FOLLOW_UP_CONFIRM",
      actorRole: ctx.role,
      excludeUserId: ctx.userId,
      pushWeCom: true,
      meta: { followUpId: followUp.id, customerId, action: "confirm_follow_up" },
    });
  }

  const { scheduleActivityEmbeddingIndex, ACTIVITY_EMBED_SOURCE } = await import(
    "@/lib/sales-log/activity-embedding-index"
  );
  scheduleActivityEmbeddingIndex(ACTIVITY_EMBED_SOURCE.FOLLOW_UP, followUp.id);

  return {
    success: true as const,
    followUpId: followUp.id,
    customerId,
    customerName: followUp.customer.name,
    canEditCustomer,
    confirmStatus,
    message:
      confirmStatus === "PENDING_MANAGER"
        ? `已为「${followUp.customer.name}」提交非本人客户往来，待销售管理统一确认后入库`
        : canEditCustomer
          ? `已为「${followUp.customer.name}」写入跟进记录`
          : `已为「${followUp.customer.name}」写入跟进记录（非本人负责客户，仅记往来未改档案）`,
  };
}

async function notifyFollowUpWeCom(input: {
  userId: string;
  role: UserRole;
  followUpId: string;
  customerId: string;
  customerName: string;
  method: FollowUpMethod;
  content: string;
  nextFollowUpAt?: string;
  nextFollowUpMethod?: FollowUpMethod;
  nextFollowUpContent?: string;
}) {
  try {
    const actor = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    });
    const { notifyWeComFollowUpCreated } = await import("@/lib/wecom/notify");
    await notifyWeComFollowUpCreated({
      actorUserId: input.userId,
      actorRole: input.role,
      actorName: actor?.name ?? "销售",
      followUpId: input.followUpId,
      customerId: input.customerId,
      customerName: input.customerName,
      method: input.method,
      content: input.content,
      nextFollowUpAt: input.nextFollowUpAt,
      nextFollowUpMethod: input.nextFollowUpMethod,
      nextFollowUpContent: input.nextFollowUpContent,
    });
  } catch (error) {
    console.error("[wecom-notify] follow-up hook", error);
  }
}

export async function submitDailyLogFromAgent(
  ctx: AgentWriteContext,
  input: {
    dailyReport: string;
    tomorrowPlan?: string;
    riskFlag?: boolean;
    riskNotes?: string;
    summary?: Prisma.InputJsonValue;
    checkInLocation?: PendingCheckInLocation | null;
  }
) {
  assertSalesLogRole(ctx.role);

  const dailyReport = input.dailyReport.trim();
  if (!dailyReport) throw new Error("日报内容不能为空");

  const tomorrowPlanText = resolveTomorrowPlanForSubmit({
    tomorrowPlan: input.tomorrowPlan,
    dailyReport,
  });

  if (!input.riskFlag) {
    const planError = validateTomorrowPlan(tomorrowPlanText);
    if (planError) throw new Error(planError);
  } else if (!tomorrowPlanText.trim()) {
    throw new Error("带风险提交也须在 riskNotes 中说明明日计划缺失原因，并尽量补问销售");
  }

  const riskNotes = input.riskNotes?.trim() || null;
  if (input.riskFlag && !riskNotes) {
    throw new Error("带风险提交须填写 riskNotes，说明具体风险或信息缺口");
  }

  // 正文「问题与风险」与 riskNotes 对齐，避免角标有风险但正文写「无」
  let normalizedDailyReport = dailyReport;
  if (input.riskFlag && riskNotes) {
    if (/##\s*问题与风险[\s\S]*?(?=##\s|$)/u.test(normalizedDailyReport)) {
      normalizedDailyReport = normalizedDailyReport.replace(
        /##\s*问题与风险[\s\S]*?(?=##\s|$)/u,
        `## 问题与风险\n- ${riskNotes}\n\n`
      );
    } else {
      normalizedDailyReport = `${normalizedDailyReport.trim()}\n\n## 问题与风险\n- ${riskNotes}`;
    }
  }

  const existing = await prisma.salesDailyLog.findUnique({
    where: { id: ctx.dailyLogId },
    select: { logDate: true, lateMarkedAt: true, structuredOutput: true },
  });
  if (!existing) throw new Error("日报记录不存在");

  const now = new Date();
  const { getDailyReportDeadline } = await import("@/lib/sales-log/daily-report-submission");
  const shouldLockLate =
    !existing.lateMarkedAt &&
    now.getTime() > getDailyReportDeadline(existing.logDate).getTime();

  const prevStructured =
    existing.structuredOutput &&
    typeof existing.structuredOutput === "object" &&
    !Array.isArray(existing.structuredOutput)
      ? (existing.structuredOutput as Record<string, unknown>)
      : {};

  const { readPendingCheckInLocation, ensureAutoDailyLogCheckInOnSubmit } = await import(
    "@/lib/sales-log/auto-daily-log-check-in-on-submit"
  );
  const pendingCheckInLocation =
    input.checkInLocation ?? readPendingCheckInLocation(prevStructured);

  const nextStructured = { ...prevStructured };
  delete nextStructured.pendingCheckInLocation;
  nextStructured.dailyReport = normalizedDailyReport;
  nextStructured.tomorrowPlan = tomorrowPlanText || null;
  nextStructured.summary = input.summary ?? null;
  nextStructured.submittedAt = now.toISOString();
  nextStructured.unsubmittedPlaceholder = false;

  const log = await prisma.salesDailyLog.update({
    where: { id: ctx.dailyLogId },
    data: {
      dailyReport: normalizedDailyReport,
      structuredOutput: nextStructured as Prisma.InputJsonValue,
      submittedAt: now,
      status: input.riskFlag
        ? SalesDailyLogStatus.RISK_SUBMITTED
        : SalesDailyLogStatus.SUBMITTED,
      riskFlag: Boolean(input.riskFlag),
      riskNotes,
      // 过截止补录：锁定迟交，不清除已有 lateMarkedAt（统计不变）
      ...(shouldLockLate ? { lateMarkedAt: now } : {}),
    },
  });

  await ensureAutoDailyLogCheckInOnSubmit({
    userId: ctx.userId,
    role: ctx.role,
    dailyLogId: log.id,
    logDate: existing.logDate,
    submittedAt: now,
    location: pendingCheckInLocation,
    clientIp: ctx.clientIp,
  });

  void (async () => {
    try {
      const actor = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { name: true },
      });
      const { notifyWeComDailyLogSubmitted } = await import("@/lib/wecom/notify");
      await notifyWeComDailyLogSubmitted({
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        actorName: actor?.name ?? "销售",
        dailyLogId: log.id,
        dailyReport: normalizedDailyReport,
        tomorrowPlan: tomorrowPlanText,
        riskFlag: Boolean(input.riskFlag),
        riskNotes,
      });
    } catch (error) {
      console.error("[wecom-notify] daily log hook", error);
    }
  })();

  const { scheduleActivityEmbeddingIndex, ACTIVITY_EMBED_SOURCE } = await import(
    "@/lib/sales-log/activity-embedding-index"
  );
  scheduleActivityEmbeddingIndex(ACTIVITY_EMBED_SOURCE.DAILY_LOG, log.id);

  return {
    success: true as const,
    dailyLogId: log.id,
    status: log.status,
    message: input.riskFlag ? "日报已带风险标记提交" : "今日销售日报已提交",
  };
}
