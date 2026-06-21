import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getCustomerForUser } from "@/lib/customers/access";
import { parseExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
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

    const customer = await getCustomerForUser(
      parsed.customerId,
      session.user.role,
      session.user.id
    );
    if (!customer) {
      return Response.json({ error: "客户不存在或无权访问" }, { status: 404 });
    }

    const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
    const stage = await assertConfigValue(CONFIG_CATEGORY.OPPORTUNITY_STAGE, parsed.stage);
    if (!stage) {
      return Response.json({ error: "商机阶段无效" }, { status: 400 });
    }

    const ownerId =
      session.user.role === "SALES" ? session.user.id : session.user.id;

    const opportunity = await prisma.$transaction(async (tx) => {
      const created = await tx.opportunity.create({
        data: {
          title: parsed.title.trim(),
          customerId: parsed.customerId,
          ownerId,
          expectedAmount: parsed.expectedAmount,
          expectedCloseDate: parseExpectedCloseMonth(parsed.expectedCloseDate),
          stage,
        },
      });
      await tx.opportunityStageLog.create({
        data: {
          opportunityId: created.id,
          userId: session.user.id,
          toStage: stage,
          note: "往来打卡快速创建",
        },
      });
      return created;
    });

    revalidatePath("/opportunities");
    revalidatePath("/today-work");
    return Response.json({ id: opportunity.id, title: opportunity.title });
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
