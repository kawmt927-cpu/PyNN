import { SalesCheckInStatus, UserRole, type FollowUpMethod } from "@prisma/client";
import { getCustomerForUser, assertCustomerFollowUpWriteAccess } from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";
import { getTodayRange, salesCheckInListWhere } from "@/lib/sales-log/access";
import { ensureTodayDailyLog } from "@/lib/sales-log/daily-log";
import type { CheckInFollowUpInput, CheckInMode } from "@/lib/validations/sales-log";
import {
  LEGACY_CHECK_IN_MODE_WITH_CUSTOMER,
  normalizeCheckInMode,
  normalizeContactIds,
} from "@/lib/validations/sales-log";
import { formatCheckInLocation, hasCheckInLocation } from "@/lib/sales-log/format-location";
import type { AgentWriteContext } from "@/lib/sales-log/write";
import { assertSalesLogRole, createFollowUpFromAgent } from "@/lib/sales-log/write";
import {
  completeCustomerPendingFollowPlan,
  getCustomerPendingFollowPlans,
  parsePendingPlanSelectionKey,
  pendingPlanSelectionKey,
} from "@/lib/follow-ups/unified";
import { applyCheckInIpAudit } from "@/lib/sales-log/check-in-ip-guard";

export async function listMyTodayCheckIns(userId: string, status?: SalesCheckInStatus) {
  const { start, end } = getTodayRange();
  return prisma.salesCheckIn.findMany({
    where: {
      userId,
      checkedInAt: { gte: start, lt: end },
      ...(status ? { status } : {}),
    },
    orderBy: { checkedInAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, customerGrade: true } },
      contact: { select: { id: true, name: true, title: true } },
      user: { select: { id: true, name: true } },
      followUp: { select: { id: true, method: true, content: true } },
    },
  });
}

type CheckInWriteInput = {
  userId: string;
  role: UserRole;
  checkInMode?: CheckInMode | typeof LEGACY_CHECK_IN_MODE_WITH_CUSTOMER;
  customerId?: string | null;
  contactId?: string | null;
  contactIds?: string[];
  latitude?: number | null;
  longitude?: number | null;
  locationText?: string | null;
  addressProvince?: string | null;
  addressCity?: string | null;
  addressDistrict?: string | null;
  addressStreet?: string | null;
  notes?: string | null;
  completeInteractionNow?: boolean;
  followUp?: CheckInFollowUpInput | null;
  completedPendingKeys?: string[];
  /** 仅服务端从请求头注入，不对销售展示 */
  clientIp?: string | null;
};

async function assertCheckInWriteAccess(checkIn: { userId: string }, role: UserRole, userId: string) {
  if (role === "SALES" && checkIn.userId !== userId) {
    throw new Error("无权操作该打卡记录");
  }
}

async function createInteractionFollowUpFromCheckIn(
  ctx: AgentWriteContext,
  input: CheckInWriteInput,
  customerId: string,
  contactIds: string[],
  followUpAt: Date
) {
  if (!input.followUp) throw new Error("请填写往来内容");

  const followUpResult = await createFollowUpFromAgent(ctx, {
    customerId,
    contactIds,
    method: input.followUp.method,
    content: input.followUp.content,
    result: input.followUp.result ?? undefined,
    followUpAt: followUpAt.toISOString(),
    nextFollowUpAt: input.followUp.nextFollowUpAt ?? undefined,
    nextFollowUpMethod: (input.followUp.nextFollowUpMethod as FollowUpMethod | null) ?? undefined,
    nextFollowUpContent: input.followUp.nextFollowUpContent ?? undefined,
    suggestedGrade: input.followUp.suggestedGrade ?? undefined,
    opportunityId: input.followUp.opportunityId ?? undefined,
  });

  if (input.completedPendingKeys?.length) {
    await finalizeCompletedPendingPlans(
      customerId,
      input.role,
      input.userId,
      input.completedPendingKeys
    );
  }

  return followUpResult;
}

export function isEffectiveCheckInRecord(row: {
  status: SalesCheckInStatus;
  customerId: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationText?: string | null;
  addressProvince?: string | null;
  addressCity?: string | null;
  addressDistrict?: string | null;
  addressStreet?: string | null;
}): boolean {
  if (hasCheckInLocation(row)) return true;
  return row.status === SalesCheckInStatus.PENDING && Boolean(row.customerId);
}

async function finalizeCompletedPendingPlans(
  customerId: string,
  role: UserRole,
  userId: string,
  keys: string[]
) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (uniqueKeys.length === 0) return;

  const customer = await getCustomerForUser(customerId, role, userId);
  if (!customer) throw new Error("无权访问该客户");
  await assertCustomerFollowUpWriteAccess(role, userId, customer);

  const pendingPlans = await getCustomerPendingFollowPlans(customerId, new Date());
  const pendingKeySet = new Set(
    pendingPlans.map((item) => pendingPlanSelectionKey(item.source, item.id))
  );
  if (pendingPlans.length > 0 && uniqueKeys.length === 0) {
    throw new Error("请至少选择一条要完成的待跟进计划");
  }
  for (const key of uniqueKeys) {
    if (!pendingKeySet.has(key)) {
      throw new Error("所选待跟进计划无效或已完成");
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const key of uniqueKeys) {
      const parsed = parsePendingPlanSelectionKey(key);
      if (!parsed) throw new Error("所选待跟进计划无效或已完成");
      await completeCustomerPendingFollowPlan(tx, customerId, parsed);
    }
  });
}

async function assertContactsBelongToCustomer(customerId: string, contactIds: string[]) {
  if (contactIds.length === 0) return;
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, customerId },
    select: { id: true },
  });
  if (contacts.length !== contactIds.length) throw new Error("联系人不属于该客户");
}

export async function updateSalesCheckIn(
  checkInId: string,
  input: CheckInWriteInput
) {
  assertSalesLogRole(input.role);
  const existing = await prisma.salesCheckIn.findUnique({
    where: { id: checkInId },
    include: { customer: { select: { name: true } } },
  });
  if (!existing) throw new Error("打卡记录不存在");
  await assertCheckInWriteAccess(existing, input.role, input.userId);

  const mode = normalizeCheckInMode(input.checkInMode);
  const isInteraction = mode === "interaction";
  const customerId = isInteraction && input.customerId?.trim() ? input.customerId.trim() : null;
  const contactIds = normalizeContactIds(input);
  const primaryContactId = contactIds[0] ?? null;

  if (isInteraction && !customerId) throw new Error("请选择客户");
  if (isInteraction && contactIds.length > 0) {
    await assertContactsBelongToCustomer(customerId!, contactIds);
  }
  if (input.completeInteractionNow && !input.followUp?.content?.trim()) {
    throw new Error("请填写往来内容");
  }

  if (isInteraction && input.completeInteractionNow && customerId) {
    const pendingPlans = await getCustomerPendingFollowPlans(customerId, new Date());
    if (pendingPlans.length > 0 && (!input.completedPendingKeys || input.completedPendingKeys.length === 0)) {
      throw new Error("请至少选择一条要完成的待跟进计划");
    }
  }

  const dailyLog = await ensureTodayDailyLog(input.userId);
  const ctx: AgentWriteContext = {
    userId: input.userId,
    role: input.role,
    dailyLogId: dailyLog.id,
  };

  const checkIn = await prisma.salesCheckIn.update({
    where: { id: checkInId },
    data: {
      customerId: customerId ?? undefined,
      contactId: isInteraction ? primaryContactId || undefined : undefined,
      checkedInAt: new Date(),
      latitude: input.latitude ?? undefined,
      longitude: input.longitude ?? undefined,
      locationText: input.locationText?.trim() || undefined,
      addressProvince: input.addressProvince?.trim() || undefined,
      addressCity: input.addressCity?.trim() || undefined,
      addressDistrict: input.addressDistrict?.trim() || undefined,
      addressStreet: input.addressStreet?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      salesDailyLogId: dailyLog.id,
    },
    include: {
      customer: { select: { name: true } },
      contact: { select: { name: true, title: true } },
    },
  });

  if (
    isInteraction &&
    input.completeInteractionNow &&
    input.followUp &&
    existing.status === SalesCheckInStatus.PENDING
  ) {
    const followUpResult = await createInteractionFollowUpFromCheckIn(
      ctx,
      input,
      customerId!,
      contactIds,
      checkIn.checkedInAt
    );

    if (hasCheckInLocation(checkIn)) {
      await prisma.salesCheckIn.update({
        where: { id: checkIn.id },
        data: {
          status: SalesCheckInStatus.COMPLETED,
          followUpId: followUpResult.followUpId,
        },
      });
    } else {
      await prisma.salesCheckIn.delete({ where: { id: checkIn.id } });
    }
  }

  const stillExists = await prisma.salesCheckIn.findUnique({
    where: { id: checkIn.id },
    select: { id: true },
  });
  if (stillExists && (hasCheckInLocation(checkIn) || input.clientIp)) {
    await applyCheckInIpAudit({
      checkInId: checkIn.id,
      clientIp: input.clientIp ?? null,
    });
  }

  return checkIn;
}

export async function createSalesCheckIn(input: CheckInWriteInput) {
  assertSalesLogRole(input.role);
  const mode = normalizeCheckInMode(input.checkInMode);
  const isInteraction = mode === "interaction";
  const customerId = isInteraction && input.customerId?.trim() ? input.customerId.trim() : null;
  const contactIds = normalizeContactIds(input);
  const primaryContactId = contactIds[0] ?? null;

  if (isInteraction) {
    if (!customerId) throw new Error("请选择客户");
    if (contactIds.length === 0) throw new Error("请至少选择一位联系人");

    const customer = await getCustomerForUser(customerId, input.role, input.userId);
    if (!customer) throw new Error("客户不存在或无权访问");
    await assertCustomerFollowUpWriteAccess(input.role, input.userId, customer);

    if (input.completeInteractionNow) {
      const pendingPlans = await getCustomerPendingFollowPlans(customerId, new Date());
      if (pendingPlans.length > 0 && (!input.completedPendingKeys || input.completedPendingKeys.length === 0)) {
        throw new Error("请至少选择一条要完成的待跟进计划");
      }

      const { start, end } = getTodayRange();
      const existingPending = await prisma.salesCheckIn.findFirst({
        where: {
          userId: input.userId,
          customerId,
          status: SalesCheckInStatus.PENDING,
          checkedInAt: { gte: start, lt: end },
        },
        orderBy: { checkedInAt: "desc" },
        select: { id: true },
      });
      if (existingPending) {
        return updateSalesCheckIn(existingPending.id, input);
      }
    }

    await assertContactsBelongToCustomer(customerId, contactIds);

    if (input.completeInteractionNow && !input.followUp?.content?.trim()) {
      throw new Error("请填写往来内容");
    }
  } else if (contactIds.length > 0) {
    throw new Error("无客户打卡不能选择联系人");
  }

  const dailyLog = await ensureTodayDailyLog(input.userId);
  const ctx: AgentWriteContext = {
    userId: input.userId,
    role: input.role,
    dailyLogId: dailyLog.id,
  };

  if (
    isInteraction &&
    input.completeInteractionNow &&
    input.followUp &&
    !hasCheckInLocation(input)
  ) {
    await createInteractionFollowUpFromCheckIn(
      ctx,
      input,
      customerId!,
      contactIds,
      new Date()
    );
    return null;
  }

  const checkIn = await prisma.salesCheckIn.create({
    data: {
      userId: input.userId,
      customerId: customerId ?? undefined,
      contactId: isInteraction ? primaryContactId || undefined : undefined,
      latitude: input.latitude ?? undefined,
      longitude: input.longitude ?? undefined,
      locationText: input.locationText?.trim() || undefined,
      addressProvince: input.addressProvince?.trim() || undefined,
      addressCity: input.addressCity?.trim() || undefined,
      addressDistrict: input.addressDistrict?.trim() || undefined,
      addressStreet: input.addressStreet?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      salesDailyLogId: dailyLog.id,
      status: isInteraction ? SalesCheckInStatus.PENDING : SalesCheckInStatus.COMPLETED,
    },
    include: {
      customer: { select: { name: true } },
      contact: { select: { name: true, title: true } },
    },
  });

  if (isInteraction && input.completeInteractionNow && input.followUp) {
    const followUpResult = await createInteractionFollowUpFromCheckIn(
      ctx,
      input,
      customerId!,
      contactIds,
      checkIn.checkedInAt
    );

    await prisma.salesCheckIn.update({
      where: { id: checkIn.id },
      data: {
        status: SalesCheckInStatus.COMPLETED,
        followUpId: followUpResult.followUpId,
      },
    });
  }

  if (hasCheckInLocation(checkIn) || input.clientIp) {
    await applyCheckInIpAudit({
      checkInId: checkIn.id,
      clientIp: input.clientIp ?? null,
    });
  }

  return checkIn;
}

export async function listTodayCheckIns(role: UserRole, userId: string, status?: SalesCheckInStatus) {
  const { start, end } = getTodayRange();
  return prisma.salesCheckIn.findMany({
    where: {
      ...salesCheckInListWhere(role, userId),
      checkedInAt: { gte: start, lt: end },
      ...(status ? { status } : {}),
    },
    orderBy: { checkedInAt: "desc" },
    include: {
      customer: { select: { id: true, name: true, customerGrade: true } },
      contact: { select: { id: true, name: true, title: true } },
      user: { select: { id: true, name: true } },
      followUp: { select: { id: true, method: true, content: true } },
    },
  });
}

export function checkInRequiresFollowUp(checkIn: { customerId: string | null; status: SalesCheckInStatus }) {
  return Boolean(checkIn.customerId) && checkIn.status === SalesCheckInStatus.PENDING;
}

export function checkInStatusLabel(checkIn: { customerId: string | null; status: SalesCheckInStatus }) {
  if (!checkIn.customerId) return "已记录";
  if (checkIn.status === SalesCheckInStatus.PENDING) return "待完善";
  return "已完善";
}

/** 规范化 Agent 传入的打卡 ID（避免复制快照里的 id= 前缀） */
export function normalizeAgentCheckInId(raw: string): string {
  const trimmed = raw.trim();
  const labeled = trimmed.match(/(?:^id[=:\s]+|^checkInId[=:\s]+)(c[a-z0-9]+)/i);
  if (labeled) return labeled[1];
  const bare = trimmed.match(/^(c[a-z0-9]{20,})$/i);
  if (bare) return bare[1];
  return trimmed;
}

const checkInForAgentInclude = {
  customer: { select: { name: true } },
} as const;

async function findCheckInForAgentCompletion(ctx: AgentWriteContext, rawCheckInId: string) {
  const checkInId = normalizeAgentCheckInId(rawCheckInId);
  const direct = await prisma.salesCheckIn.findUnique({
    where: { id: checkInId },
    include: checkInForAgentInclude,
  });
  if (direct) return { checkIn: direct, autoResolved: false as const };

  const { start, end } = getTodayRange();
  const pending = await prisma.salesCheckIn.findMany({
    where: {
      ...salesCheckInListWhere(ctx.role, ctx.userId),
      customerId: { not: null },
      status: SalesCheckInStatus.PENDING,
      checkedInAt: { gte: start, lt: end },
    },
    include: checkInForAgentInclude,
    orderBy: { checkedInAt: "asc" },
  });

  if (pending.length === 1) {
    return { checkIn: pending[0], autoResolved: true as const };
  }

  return {
    checkIn: null,
    autoResolved: false as const,
    pendingCount: pending.length,
  };
}

export async function completeSalesCheckInManually(input: {
  checkInId: string;
  userId: string;
  role: UserRole;
  contactId?: string;
  contactIds?: string[];
  method: Parameters<typeof createFollowUpFromAgent>[1]["method"];
  content: string;
  result?: string | null;
  suggestedGrade?: string | null;
  opportunityId?: string | null;
  nextFollowUpAt?: string | null;
  nextFollowUpMethod?: Parameters<typeof createFollowUpFromAgent>[1]["method"];
  nextFollowUpContent?: string | null;
}) {
  const dailyLog = await ensureTodayDailyLog(input.userId);

  const checkIn = await prisma.salesCheckIn.findUnique({
    where: { id: input.checkInId },
    select: { id: true, customerId: true, contactId: true },
  });
  if (!checkIn?.customerId) throw new Error("打卡记录无效");

  const contactIds = normalizeContactIds(input);
  if (contactIds.length === 0) throw new Error("请至少选择一位联系人");
  await assertContactsBelongToCustomer(checkIn.customerId, contactIds);
  const primaryContactId = contactIds[0];

  if (primaryContactId !== checkIn.contactId) {
    await prisma.salesCheckIn.update({
      where: { id: input.checkInId },
      data: { contactId: primaryContactId },
    });
  }

  return completeCheckInFromAgent(
    { userId: input.userId, role: input.role, dailyLogId: dailyLog.id },
    {
      checkInId: input.checkInId,
      contactIds,
      method: input.method,
      content: input.content,
      result: input.result ?? undefined,
      suggestedGrade: input.suggestedGrade,
      opportunityId: input.opportunityId ?? undefined,
      nextFollowUpAt: input.nextFollowUpAt ?? undefined,
      nextFollowUpMethod: input.nextFollowUpMethod,
      nextFollowUpContent: input.nextFollowUpContent ?? undefined,
    }
  );
}

export async function deleteSalesCheckIn(input: {
  checkInId: string;
  userId: string;
  role: UserRole;
}) {
  assertSalesLogRole(input.role);
  const checkIn = await prisma.salesCheckIn.findUnique({
    where: { id: input.checkInId },
    select: {
      id: true,
      userId: true,
      followUpId: true,
      customer: { select: { name: true } },
    },
  });

  if (!checkIn) throw new Error("打卡记录不存在");
  if (input.role === "SALES" && checkIn.userId !== input.userId) {
    throw new Error("无权删除该打卡记录");
  }

  await prisma.salesCheckIn.delete({ where: { id: checkIn.id } });

  return {
    id: checkIn.id,
    hadFollowUp: Boolean(checkIn.followUpId),
    customerName: checkIn.customer?.name ?? null,
  };
}

export async function completeCheckInFromAgent(
  ctx: AgentWriteContext,
  input: {
    checkInId: string;
    contactId?: string;
    contactIds?: string[];
    opportunityId?: string;
    method: Parameters<typeof createFollowUpFromAgent>[1]["method"];
    content: string;
    result?: string;
    followUpAt?: string;
    nextFollowUpAt?: string;
    nextFollowUpMethod?: Parameters<typeof createFollowUpFromAgent>[1]["method"];
    nextFollowUpContent?: string;
    suggestedGrade?: string | null;
  }
) {
  const resolved = await findCheckInForAgentCompletion(ctx, input.checkInId);
  if (!resolved.checkIn) {
    const hint =
      resolved.pendingCount > 1
        ? `今日还有 ${resolved.pendingCount} 条待完善打卡，请先调用 listTodayCheckIns 获取正确 checkInId。`
        : "请先调用 listTodayCheckIns 获取最新 checkInId，勿使用快照或对话中的过期 ID。";
    throw new Error(`打卡记录不存在（checkInId=${normalizeAgentCheckInId(input.checkInId)}）。${hint}`);
  }

  const checkIn = resolved.checkIn;
  const autoResolvedNote = resolved.autoResolved
    ? `（已自动匹配今日唯一待完善打卡 ${checkIn.id}）`
    : "";

  if (!checkIn.customerId) {
    throw new Error("无客户打卡仅记录定位，无需完善往来");
  }
  if (checkIn.userId !== ctx.userId && ctx.role === "SALES") {
    throw new Error("无权完善该打卡记录");
  }
  if (checkIn.status === SalesCheckInStatus.COMPLETED) {
    return {
      success: true as const,
      alreadyCompleted: true,
      followUpId: checkIn.followUpId,
      message: `打卡「${checkIn.customer!.name}」已完善过${autoResolvedNote}`,
    };
  }

  const contactIds = normalizeContactIds({
    contactId: input.contactId ?? checkIn.contactId,
    contactIds: input.contactIds,
  });

  const followUpResult = await createFollowUpFromAgent(ctx, {
    customerId: checkIn.customerId,
    contactIds,
    opportunityId: input.opportunityId,
    method: input.method,
    content: input.content,
    result: input.result,
    followUpAt: input.followUpAt ?? checkIn.checkedInAt.toISOString(),
    nextFollowUpAt: input.nextFollowUpAt,
    nextFollowUpMethod: input.nextFollowUpMethod,
    nextFollowUpContent: input.nextFollowUpContent,
    suggestedGrade: input.suggestedGrade,
  });

  await prisma.salesCheckIn.update({
    where: { id: checkIn.id },
    data: {
      status: SalesCheckInStatus.COMPLETED,
      followUpId: followUpResult.followUpId,
    },
  });

  return {
    success: true as const,
    checkInId: checkIn.id,
    followUpId: followUpResult.followUpId,
    customerName: checkIn.customer!.name,
    message: `已完善打卡并写入跟进：${checkIn.customer!.name}${autoResolvedNote}`,
  };
}
