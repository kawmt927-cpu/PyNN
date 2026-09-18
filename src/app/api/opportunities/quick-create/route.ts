import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { canEditCustomerContent, getCustomerForUser } from "@/lib/customers/access";
import { parseExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import {
  canProposeOpportunityOnCustomer,
  resolveOpportunityConfirmStatus,
} from "@/lib/opportunities/confirm-status";
import { prisma } from "@/lib/prisma";
import { quickOpportunitySchema } from "@/lib/validations/sales-log";
import type { UserRole } from "@prisma/client";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !SALES_LOG_ROLES.includes(session.user.role)) {
    return Response.json({ error: "未登录或无权操作" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = quickOpportunitySchema.parse(body);

    if (!canProposeOpportunityOnCustomer(session.user.role)) {
      return Response.json({ error: "无权新建商机" }, { status: 403 });
    }

    const customer = await getCustomerForUser(
      parsed.customerId,
      session.user.role,
      session.user.id,
      { allowFollowUpOnAnyCustomer: true }
    );
    if (!customer) {
      return Response.json({ error: "客户不存在或无权访问" }, { status: 404 });
    }

    const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
    const stage = await assertConfigValue(CONFIG_CATEGORY.OPPORTUNITY_STAGE, parsed.stage);
    if (!stage) {
      return Response.json({ error: "商机阶段无效" }, { status: 400 });
    }

    const ownerId = session.user.id;
    const confirmStatus = resolveOpportunityConfirmStatus({
      role: session.user.role,
      userId: session.user.id,
      customer,
    });

    const confirmDuplicate = Boolean(
      (body as { confirmDuplicate?: boolean }).confirmDuplicate
    );
    if (!confirmDuplicate) {
      const {
        findSameCustomerSameTitleOpportunities,
        formatDuplicateOpportunityConfirmMessage,
      } = await import("@/lib/opportunities/duplicate-title");
      const duplicates = await findSameCustomerSameTitleOpportunities({
        customerId: parsed.customerId,
        title: parsed.title,
      });
      if (duplicates.length > 0) {
        return Response.json(
          {
            needsConfirm: true,
            error: formatDuplicateOpportunityConfirmMessage(
              parsed.title.trim(),
              customer.name,
              duplicates
            ),
            existingOpportunityId: duplicates[0].id,
          },
          { status: 409 }
        );
      }
    }

    const opportunity = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          title: parsed.title.trim(),
          customerId: parsed.customerId,
          ownerId,
          createdById: session.user.id,
          expectedAmount: parsed.expectedAmount,
          expectedCloseDate: parseExpectedCloseMonth(parsed.expectedCloseDate),
          stage,
          confirmStatus,
          confirmedAt: confirmStatus === "CONFIRMED" ? new Date() : undefined,
          confirmedById: confirmStatus === "CONFIRMED" ? session.user.id : undefined,
        },
      });
      await tx.opportunityStageLog.create({
        data: {
          opportunityId: created.id,
          userId: session.user.id,
          toStage: stage,
          note: confirmDuplicate
            ? "往来打卡快速创建（确认同名后新建）"
            : confirmStatus === "PENDING_MANAGER"
              ? "往来打卡快速创建（待管理确认）"
              : "往来打卡快速创建",
        },
      });
      return created;
    });

    if (confirmStatus === "PENDING_MANAGER") {
      // 随往来代录一并确认，不单独通知
    }

    revalidatePath("/opportunities");
    revalidatePath("/today-work");
    revalidatePath("/approvals");
    return Response.json({
      id: opportunity.id,
      title: opportunity.title,
      confirmStatus,
      writable: canEditCustomerContent(session.user.role, session.user.id, customer),
      message:
        confirmStatus === "PENDING_MANAGER"
          ? `已创建商机「${opportunity.title}」（待确认，将随本次往来一并提交审核）`
          : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.errors[0]?.message ?? "表单无效" }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 400 }
    );
  }
}
