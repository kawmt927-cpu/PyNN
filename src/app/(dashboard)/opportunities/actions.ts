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
  opportunityQuoteSchema,
  opportunityQuoteUpdateSchema,
} from "@/lib/validations/opportunity";
import {
  canManageOpportunityOwner,
  canEditOpportunityContent,
  canFollowUpOpportunityForUser,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { hasPermission } from "@/lib/rbac/has-permission";
import { buildOpportunityEditChanges } from "@/lib/opportunities/edit-log";
import {
  buildFollowUpOpportunityUpdateData,
  summarizeFollowUpOpportunityChanges,
  toFollowUpOpportunityInput,
} from "@/lib/opportunities/follow-up-opportunity";
import { parseExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import {
  canAddOpportunityQuote,
  formatAbandonSummary,
  OPPORTUNITY_STATUS_LABELS,
} from "@/lib/opportunities/status";
import {
  deleteOpportunityQuoteAttachmentFile,
} from "@/lib/opportunities/quote-attachments";
import { formatAmount } from "@/lib/opportunities/funnel";
import { recordEntityOperation, ENTITY_TYPES } from "@/lib/audit/entity-operation-log";
import { getCustomerForUser } from "@/lib/customers/access";
import { assertSelectableSalesOwner } from "@/lib/sales/selectable-users";
import { assertCustomerNameAvailable } from "@/lib/customers/duplicate-name";
import { parsePlannedFollowUpDateInput } from "@/lib/dates/local-date";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import { assertCustomerGrade } from "@/lib/customers/grade";
import { assertOpportunityGrade } from "@/lib/opportunities/grade";
import {
  assertPartiesNotOverlappingPrimary,
  readPartiesFromFormData,
  replaceOpportunityParties,
} from "@/lib/deals/party-sync";
import {
  enforceCustomerTypeForCategory,
  requireCustomerGradeForType,
} from "@/lib/customers/customer-type-grade";

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
  category: string;
  source?: string | null;
  customerType?: string | null;
  customerGrade?: string | null;
}) {
  const { CONFIG_CATEGORY, assertConfigValue, getConfigOptions } = await import(
    "@/lib/config-options"
  );
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
  };
}

async function resolveOwnerId(role: UserRole, userId: string, ownerId: string | null | undefined) {
  if (role === "SALES") return userId;
  if (canManageOpportunityOwner(role) && ownerId) {
    await assertSelectableSalesOwner(role, userId, ownerId);
    return ownerId;
  }
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
): Promise<string | null> {
  const mode = formData.get("customerMode")?.toString() ?? "existing";

  if (mode === "existing") {
    const customerId = formData.get("customerId")?.toString().trim();
    if (!customerId) return null;
    const customer = await getCustomerForUser(customerId, role, userId, {
      allowFollowUpOnAnyCustomer: true,
    });
    if (!customer) throw new Error("无权使用该客户");
    return customerId;
  }

  const data = parseCustomerForm(formData);
  const configFields = await validateCustomerConfigFields(data);
  const ownerId = await resolveOwnerId(role, userId, data.ownerId);

  let name = data.name.trim();
  let province = data.province;
  let city = data.city;
  let district = data.district;
  let hospitalLevel = data.hospitalLevel ?? undefined;
  let bedCount = data.bedCount ?? undefined;

  if (data.category === "HOSPITAL" || data.category === "COMPANY") {
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

  const customer = await prisma.customer.create({
    data: {
      name,
      category: data.category,
      hospitalLevel: data.category === "HOSPITAL" ? hospitalLevel : undefined,
      province,
      city,
      district,
      bedCount: data.category === "HOSPITAL" ? bedCount : undefined,
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
    grade: formData.get("grade")?.toString().trim() || "",
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
    const grade = assertOpportunityGrade(parsed.grade);

    const customerId = await resolveCustomerId(formData, session.user.role, session.user.id);
    const ownerId = await resolveOwnerId(session.user.role, session.user.id, parsed.ownerId);
    const parties = readPartiesFromFormData(formData);
    assertPartiesNotOverlappingPrimary(parties, customerId);

    let confirmStatus: "CONFIRMED" | "PENDING_MANAGER" | "REJECTED" = "CONFIRMED";
    let customerName: string | null = null;
    if (customerId) {
      const customer = await getCustomerForUser(customerId, session.user.role, session.user.id, {
        allowFollowUpOnAnyCustomer: true,
      });
      if (!customer) throw new Error("无权使用该客户");
      customerName = customer.name;
      const { resolveOpportunityConfirmStatus, canProposeOpportunityOnCustomer } = await import(
        "@/lib/opportunities/confirm-status"
      );
      if (!canProposeOpportunityOnCustomer(session.user.role)) {
        throw new Error("无权新建商机");
      }
      confirmStatus = resolveOpportunityConfirmStatus({
        role: session.user.role,
        userId: session.user.id,
        customer,
      });
    }

    const confirmDuplicate = formData.get("confirmDuplicate") === "1";
    if (customerId && !confirmDuplicate) {
      const {
        findSameCustomerSameTitleOpportunities,
        formatDuplicateOpportunityConfirmMessage,
      } = await import("@/lib/opportunities/duplicate-title");
      const duplicates = await findSameCustomerSameTitleOpportunities({
        customerId,
        title: parsed.title,
      });
      if (duplicates.length > 0) {
        return {
          needsConfirm: {
            kind: "duplicate_opportunity",
            message: formatDuplicateOpportunityConfirmMessage(
              parsed.title.trim(),
              customerName,
              duplicates
            ),
            existingOpportunityId: duplicates[0].id,
            existingHref: `/opportunities/${duplicates[0].id}`,
          },
        };
      }
    }

    const opportunity = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          title: parsed.title.trim(),
          customerId,
          ownerId,
          createdById: session.user.id,
          expectedAmount: parsed.expectedAmount,
          expectedCloseDate: parseExpectedCloseMonth(parsed.expectedCloseDate),
          stage,
          grade,
          requirementDesc: parsed.requirementDesc?.trim() || undefined,
          winProbability: parsed.winProbability ?? undefined,
          competitor: parsed.competitor?.trim() || undefined,
          notes: parsed.notes?.trim() || undefined,
          confirmStatus,
          confirmedAt: confirmStatus === "CONFIRMED" ? new Date() : undefined,
          confirmedById: confirmStatus === "CONFIRMED" ? session.user.id : undefined,
        },
      });
      await replaceOpportunityParties(tx, created.id, parties);
      await tx.opportunityStageLog.create({
        data: {
          opportunityId: created.id,
          userId: session.user.id,
          toStage: stage,
          note:
            confirmStatus === "PENDING_MANAGER"
              ? "创建商机（待管理确认）"
              : confirmDuplicate
                ? "创建商机（确认同名后新建）"
                : "创建商机",
        },
      });
      return created;
    });

    if (confirmStatus === "PENDING_MANAGER" && customerId) {
      // 随往来代录一并确认，不单独进审批队列
    }

    revalidatePath("/opportunities");
    revalidatePath("/customers");
    revalidatePath("/approvals");

    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.OPPORTUNITY,
      entityId: opportunity.id,
      userId: session.user.id,
      action: "创建",
      summary:
        confirmStatus === "PENDING_MANAGER"
          ? `提交商机「${opportunity.title}」待确认`
          : `创建商机「${opportunity.title}」`,
    });

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
    const grade = assertOpportunityGrade(parsed.grade);

    const ownerId = await resolveOwnerId(session.user.role, session.user.id, parsed.ownerId);
    const customerIdRaw = formData.get("customerId")?.toString().trim() || null;
    let customerId = existing.customerId;
    if (customerIdRaw !== undefined) {
      // 编辑页可改主要客户（可清空）
      if (!customerIdRaw) {
        customerId = null;
      } else if (customerIdRaw !== existing.customerId) {
        const customer = await getCustomerForUser(
          customerIdRaw,
          session.user.role,
          session.user.id
        );
        if (!customer) throw new Error("无权使用该客户");
        customerId = customerIdRaw;
      }
    }
    const parties = readPartiesFromFormData(formData);
    assertPartiesNotOverlappingPrimary(parties, customerId);

    const labelMaps = await getConfigOptionMaps([
      CONFIG_CATEGORY.OPPORTUNITY_STAGE,
      CONFIG_CATEGORY.OPPORTUNITY_GRADE,
    ]);
    const stageLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_STAGE] ?? {};
    const gradeLabels = labelMaps[CONFIG_CATEGORY.OPPORTUNITY_GRADE] ?? {};

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
        grade,
        requirementDesc: parsed.requirementDesc?.trim() || null,
        winProbability: parsed.winProbability ?? null,
        competitor: parsed.competitor?.trim() || null,
        notes: parsed.notes?.trim() || null,
      },
      stageLabels,
      gradeLabels
    );
    if (customerId !== existing.customerId) {
      changes.push("主要客户");
    }

    await prisma.$transaction(async (tx) => {
      await tx.opportunity.update({
        where: { id },
        data: {
          title: parsed.title.trim(),
          customerId,
          ownerId,
          expectedAmount: existing.amountLocked ? undefined : parsed.expectedAmount,
          expectedCloseDate: parseExpectedCloseMonth(parsed.expectedCloseDate),
          stage,
          grade,
          requirementDesc: parsed.requirementDesc?.trim() || null,
          winProbability: parsed.winProbability ?? null,
          competitor: parsed.competitor?.trim() || null,
          notes: parsed.notes?.trim() || null,
        },
      });
      await replaceOpportunityParties(tx, id, parties);

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

    if (changes.length > 0) {
      const { recordEntityOperation, ENTITY_TYPES } = await import(
        "@/lib/audit/entity-operation-log"
      );
      await recordEntityOperation({
        entityType: ENTITY_TYPES.OPPORTUNITY,
        entityId: id,
        userId: session.user.id,
        action: "更新",
        summary: `更新商机「${parsed.title.trim()}」`,
        detail: changes.join("；"),
      });
    }

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
    const session = await requireRole([
      "ADMIN",
      "SALES_MANAGER",
      "SALES",
      "HR",
      "PROJECT_ADMIN",
      "PROJECT_MANAGER",
      "PROJECT_STAFF",
      "OTHER",
    ]);
    if (!(await hasPermission(session.user.role, "opportunities.restore"))) {
      return { error: "无权恢复已放弃商机" };
    }
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

async function revalidateOpportunityFollowUpPaths(
  opportunityId: string,
  customerId: string | null
) {
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath(`/opportunities/${opportunityId}/follow-ups`);
  if (customerId) {
    revalidatePath(`/customers/${customerId}/follow-ups`);
    revalidatePath(`/customers/${customerId}`);
  }
  revalidatePath("/follow-ups");
}

export async function createOpportunityFollowUp(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = parseOpportunityFollowUpForm(formData);

    const skipAssignmentCompletionRaw = formData.get("skipAssignmentCompletion")?.toString().trim();
    const skipAssignmentCompletion =
      skipAssignmentCompletionRaw === "true" || skipAssignmentCompletionRaw === "1";
    const completedAssignmentIds = [
      ...new Set(
        formData
          .getAll("completedAssignmentIds")
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      ),
    ];

    const existing = await prisma.opportunity.findUnique({
      where: { id: parsed.opportunityId },
      include: {
        owner: { select: { name: true } },
        customer: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            assistantOwners: { select: { userId: true } },
          },
        },
      },
    });
    if (!existing) return { error: "商机不存在或无权访问" };
    if (!(await canFollowUpOpportunityForUser(session.user.role, session.user.id, existing))) {
      return { error: "无权跟进该商机" };
    }
    if (!existing.customerId || !existing.customer) {
      return { error: "商机未关联主客户，无法写入客户往来" };
    }

    const { listPendingAssignmentsForFollowUp, completeWeeklyAssignmentsByIds } = await import(
      "@/lib/today-work/assignment-follow-up-complete"
    );
    const { resolveOpportunityFollowUpConfirmStatus } = await import(
      "@/lib/follow-ups/confirm-status"
    );

    const pendingAssignments = await listPendingAssignmentsForFollowUp({
      assigneeId: session.user.id,
      customerId: existing.customerId,
      opportunityIds: [parsed.opportunityId],
    });
    const hasPendingAssignments = pendingAssignments.length > 0;
    if (hasPendingAssignments) {
      if (!skipAssignmentCompletion && completedAssignmentIds.length === 0) {
        return { error: "请选择是否完成指派任务" };
      }
      if (!skipAssignmentCompletion) {
        const pendingIdSet = new Set(pendingAssignments.map((a) => a.id));
        for (const id of completedAssignmentIds) {
          if (!pendingIdSet.has(id)) {
            return { error: "所选任务无效或已完成" };
          }
        }
      }
    }

    const confirmStatus = resolveOpportunityFollowUpConfirmStatus({
      role: session.user.role,
      userId: session.user.id,
      opportunity: existing,
      customer: existing.customer,
      hasPendingAssignment: hasPendingAssignments && !skipAssignmentCompletion,
    });

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
    const applyOpportunityChanges = Boolean(changeSummary) && confirmStatus === "CONFIRMED";

    await prisma.$transaction(async (tx) => {
      if (applyOpportunityChanges && changeSummary) {
        await tx.opportunity.update({
          where: { id: parsed.opportunityId },
          data: buildFollowUpOpportunityUpdateData(existing, opportunityInput),
        });
      }

      await tx.followUp.create({
        data: {
          customerId: existing.customerId!,
          opportunityId: parsed.opportunityId,
          userId: session.user.id,
          method: parsed.method,
          content: parsed.content,
          result: applyOpportunityChanges ? (changeSummary ?? undefined) : undefined,
          followUpAt: new Date(parsed.followUpAt),
          nextFollowUpAt: parsePlannedFollowUpDateInput(parsed.nextFollowUpAt),
          confirmStatus,
          confirmedAt: confirmStatus === "CONFIRMED" ? new Date() : undefined,
          confirmedById: confirmStatus === "CONFIRMED" ? session.user.id : undefined,
          linkedOpportunities: {
            create: [{ opportunityId: parsed.opportunityId }],
          },
        },
      });

      if (hasPendingAssignments && !skipAssignmentCompletion) {
        await completeWeeklyAssignmentsByIds(tx, {
          assigneeId: session.user.id,
          assignmentIds: completedAssignmentIds,
        });
      }
    });

    if (confirmStatus === "PENDING_MANAGER") {
      const { createAppNotification, NOTIFICATION_TYPES } = await import(
        "@/lib/notifications/app-notifications"
      );
      await createAppNotification({
        type: NOTIFICATION_TYPES.FOLLOW_UP_PENDING_CONFIRM,
        title: "往来待确认入库",
        body: `${existing.customer.name}：有一条非本人客户往来待确认`,
        linkHref: "/approvals?type=FOLLOW_UP_CONFIRM",
        actorRole: session.user.role,
        excludeUserId: session.user.id,
        pushWeCom: true,
        meta: {
          opportunityId: parsed.opportunityId,
          customerId: existing.customerId,
          action: "confirm_follow_up",
        },
      });
    }

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

    // 新记录写入 FollowUp 表；此处仅更新 legacy OpportunityFollowUp
    const followUp = await prisma.opportunityFollowUp.findUnique({
      where: { id: parsed.followUpId },
      include: { opportunity: { include: { owner: { select: { name: true } } } } },
    });
    if (!followUp || followUp.opportunityId !== parsed.opportunityId) {
      return { error: "跟进记录不存在" };
    }
    if (
      !(await canFollowUpOpportunityForUser(
        session.user.role,
        session.user.id,
        followUp.opportunity
      ))
    ) {
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
          nextFollowUpAt: parsePlannedFollowUpDateInput(parsed.nextFollowUpAt) ?? null,
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

function parseQuoteDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("报价日期无效");
  }
  return d;
}

export async function createOpportunityQuote(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = opportunityQuoteSchema.parse({
      opportunityId: formData.get("opportunityId"),
      amount: formData.get("amount"),
      quotedAt: formData.get("quotedAt"),
      notes: formData.get("notes") || undefined,
    });

    const opportunity = await getOpportunityForUser(
      parsed.opportunityId,
      session.user.role,
      session.user.id
    );
    if (!opportunity) return { error: "商机不存在或无权访问" };
    if (!canAddOpportunityQuote(opportunity.status)) {
      return { error: "仅未签约商机可新增报价单" };
    }
    if (!canEditOpportunityContent(session.user.role, session.user.id, opportunity)) {
      return { error: "无权新增报价单" };
    }

    const quotedAt = parseQuoteDate(parsed.quotedAt);
    const quote = await prisma.opportunityQuote.create({
      data: {
        opportunityId: parsed.opportunityId,
        amount: parsed.amount,
        quotedAt,
        notes: parsed.notes?.trim() || null,
        createdById: session.user.id,
      },
    });

    await recordEntityOperation({
      entityType: ENTITY_TYPES.OPPORTUNITY,
      entityId: parsed.opportunityId,
      userId: session.user.id,
      action: "新增报价单",
      summary: `报价 ${formatAmount(parsed.amount)} · ${quotedAt.toISOString().slice(0, 10)}`,
    });

    revalidatePath(`/opportunities/${parsed.opportunityId}`);
    revalidatePath("/opportunities");
    return { quoteId: quote.id };
  } catch (error) {
    return formatActionError(error);
  }
}

export async function updateOpportunityQuote(formData: FormData): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const parsed = opportunityQuoteUpdateSchema.parse({
      quoteId: formData.get("quoteId"),
      amount: formData.get("amount"),
      quotedAt: formData.get("quotedAt"),
      notes: formData.get("notes") || undefined,
    });

    const existing = await prisma.opportunityQuote.findUnique({
      where: { id: parsed.quoteId },
      include: {
        opportunity: { select: { id: true, ownerId: true, status: true, title: true } },
      },
    });
    if (!existing) return { error: "报价单不存在" };

    const opportunity = await getOpportunityForUser(
      existing.opportunityId,
      session.user.role,
      session.user.id
    );
    if (!opportunity) return { error: "商机不存在或无权访问" };
    if (!canEditOpportunityContent(session.user.role, session.user.id, opportunity)) {
      return { error: "无权修改报价单" };
    }

    const quotedAt = parseQuoteDate(parsed.quotedAt);
    await prisma.opportunityQuote.update({
      where: { id: parsed.quoteId },
      data: {
        amount: parsed.amount,
        quotedAt,
        notes: parsed.notes?.trim() || null,
      },
    });

    await recordEntityOperation({
      entityType: ENTITY_TYPES.OPPORTUNITY,
      entityId: existing.opportunityId,
      userId: session.user.id,
      action: "修改报价单",
      summary: `报价 ${formatAmount(parsed.amount)} · ${quotedAt.toISOString().slice(0, 10)}`,
    });

    revalidatePath(`/opportunities/${existing.opportunityId}`);
    revalidatePath("/opportunities");
    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

export async function deleteOpportunityQuote(quoteId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
    const existing = await prisma.opportunityQuote.findUnique({
      where: { id: quoteId },
      include: {
        attachments: { select: { storageKey: true } },
        opportunity: { select: { id: true, ownerId: true, status: true } },
      },
    });
    if (!existing) return { error: "报价单不存在" };

    const opportunity = await getOpportunityForUser(
      existing.opportunityId,
      session.user.role,
      session.user.id
    );
    if (!opportunity) return { error: "商机不存在或无权访问" };
    if (!canEditOpportunityContent(session.user.role, session.user.id, opportunity)) {
      return { error: "无权删除报价单" };
    }

    await prisma.opportunityQuote.delete({ where: { id: quoteId } });
    await Promise.all(
      existing.attachments.map((row) => deleteOpportunityQuoteAttachmentFile(row.storageKey))
    );

    await recordEntityOperation({
      entityType: ENTITY_TYPES.OPPORTUNITY,
      entityId: existing.opportunityId,
      userId: session.user.id,
      action: "删除报价单",
      summary: `删除报价 ${formatAmount(existing.amount)}`,
    });

    revalidatePath(`/opportunities/${existing.opportunityId}`);
    revalidatePath("/opportunities");
    return {};
  } catch (error) {
    return formatActionError(error);
  }
}

/** 管理员 / 销售管理：删除商机（有关联合同时拒绝） */
export async function deleteOpportunity(opportunityId: string): Promise<ActionResult> {
  try {
    const session = await requireRole(["ADMIN", "SALES_MANAGER"]);
    const id = opportunityId.trim();
    if (!id) return { error: "商机 ID 无效" };

    const existing = await prisma.opportunity.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        quotes: { select: { id: true, attachments: { select: { storageKey: true } } } },
      },
    });
    if (!existing) return { error: "商机不存在或已删除" };

    const contractCount = await prisma.contract.count({
      where: { opportunityId: id },
    });
    if (contractCount > 0) {
      return {
        error: `无法删除「${existing.title}」：仍有 ${contractCount} 份关联合同。请先处理合同后再删。`,
      };
    }

    const storageKeys = existing.quotes.flatMap((q) =>
      q.attachments.map((a) => a.storageKey)
    );

    await prisma.$transaction(async (tx) => {
      await tx.followUp.updateMany({
        where: { opportunityId: id },
        data: { opportunityId: null },
      });
      await tx.salesWeeklyAssignment.updateMany({
        where: { opportunityId: id },
        data: { opportunityId: null },
      });
      await tx.salesPlanItem.updateMany({
        where: { opportunityId: id },
        data: { opportunityId: null },
      });
      await tx.opportunity.delete({ where: { id } });
    });

    await Promise.all(
      storageKeys.map((key) => deleteOpportunityQuoteAttachmentFile(key))
    );

    await recordEntityOperation({
      entityType: ENTITY_TYPES.OPPORTUNITY,
      entityId: id,
      userId: session.user.id,
      action: "DELETE",
      summary: `删除商机「${existing.title}」`,
    });

    revalidatePath("/opportunities");
    revalidatePath("/customers");
    revalidatePath("/admin/map");
    return { redirectTo: "/opportunities" };
  } catch (error) {
    return formatActionError(error);
  }
}
