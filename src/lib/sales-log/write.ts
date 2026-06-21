import {
  CustomerCategory,
  FollowUpMethod,
  Prisma,
  SalesDailyLogStatus,
  UserRole,
} from "@prisma/client";
import { canManageCustomerOwner, getCustomerForUser } from "@/lib/customers/access";
import { assertCustomerGrade, requireCustomerGrade } from "@/lib/customers/grade";
import { prisma } from "@/lib/prisma";
import { searchCustomersForUser } from "@/lib/search/entity-suggest";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export type AgentWriteContext = {
  userId: string;
  role: UserRole;
  dailyLogId: string;
};

function assertSalesLogRole(role: UserRole) {
  if (!SALES_LOG_ROLES.includes(role)) {
    throw new Error("当前角色无权写入销售日志");
  }
}

function resolveOwnerId(role: UserRole, userId: string, ownerId?: string | null) {
  if (role === "SALES") return userId;
  if (canManageCustomerOwner(role) && ownerId) return ownerId;
  if (canManageCustomerOwner(role)) return null;
  return userId;
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

async function resolveCustomerId(
  ctx: AgentWriteContext,
  customerId?: string,
  customerName?: string
): Promise<string> {
  if (customerId) {
    const customer = await getCustomerForUser(customerId, ctx.role, ctx.userId);
    if (!customer) throw new Error("客户不存在或无权访问");
    return customerId;
  }

  const name = customerName?.trim();
  if (!name) throw new Error("请提供 customerId 或 customerName");

  const rows = await searchCustomersForUser(ctx.role, ctx.userId, name);
  const exact = rows.filter((row) => row.name === name);
  const matches = exact.length > 0 ? exact : rows;

  if (matches.length === 0) {
    throw new Error(`未找到客户「${name}」，请先使用 createCustomer 新建`);
  }
  if (matches.length > 1) {
    throw new Error(
      `客户「${name}」存在 ${matches.length} 条匹配，请使用 customerId 指定`
    );
  }
  return matches[0].id;
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
    notes?: string;
    contactName?: string;
    contactPhone?: string;
    contactTitle?: string;
  }
) {
  assertSalesLogRole(ctx.role);

  const name = input.name.trim();
  if (!name) throw new Error("客户名称不能为空");

  const duplicates = await searchCustomersForUser(ctx.role, ctx.userId, name);
  const exactDuplicate = duplicates.find((row) => row.name === name);
  if (exactDuplicate) {
    return {
      success: false as const,
      error: `客户「${name}」已存在`,
      existingCustomerId: exactDuplicate.id,
    };
  }

  const configFields = await validateCustomerConfigFields(input);

  const customer = await prisma.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        name,
        category: input.category,
        hospitalLevel:
          input.category === "HOSPITAL" && input.hospitalLevel
            ? (input.hospitalLevel as never)
            : undefined,
        province: input.province?.trim() || null,
        city: input.city?.trim() || null,
        district: input.district?.trim() || null,
        bedCount: input.bedCount ?? undefined,
        existingSystem: input.existingSystem?.trim() || null,
        source: configFields.source,
        customerType: configFields.customerType,
        customerGrade: configFields.customerGrade,
        notes: input.notes?.trim() || null,
        ownerId: resolveOwnerId(ctx.role, ctx.userId),
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
    message: `已新建客户「${customer.name}」`,
  };
}

export async function createFollowUpFromAgent(
  ctx: AgentWriteContext,
  input: {
    customerId?: string;
    customerName?: string;
    contactId?: string;
    opportunityId?: string;
    method: FollowUpMethod;
    content: string;
    result?: string;
    followUpAt: string;
    nextFollowUpAt?: string;
    nextFollowUpMethod?: FollowUpMethod;
    suggestedGrade?: string | null;
    location?: string;
    department?: string;
    companions?: string;
    detailedNotes?: string;
  }
) {
  assertSalesLogRole(ctx.role);

  const customerId = await resolveCustomerId(ctx, input.customerId, input.customerName);
  const content = input.content.trim();
  if (!content) throw new Error("跟进内容不能为空");

  if (input.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: input.contactId, customerId },
    });
    if (!contact) throw new Error("联系人不属于该客户");
  }

  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, customerId },
    });
    if (!opportunity) throw new Error("商机不存在或不属于该客户");
  }

  const suggestedGrade = assertCustomerGrade(input.suggestedGrade);
  const applyGrade = Boolean(suggestedGrade);

  const followUpAt = new Date(input.followUpAt);
  if (Number.isNaN(followUpAt.getTime())) throw new Error("跟进时间格式无效");

  const followUp = await prisma.$transaction(async (tx) => {
    const created = await tx.followUp.create({
      data: {
        customerId,
        contactId: input.contactId || undefined,
        opportunityId: input.opportunityId || undefined,
        userId: ctx.userId,
        method: input.method,
        content,
        result: input.result?.trim() || null,
        followUpAt,
        nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : undefined,
        nextFollowUpMethod: input.nextFollowUpMethod || undefined,
        suggestedGrade: suggestedGrade ?? undefined,
        gradeApplied: applyGrade,
        salesDailyLogId: ctx.dailyLogId,
      },
      include: { customer: { select: { name: true } } },
    });

    if (input.method === "FACE_VISIT") {
      const location = input.location?.trim();
      const detailedNotes = (input.detailedNotes?.trim() || content).trim();
      if (location && detailedNotes) {
        await tx.faceVisitDetail.create({
          data: {
            followUpId: created.id,
            location,
            department: input.department?.trim() || null,
            companions: input.companions?.trim() || null,
            detailedNotes,
          },
        });
      }
    }

    if (applyGrade && suggestedGrade) {
      await tx.customer.update({
        where: { id: customerId },
        data: { customerGrade: suggestedGrade },
      });
    }

    return created;
  });

  return {
    success: true as const,
    followUpId: followUp.id,
    customerId,
    customerName: followUp.customer.name,
    message: `已为「${followUp.customer.name}」写入跟进记录`,
  };
}

export async function submitDailyLogFromAgent(
  ctx: AgentWriteContext,
  input: {
    dailyReport: string;
    tomorrowPlan?: string;
    riskFlag?: boolean;
    riskNotes?: string;
    summary?: Prisma.InputJsonValue;
  }
) {
  assertSalesLogRole(ctx.role);

  const dailyReport = input.dailyReport.trim();
  if (!dailyReport) throw new Error("日报内容不能为空");

  const structuredOutput: Prisma.InputJsonValue = {
    dailyReport,
    tomorrowPlan: input.tomorrowPlan?.trim() || null,
    summary: input.summary ?? null,
    submittedAt: new Date().toISOString(),
  };

  const log = await prisma.salesDailyLog.update({
    where: { id: ctx.dailyLogId },
    data: {
      dailyReport,
      structuredOutput,
      submittedAt: new Date(),
      status: input.riskFlag
        ? SalesDailyLogStatus.RISK_SUBMITTED
        : SalesDailyLogStatus.SUBMITTED,
      riskFlag: Boolean(input.riskFlag),
      riskNotes: input.riskNotes?.trim() || null,
    },
  });

  return {
    success: true as const,
    dailyLogId: log.id,
    status: log.status,
    message: input.riskFlag ? "日报已带风险标记提交" : "今日销售日报已提交",
  };
}
