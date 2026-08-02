import { UserRole } from "@prisma/client";
import {
  canEditOpportunityContent,
  canManageOpportunityOwner,
  getOpportunityForUser,
} from "@/lib/opportunities/access";
import { buildOpportunityEditChanges } from "@/lib/opportunities/edit-log";
import { parseExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import { assertOpportunityGrade, OPPORTUNITY_GRADE } from "@/lib/opportunities/grade";
import { prisma } from "@/lib/prisma";
import { assertSelectableSalesOwner } from "@/lib/sales/selectable-users";
import { searchCustomersForUser } from "@/lib/search/entity-suggest";
import type { AgentWriteContext } from "@/lib/sales-log/write";

async function resolveOwnerId(role: UserRole, userId: string, ownerId?: string | null) {
  if (role === "SALES") return userId;
  if (canManageOpportunityOwner(role) && ownerId) {
    await assertSelectableSalesOwner(role, userId, ownerId);
    return ownerId;
  }
  return userId;
}

async function resolveCustomerIdForOpportunity(
  ctx: AgentWriteContext,
  customerId?: string,
  customerName?: string
) {
  if (customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error("客户不存在");
    return customerId;
  }
  const name = customerName?.trim();
  if (!name) throw new Error("请提供 customerId 或 customerName");
  const rows = await searchCustomersForUser(ctx.role, ctx.userId, name);
  const exact = rows.filter((row) => row.name === name);
  const matches = exact.length > 0 ? exact : rows;
  if (matches.length === 0) throw new Error(`未找到客户「${name}」`);
  if (matches.length > 1) throw new Error(`客户「${name}」有多条匹配，请用 customerId`);
  return matches[0].id;
}

export async function createOpportunityFromAgent(
  ctx: AgentWriteContext,
  input: {
    title: string;
    customerId?: string;
    customerName?: string;
    expectedAmount: number;
    expectedCloseDate: string;
    stage: string;
    grade?: string;
    requirementDesc?: string;
    winProbability?: number | null;
    competitor?: string;
    notes?: string;
  }
) {
  const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
  const stage = await assertConfigValue(CONFIG_CATEGORY.OPPORTUNITY_STAGE, input.stage);
  if (!stage) throw new Error("商机阶段无效");
  const grade = assertOpportunityGrade(input.grade || OPPORTUNITY_GRADE.P3);

  const customerId = await resolveCustomerIdForOpportunity(
    ctx,
    input.customerId,
    input.customerName
  );
  const ownerId = await resolveOwnerId(ctx.role, ctx.userId);
  const title = input.title.trim();
  if (!title) throw new Error("商机名称不能为空");

  const opportunity = await prisma.$transaction(async (tx) => {
    const created = await tx.opportunity.create({
      data: {
        title,
        customerId,
        ownerId,
        expectedAmount: input.expectedAmount,
        expectedCloseDate: parseExpectedCloseMonth(input.expectedCloseDate),
        stage,
        grade,
        requirementDesc: input.requirementDesc?.trim() || undefined,
        winProbability: input.winProbability ?? undefined,
        competitor: input.competitor?.trim() || undefined,
        notes: input.notes?.trim() || undefined,
      },
    });
    await tx.opportunityStageLog.create({
      data: {
        opportunityId: created.id,
        userId: ctx.userId,
        toStage: stage,
        note: "AI 销售日志创建",
      },
    });
    return created;
  });

  const { recordEntityOperation, ENTITY_TYPES } = await import(
    "@/lib/audit/entity-operation-log"
  );
  await recordEntityOperation({
    entityType: ENTITY_TYPES.OPPORTUNITY,
    entityId: opportunity.id,
    userId: ctx.userId,
    action: "创建",
    summary: `创建商机「${opportunity.title}」`,
    detail: "来源：AI 销售日志",
  });

  return {
    success: true as const,
    opportunityId: opportunity.id,
    title: opportunity.title,
    message: `已新建商机「${opportunity.title}」`,
  };
}

export async function updateOpportunityFromAgent(
  ctx: AgentWriteContext,
  input: {
    opportunityId: string;
    title?: string;
    expectedAmount?: number;
    expectedCloseDate?: string;
    stage?: string;
    requirementDesc?: string;
    winProbability?: number | null;
    competitor?: string;
    notes?: string;
  }
) {
  const existing = await getOpportunityForUser(input.opportunityId, ctx.role, ctx.userId);
  if (!existing) throw new Error("商机不存在或无权访问");
  if (!canEditOpportunityContent(ctx.role, ctx.userId, existing)) {
    throw new Error("无权编辑该商机");
  }

  const { CONFIG_CATEGORY, assertConfigValue, getConfigOptionMaps } = await import(
    "@/lib/config-options"
  );

  let stage = existing.stage;
  if (input.stage) {
    const validated = await assertConfigValue(CONFIG_CATEGORY.OPPORTUNITY_STAGE, input.stage);
    if (!validated) throw new Error("商机阶段无效");
    stage = validated;
  }

  const stageLabels = (await getConfigOptionMaps([CONFIG_CATEGORY.OPPORTUNITY_STAGE]))[
    CONFIG_CATEGORY.OPPORTUNITY_STAGE
  ] ?? {};

  const nextData = {
    title: input.title?.trim() ?? existing.title,
    ownerId: existing.ownerId,
    ownerName: existing.owner.name,
    expectedAmount: input.expectedAmount ?? Number(existing.expectedAmount),
    expectedCloseDate:
      input.expectedCloseDate ?? `${existing.expectedCloseDate.getFullYear()}-${String(existing.expectedCloseDate.getMonth() + 1).padStart(2, "0")}`,
    stage,
    grade: existing.grade ?? null,
    requirementDesc:
      input.requirementDesc !== undefined
        ? input.requirementDesc.trim() || null
        : existing.requirementDesc,
    winProbability:
      input.winProbability !== undefined ? input.winProbability : existing.winProbability,
    competitor:
      input.competitor !== undefined ? input.competitor.trim() || null : existing.competitor,
    notes: input.notes !== undefined ? input.notes.trim() || null : existing.notes,
  };

  const changes = buildOpportunityEditChanges(existing, nextData, stageLabels);

  await prisma.$transaction(async (tx) => {
    await tx.opportunity.update({
      where: { id: existing.id },
      data: {
        title: nextData.title,
        expectedAmount: existing.amountLocked ? undefined : nextData.expectedAmount,
        expectedCloseDate: parseExpectedCloseMonth(nextData.expectedCloseDate),
        stage: nextData.stage,
        requirementDesc: nextData.requirementDesc,
        winProbability: nextData.winProbability,
        competitor: nextData.competitor,
        notes: nextData.notes,
      },
    });

    if (changes.length > 0) {
      await tx.opportunityStageLog.create({
        data: {
          opportunityId: existing.id,
          userId: ctx.userId,
          fromStage: existing.stage !== stage ? existing.stage : null,
          toStage: stage,
          note: `AI 更新: ${changes.join("; ")}`,
        },
      });
    }
  });

  if (changes.length > 0) {
    const { recordEntityOperation, ENTITY_TYPES } = await import(
      "@/lib/audit/entity-operation-log"
    );
    await recordEntityOperation({
      entityType: ENTITY_TYPES.OPPORTUNITY,
      entityId: existing.id,
      userId: ctx.userId,
      action: "更新",
      summary: `更新商机「${nextData.title}」`,
      detail: `来源：AI 销售日志；${changes.join("；")}`,
    });
  }

  return {
    success: true as const,
    opportunityId: existing.id,
    title: nextData.title,
    message: `已更新商机「${nextData.title}」`,
  };
}
