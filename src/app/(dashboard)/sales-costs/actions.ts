"use server";

import { revalidatePath } from "next/cache";
import { SalesCostType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { parsePlannedFollowUpDateInput } from "@/lib/dates/local-date";
import {
  computePresalesPersonnelCost,
  computeTravelTotal,
} from "@/lib/sales-costs/compute";
import { parseSalesCostFormData, type SalesCostFormInput } from "@/lib/validations/sales-cost";

function formatError(error: unknown): ActionResult {
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

async function requireSalesCostManager() {
  return requireRole(["SALES_MANAGER", "ADMIN"]);
}

async function resolvePresalesDailyRate(presalesUserId: string) {
  const profile = await prisma.personnelProfile.findUnique({
    where: { userId: presalesUserId },
    select: { isPresales: true, dailyRate: true, enabled: true },
  });
  if (!profile?.enabled || !profile.isPresales || profile.dailyRate == null) {
    throw new Error("售前人员无效或未设置日单价");
  }
  return Number(profile.dailyRate);
}

const EMPTY_TRAVEL = {
  accommodation: null,
  transportation: null,
  meals: null,
  otherTravel: null,
  accommodationNote: null,
  transportationNote: null,
  mealsNote: null,
  otherTravelNote: null,
};

type TravelParsed = Extract<
  SalesCostFormInput,
  { costType: typeof SalesCostType.PERSONAL_TRAVEL | typeof SalesCostType.PRESALES }
>;

function travelFromParsed(parsed: TravelParsed) {
  return {
    accommodation: parsed.accommodation ?? 0,
    transportation: parsed.transportation ?? 0,
    meals: parsed.meals ?? 0,
    otherTravel: parsed.otherTravel ?? 0,
    accommodationNote: parsed.accommodationNote?.trim() || null,
    transportationNote: parsed.transportationNote?.trim() || null,
    mealsNote: parsed.mealsNote?.trim() || null,
    otherTravelNote: parsed.otherTravelNote?.trim() || null,
  };
}

function buildCostData(
  parsed: ReturnType<typeof parseSalesCostFormData>,
  recordedById: string,
  costDate: Date
) {
  if (parsed.costType === SalesCostType.BUSINESS) {
    return {
      salesUserId: parsed.salesUserId,
      recordedById,
      costType: parsed.costType,
      costDate,
      customerId: parsed.customerId,
      totalAmount: parsed.totalAmount,
      description: parsed.description?.trim() || null,
      presalesUserId: null,
      presalesDays: null,
      presalesPersonnelCost: null,
      ...EMPTY_TRAVEL,
    };
  }

  const travel = travelFromParsed(parsed as TravelParsed);
  const travelTotal = computeTravelTotal(travel);

  if (parsed.costType === SalesCostType.PERSONAL_TRAVEL) {
    if (travelTotal <= 0) throw new Error("请填写至少一项差旅费用");
    return {
      salesUserId: parsed.salesUserId,
      recordedById,
      costType: parsed.costType,
      costDate,
      totalAmount: travelTotal,
      description: null,
      customerId: null,
      presalesUserId: null,
      presalesDays: null,
      presalesPersonnelCost: null,
      ...travel,
    };
  }

  return {
    salesUserId: parsed.salesUserId,
    recordedById,
    costType: parsed.costType,
    costDate,
    customerId: null,
    presalesUserId: parsed.presalesUserId,
    presalesDays: parsed.presalesDays,
    description: null,
    ...travel,
    presalesPersonnelCost: 0,
    totalAmount: travelTotal,
  };
}

async function finalizePresalesCost(
  data: ReturnType<typeof buildCostData> & { costType: typeof SalesCostType.PRESALES },
  presalesUserId: string,
  presalesDays: number
) {
  const dailyRate = await resolvePresalesDailyRate(presalesUserId);
  const personnelCost = computePresalesPersonnelCost(dailyRate, presalesDays);
  data.presalesPersonnelCost = personnelCost;
  data.totalAmount = personnelCost + computeTravelTotal(data);
  return data;
}

export async function createSalesCost(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSalesCostManager();
    const parsed = parseSalesCostFormData(formData);
    const costDate = parsePlannedFollowUpDateInput(parsed.costDate);
    if (!costDate) throw new Error("费用日期无效");

    let data = buildCostData(parsed, session.user.id, costDate);
    if (parsed.costType === SalesCostType.PRESALES) {
      data = await finalizePresalesCost(
        data as typeof data & { costType: typeof SalesCostType.PRESALES },
        parsed.presalesUserId,
        parsed.presalesDays
      );
    }

    await prisma.salesCost.create({ data });
    revalidatePath("/sales-costs");
    revalidatePath("/plans-tasks");
    return { redirectTo: "/sales-costs" };
  } catch (error) {
    return formatError(error);
  }
}

export async function updateSalesCost(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireSalesCostManager();
    const id = formData.get("id")?.toString();
    if (!id) return { error: "缺少 ID" };

    const existing = await prisma.salesCost.findUnique({ where: { id } });
    if (!existing) return { error: "记录不存在" };

    const parsed = parseSalesCostFormData(formData);
    const costDate = parsePlannedFollowUpDateInput(parsed.costDate);
    if (!costDate) throw new Error("费用日期无效");

    let data = buildCostData(parsed, existing.recordedById, costDate);
    if (parsed.costType === SalesCostType.PRESALES) {
      data = await finalizePresalesCost(
        data as typeof data & { costType: typeof SalesCostType.PRESALES },
        parsed.presalesUserId,
        parsed.presalesDays
      );
    }

    await prisma.salesCost.update({ where: { id }, data });
    revalidatePath("/sales-costs");
    revalidatePath("/plans-tasks");
    return { redirectTo: "/sales-costs" };
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteSalesCost(id: string): Promise<ActionResult> {
  try {
    await requireSalesCostManager();
    if (!id) return { error: "缺少 ID" };
    await prisma.salesCost.delete({ where: { id } });
    revalidatePath("/sales-costs");
    revalidatePath("/plans-tasks");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function listSalesUsersForCost() {
  await requireSalesCostManager();
  return prisma.user.findMany({
    where: { personnelProfile: { staffCategory: "SALES", enabled: true } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function deleteSalesCostById(formData: FormData): Promise<void> {
  const id = formData.get("id")?.toString();
  if (!id) return;
  await deleteSalesCost(id);
}

export async function listPresalesUsersForCost() {
  await requireSalesCostManager();
  const users = await prisma.user.findMany({
    where: {
      personnelProfile: { isPresales: true, enabled: true, dailyRate: { not: null } },
    },
    select: {
      id: true,
      name: true,
      personnelProfile: { select: { dailyRate: true } },
    },
    orderBy: { name: "asc" },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    personnelProfile: user.personnelProfile
      ? { dailyRate: Number(user.personnelProfile.dailyRate) }
      : null,
  }));
}
