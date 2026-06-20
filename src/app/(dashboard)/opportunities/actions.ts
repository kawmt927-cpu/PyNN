"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { customerFormSchema } from "@/lib/validations/customer";
import {
  opportunityFormSchema,
  opportunityFollowUpSchema,
  abandonOpportunitySchema,
  restoreOpportunityStatusSchema,
} from "@/lib/validations/opportunity";
import {
  canManageOpportunityOwner,
  canEditOpportunityContent,
  canFollowUpOpportunity,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { buildOpportunityEditChanges } from "@/lib/opportunities/edit-log";
import {
  buildFollowUpOpportunityUpdateData,
  summarizeFollowUpOpportunityChanges,
  toFollowUpOpportunityInput,
} from "@/lib/opportunities/follow-up-opportunity";
import { parseExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import {
  formatAbandonSummary,
  OPPORTUNITY_STATUS_LABELS,
} from "@/lib/opportunities/status";
import { getCustomerForUser } from "@/lib/customers/access";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import { assertCustomerGrade, requireCustomerGrade } from "@/lib/customers/grade";

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
  if (canManageOpportunityOwner(role) && ownerId) return ownerId;
  return userId;
}

function formatActionError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "表单校验失败" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败，请重试" };
}

async function resolveCustomerId(
  formData: FormData,
  role: UserRole,
  userId: string
): Promise<string> {
  const mode = formData.get("customerMode")?.toString() ?? "existing";

  if (mode === "existing") {
    const customerId = formData.get("customerId")?.toString().trim();
    if (!customerId) throw new Error("请选择销售对象（客户）");
    const customer = await getCustomerForUser(customerId, role, userId);
    if (!customer) throw new Error("无权使用该客户");
    return customerId;
  }

  const data = parseCustomerForm(formData);
  const configFields = await validateCustomerConfigFields(data);
  const ownerId = resolveOwnerId(role, userId, data.ownerId);

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
      source: configFields.source ?? undefined,
      customerType: configFields.customerType ?? undefined,
      customerGrade: configFields.customerGrade ?? undefined,
      notes: data.notes,
      ownerId,
    },
  });
  return customer.id;
}

function parseOpportunityForm(formData: FormData) {
  const winProbRaw = formData.get("winProbability")?.toString().trim();
  return opportunityFormSchema.parse({
    title: formData.get("title"),
    customerId: formData.get("customerId") || undefined,
    customerMode: formData.get("customerMode") ?? "existing",
    expectedAmount: formData.get("expectedAmount"),
    expectedCloseDate: formData.get("expectedCloseDate"),
    stage: formData.get("stage"),
    requirementDesc: formData.get("requirementDesc") || undefined,
    winProbability: winProbRaw ? Number(winProbRaw) : null,
    competitor: formData.get("competitor") || undefined,
    notes: formData.get("notes") || undefined,
    ownerId: parseOwnerField(formData.get("ownerId")),
  });
}

export async function createOpportunity(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseOpportunityForm(formData);
    const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
    const stage = await assertConfigValue(CONFIG_CATEGORY.OPPORTUNITY_STAGE, parsed.stage);
    if (!stage) throw new Error("请选择商机阶段");

    const customerId = await resolveCustomerId(formData, session.user.role, session.user.id);
    const ownerId = resolveOwnerId(session.user.role, session.user.id, parsed.ownerId);

    const opportunity = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          title: parsed.title.trim(),
          customerId,
          ownerId,
          expectedAmount: parsed.expectedAmount,
          expectedCloseDate: parseExpectedCloseMonth(parsed.expectedCloseDate),
          stage,
          requirementDesc: parsed.requirementDesc?.trim() || undefined,
          winProbability: parsed.winProbability ?? undefined,
          competitor: parsed.competitor?.trim() || undefined,
          notes: parsed.notes?.trim() || undefined,
        },
      });
      await tx.opportunityStageLog.create({
        data: {
          opportunityId: created.id,
          userId: session.user.id,
          toStage: stage,
          note: "创建商机",
        },
      });
      return created;
    });

    revalidatePath("/opportunities");
    revalidatePath("/customers");
    return { redirectTo: `/opportunities/${opportunity.id}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function updateOpportunity(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const existing = await prisma.opportunity.findUnique({
      where: { id },
      include: { owner: { select: { name: true } } },
    });
    if (!existing) return { error: "商机不存在或无权访问" };
    if (!canEditOpportunityContent(session.user.role, session.user.id, existing)) {
      return { error: "无权编辑该商机" };
    }

    const parsed = parseOpportunityForm(formData);
    const { CONFIG_CATEGORY, assertConfigValue, getConfigOptionMaps } = await import(
      "@/lib/config-options"
    );
    const stage = await assertConfigValue(CONFIG_CATEGORY.OPPORTUNITY_STAGE, parsed.stage);
    if (!stage) throw new Error("请选择商机阶段");

    const ownerId = resolveOwnerId(session.user.role, session.user.id, parsed.ownerId);
    const stageLabels = (await getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]))[
      CONFIG_CATEGORY.OPPORTUNITY_STAGE
    ] ?? {};

    const ownerUser = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { name: true },
    });

    const changes = buildOpportunityEditChanges(
      existing,
      {
        title: parsed.title.trim(),
        ownerId,
        ownerName: ownerUser?.name ?? ownerId,
        expectedAmount: parsed.expectedAmount,
        expectedCloseDate: parsed.expectedCloseDate,
        stage,
        requirementDesc: parsed.requirementDesc?.trim() || null,
        winProbability: parsed.winProbability ?? null,
        competitor: parsed.competitor?.trim() || null,
        notes: parsed.notes?.trim() || null,
      },
      stageLabels
    );

    await prisma.$transaction(async (tx) => {
      await tx.opportunity.update({
        where: { id },
        data: {
          title: parsed.title.trim(),
          ownerId,
          expectedAmount: existing.amountLocked ? undefined : parsed.expectedAmount,
          expectedCloseDate: parseExpectedCloseMonth(parsed.expectedCloseDate),
          stage,
          requirementDesc: parsed.requirementDesc?.trim() || null,
          winProbability: parsed.winProbability ?? null,
          competitor: parsed.competitor?.trim() || null,
          notes: parsed.notes?.trim() || null,
        },
      });

      if (changes.length > 0) {
        await tx.opportunityStageLog.create({
          data: {
            opportunityId: id,
            userId: session.user.id,
            fromStage: existing.stage !== stage ? existing.stage : null,
            toStage: stage,
            note: `编辑: ${changes.join("; ")}`,
          },
        });
      }
    });

    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${id}`);
    return { redirectTo: `/opportunities/${id}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function abandonOpportunity(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = abandonOpportunitySchema.parse({
      opportunityId: formData.get("opportunityId"),
      reason: formData.get("reason"),
      note: formData.get("note")?.toString() || undefined,
    });

    const existing = await prisma.opportunity.findUnique({
      where: { id: parsed.opportunityId },
    });
    if (!existing) return { error: "商机不存在或无权访问" };
    if (!canEditOpportunityContent(session.user.role, session.user.id, existing)) {
      return { error: "无权操作该商机" };
    }
    if (existing.status !== "NOT_SIGNED") {
      return { error: "仅未签约的商机可以放弃" };
    }

    const abandonSummary = formatAbandonSummary(parsed.reason, parsed.note);

    await prisma.$transaction(async (tx) => {
      await tx.opportunity.update({
        where: { id: parsed.opportunityId },
        data: {
          status: "ABANDONED",
          abandonReason: parsed.reason,
          abandonNote: parsed.note?.trim() || null,
        },
      });

      await tx.opportunityStageLog.create({
        data: {
          opportunityId: parsed.opportunityId,
          userId: session.user.id,
          fromStage: existing.stage,
          toStage: existing.stage,
          note: `状态变更: ${OPPORTUNITY_STATUS_LABELS.NOT_SIGNED} → ${OPPORTUNITY_STATUS_LABELS.ABANDONED}；${abandonSummary}`,
        },
      });
    });

    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${parsed.opportunityId}`);
    return { redirectTo: `/opportunities/${parsed.opportunityId}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function restoreOpportunityStatus(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
    const parsed = restoreOpportunityStatusSchema.parse({
      opportunityId: formData.get("opportunityId"),
    });

    const existing = await prisma.opportunity.findUnique({
      where: { id: parsed.opportunityId },
    });
    if (!existing) return { error: "商机不存在" };
    if (existing.status !== "ABANDONED") {
      return { error: "仅已放弃的商机可调整状态" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.opportunity.update({
        where: { id: parsed.opportunityId },
        data: {
          status: "NOT_SIGNED",
          abandonReason: null,
          abandonNote: null,
        },
      });

      await tx.opportunityStageLog.create({
        data: {
          opportunityId: parsed.opportunityId,
          userId: session.user.id,
          fromStage: existing.stage,
          toStage: existing.stage,
          note: `状态变更: ${OPPORTUNITY_STATUS_LABELS.ABANDONED} → ${OPPORTUNITY_STATUS_LABELS.NOT_SIGNED}`,
        },
      });
    });

    revalidatePath("/opportunities");
    revalidatePath(`/opportunities/${parsed.opportunityId}`);
    revalidatePath(`/opportunities/${parsed.opportunityId}/follow-ups`);
    revalidatePath(`/opportunities/${parsed.opportunityId}/edit`);
    return { redirectTo: `/opportunities/${parsed.opportunityId}` };
  } catch (error) {
    return formatActionError(error);
  }
}

function parseOpportunityFollowUpForm(formData: FormData) {
  const winProbRaw = formData.get("winProbability")?.toString().trim();
  const followUpId = formData.get("followUpId")?.toString().trim();
  return opportunityFollowUpSchema.parse({
    opportunityId: formData.get("opportunityId"),
    followUpId: followUpId || undefined,
    method: formData.get("method"),
    content: formData.get("content"),
    followUpAt: formData.get("followUpAt"),
    nextFollowUpAt: formData.get("nextFollowUpAt") || null,
    expectedAmount: formData.get("expectedAmount"),
    expectedCloseDate: formData.get("expectedCloseDate"),
    stage: formData.get("stage"),
    requirementDesc: formData.get("requirementDesc") || undefined,
    winProbability: winProbRaw ? Number(winProbRaw) : null,
    competitor: formData.get("competitor") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

async function revalidateOpportunityFollowUpPaths(opportunityId: string, customerId: string) {
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath(`/opportunities/${opportunityId}/follow-ups`);
  revalidatePath(`/customers/${customerId}/follow-ups`);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/follow-ups");
}

export async function createOpportunityFollowUp(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseOpportunityFollowUpForm(formData);

    const existing = await prisma.opportunity.findUnique({
      where: { id: parsed.opportunityId },
      include: { owner: { select: { name: true } } },
    });
    if (!existing) return { error: "商机不存在或无权访问" };
    if (!canFollowUpOpportunity(session.user.role, session.user.id, existing)) {
      return { error: "无权跟进该商机" };
    }

    const { CONFIG_CATEGORY, assertConfigValue, getConfigOptionMaps } = await import(
      "@/lib/config-options"
    );
    const stage = await assertConfigValue(CONFIG_CATEGORY.OPPORTUNITY_STAGE, parsed.stage);
    if (!stage) throw new Error("请选择商机阶段");

    const stageLabels = (await getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]))[
      CONFIG_CATEGORY.OPPORTUNITY_STAGE
    ] ?? {};
    const opportunityInput = toFollowUpOpportunityInput({ ...parsed, stage });
    const changeSummary = summarizeFollowUpOpportunityChanges(
      existing,
      opportunityInput,
      stageLabels
    );

    await prisma.$transaction(async (tx) => {
      if (changeSummary) {
        await tx.opportunity.update({
          where: { id: parsed.opportunityId },
          data: buildFollowUpOpportunityUpdateData(existing, opportunityInput),
        });
      }

      await tx.opportunityFollowUp.create({
        data: {
          opportunityId: parsed.opportunityId,
          userId: session.user.id,
          method: parsed.method,
          content: parsed.content,
          followUpAt: new Date(parsed.followUpAt),
          nextFollowUpAt: parsed.nextFollowUpAt ? new Date(parsed.nextFollowUpAt) : undefined,
          changeSummary,
        },
      });
    });

    await revalidateOpportunityFollowUpPaths(parsed.opportunityId, existing.customerId);
    return { redirectTo: `/opportunities/${parsed.opportunityId}` };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function updateOpportunityFollowUp(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseOpportunityFollowUpForm(formData);
    if (!parsed.followUpId) return { error: "缺少跟进记录 ID" };

    const followUp = await prisma.opportunityFollowUp.findUnique({
      where: { id: parsed.followUpId },
      include: { opportunity: { include: { owner: { select: { name: true } } } } },
    });
    if (!followUp || followUp.opportunityId !== parsed.opportunityId) {
      return { error: "跟进记录不存在" };
    }
    if (!canFollowUpOpportunity(session.user.role, session.user.id, followUp.opportunity)) {
      return { error: "无权修改该跟进记录" };
    }

    const { CONFIG_CATEGORY, assertConfigValue, getConfigOptionMaps } = await import(
      "@/lib/config-options"
    );
    const stage = await assertConfigValue(CONFIG_CATEGORY.OPPORTUNITY_STAGE, parsed.stage);
    if (!stage) throw new Error("请选择商机阶段");

    const stageLabels = (await getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]))[
      CONFIG_CATEGORY.OPPORTUNITY_STAGE
    ] ?? {};
    const opportunityInput = toFollowUpOpportunityInput({ ...parsed, stage });
    const changeSummary = summarizeFollowUpOpportunityChanges(
      followUp.opportunity,
      opportunityInput,
      stageLabels
    );

    await prisma.$transaction(async (tx) => {
      if (changeSummary) {
        await tx.opportunity.update({
          where: { id: parsed.opportunityId },
          data: buildFollowUpOpportunityUpdateData(followUp.opportunity, opportunityInput),
        });
      }

      await tx.opportunityFollowUp.update({
        where: { id: parsed.followUpId },
        data: {
          method: parsed.method,
          content: parsed.content,
          followUpAt: new Date(parsed.followUpAt),
          nextFollowUpAt: parsed.nextFollowUpAt ? new Date(parsed.nextFollowUpAt) : null,
          changeSummary: changeSummary ?? followUp.changeSummary,
        },
      });
    });

    await revalidateOpportunityFollowUpPaths(parsed.opportunityId, followUp.opportunity.customerId);
    return { redirectTo: `/opportunities/${parsed.opportunityId}` };
  } catch (error) {
    return formatActionError(error);
  }
}
