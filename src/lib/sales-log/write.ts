import {
  CustomerCategory,
  FollowUpMethod,
  Prisma,
  SalesDailyLogStatus,
  UserRole,
} from "@prisma/client";
import { canManageCustomerOwner, getCustomerForUser } from "@/lib/customers/access";
import { findDuplicateCustomerByName } from "@/lib/customers/duplicate-name";
import { assertCustomerGrade, requireCustomerGrade } from "@/lib/customers/grade";
import { parsePlannedFollowUpDateInput } from "@/lib/dates/local-date";
import { validateNextFollowUpPlan } from "@/lib/sales-log/next-follow-up-plan";
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

  const duplicate = await findDuplicateCustomerByName(name);
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
    contactIds?: string[];
    opportunityId?: string;
    method: FollowUpMethod;
    content: string;
    result?: string;
    followUpAt: string;
    nextFollowUpAt?: string;
    nextFollowUpMethod?: FollowUpMethod;
    suggestedGrade?: string | null;
  }
) {
  assertSalesLogRole(ctx.role);

  const customerId = await resolveCustomerId(ctx, input.customerId, input.customerName);
  const content = input.content.trim();
  if (!content) throw new Error("跟进内容不能为空");

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { customerGrade: true },
  });
  const planError = validateNextFollowUpPlan(
    input.suggestedGrade,
    input.nextFollowUpAt,
    input.nextFollowUpMethod,
    customer?.customerGrade
  );
  if (planError) throw new Error(planError);

  const contactIds = [...new Set(
    (input.contactIds?.length ? input.contactIds : input.contactId?.trim() ? [input.contactId.trim()] : [])
      .map((id) => id.trim())
      .filter(Boolean)
  )];

  if (contactIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds }, customerId },
      select: { id: true },
    });
    if (contacts.length !== contactIds.length) throw new Error("联系人不属于该客户");
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
        contactId: contactIds[0] || undefined,
        opportunityId: input.opportunityId || undefined,
        userId: ctx.userId,
        method: input.method,
        content,
        result: input.result?.trim() || null,
        followUpAt,
        nextFollowUpAt: parsePlannedFollowUpDateInput(input.nextFollowUpAt),
        nextFollowUpMethod: input.nextFollowUpMethod || undefined,
        suggestedGrade: suggestedGrade ?? undefined,
        gradeApplied: applyGrade,
        salesDailyLogId: ctx.dailyLogId,
        ...(contactIds.length > 0
          ? {
              linkedContacts: {
                create: contactIds.map((contactId) => ({ contactId })),
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
