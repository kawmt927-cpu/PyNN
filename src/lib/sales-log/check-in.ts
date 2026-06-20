import { SalesCheckInStatus, UserRole } from "@prisma/client";
import { getCustomerForUser } from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";
import { getTodayRange, salesCheckInListWhere } from "@/lib/sales-log/access";
import { ensureTodayDailyLog } from "@/lib/sales-log/daily-log";
import type { CheckInFollowUpInput, CheckInMode } from "@/lib/validations/sales-log";
import { LEGACY_CHECK_IN_MODE_WITH_CUSTOMER, normalizeCheckInMode } from "@/lib/validations/sales-log";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import type { AgentWriteContext } from "@/lib/sales-log/write";
import { createFollowUpFromAgent } from "@/lib/sales-log/write";

export async function createSalesCheckIn(input: {
  userId: string;
  role: UserRole;
  checkInMode?: CheckInMode | typeof LEGACY_CHECK_IN_MODE_WITH_CUSTOMER;
  customerId?: string | null;
  contactId?: string | null;
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
}) {
  const mode = normalizeCheckInMode(input.checkInMode);
  const isInteraction = mode === "interaction";
  const customerId = isInteraction && input.customerId?.trim() ? input.customerId.trim() : null;

  if (isInteraction) {
    if (!customerId) throw new Error("请选择客户");

    const customer = await getCustomerForUser(customerId, input.role, input.userId);
    if (!customer) throw new Error("客户不存在或无权访问");

    if (input.contactId) {
      const contact = await prisma.contact.findFirst({
        where: { id: input.contactId, customerId },
      });
      if (!contact) throw new Error("联系人不属于该客户");
    }

    if (input.completeInteractionNow && !input.followUp?.content?.trim()) {
      throw new Error("请填写往来内容");
    }
  } else if (input.contactId) {
    throw new Error("无客户打卡不能选择联系人");
  }

  const dailyLog = await ensureTodayDailyLog(input.userId);
  const ctx: AgentWriteContext = {
    userId: input.userId,
    role: input.role,
    dailyLogId: dailyLog.id,
  };

  const checkIn = await prisma.salesCheckIn.create({
    data: {
      userId: input.userId,
      customerId: customerId ?? undefined,
      contactId: isInteraction ? input.contactId || undefined : undefined,
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
    const locationLabel = formatCheckInLocation(input);
    const followUpResult = await createFollowUpFromAgent(ctx, {
      customerId: customerId!,
      contactId: input.contactId ?? undefined,
      method: input.followUp.method,
      content: input.followUp.content,
      result: input.followUp.result ?? undefined,
      followUpAt: checkIn.checkedInAt.toISOString(),
      nextFollowUpAt: input.followUp.nextFollowUpAt ?? undefined,
      location: input.followUp.location ?? locationLabel,
      detailedNotes: input.followUp.detailedNotes ?? undefined,
    });

    await prisma.salesCheckIn.update({
      where: { id: checkIn.id },
      data: {
        status: SalesCheckInStatus.COMPLETED,
        followUpId: followUpResult.followUpId,
      },
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
      customer: { select: { id: true, name: true } },
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

export async function deleteSalesCheckIn(input: {
  checkInId: string;
  userId: string;
  role: UserRole;
}) {
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
    method: Parameters<typeof createFollowUpFromAgent>[1]["method"];
    content: string;
    result?: string;
    followUpAt?: string;
    nextFollowUpAt?: string;
    suggestedGrade?: string | null;
    location?: string;
    detailedNotes?: string;
  }
) {
  const checkIn = await prisma.salesCheckIn.findUnique({
    where: { id: input.checkInId },
    include: { customer: { select: { name: true } } },
  });

  if (!checkIn) throw new Error("打卡记录不存在");
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
      message: `打卡「${checkIn.customer!.name}」已完善过`,
    };
  }

  const followUpResult = await createFollowUpFromAgent(ctx, {
    customerId: checkIn.customerId,
    contactId: checkIn.contactId ?? undefined,
    method: input.method,
    content: input.content,
    result: input.result,
    followUpAt: input.followUpAt ?? checkIn.checkedInAt.toISOString(),
    nextFollowUpAt: input.nextFollowUpAt,
    suggestedGrade: input.suggestedGrade,
    location: input.location ?? checkIn.locationText ?? undefined,
    detailedNotes: input.detailedNotes,
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
    message: `已完善打卡并写入跟进：${checkIn.customer!.name}`,
  };
}
