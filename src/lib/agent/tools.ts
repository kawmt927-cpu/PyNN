import { tool } from "ai";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import type { EffectiveAiAgentConfig } from "@/lib/agent/config";
import { canEditCustomerFollowUp, getCustomerForUser } from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";
import {
  createCustomerFromAgent,
  createFollowUpFromAgent,
  submitDailyLogFromAgent,
} from "@/lib/sales-log/write";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import {
  checkInRequiresFollowUp,
  completeCheckInFromAgent,
  listTodayCheckIns,
} from "@/lib/sales-log/check-in";
import {
  createOpportunityFromAgent,
  updateOpportunityFromAgent,
} from "@/lib/sales-log/opportunity-write";
import {
  fetchCustomerBriefForAgent,
  customerBriefToToolPayload,
} from "@/lib/agent/customer-brief";
import {
  searchCustomersForUser,
  searchOpportunitiesForUser,
} from "@/lib/search/entity-suggest";

export type AgentSession = {
  user: { id: string; role: UserRole };
  dailyLogId: string;
};

function writeContext(session: AgentSession) {
  return {
    userId: session.user.id,
    role: session.user.role,
    dailyLogId: session.dailyLogId,
  };
}

export function createCrmAgentTools(session: AgentSession, config: EffectiveAiAgentConfig) {
  const { role, id: userId } = session.user;
  const ctx = writeContext(session);

  return {
    ...(config.toolSearchCustomers
      ? {
          searchCustomers: tool({
            description:
              "按名称搜索 CRM 已有客户。返回 writable：仅 writable=true 时可录入往来/完善打卡；false 表示非本人负责，禁止落库。",
            parameters: z.object({
              query: z.string().describe("客户名称关键词"),
            }),
            execute: async ({ query }) => {
              const rows = await searchCustomersForUser(role, userId, query);
              return {
                count: rows.length,
                  customers: rows.map((c) => ({
                  id: c.id,
                  name: c.name,
                  category: c.category,
                  customerGrade: c.customerGrade,
                  writable: c.writable,
                  ownerName: c.ownerName,
                })),
              };
            },
          }),
        }
      : {}),
    ...(config.toolSearchOpportunities
      ? {
          searchOpportunities: tool({
            description: "按标题搜索商机，返回匹配商机及关联客户",
            parameters: z.object({
              query: z.string().describe("商机标题关键词"),
              status: z
                .enum(["ALL", "NOT_SIGNED", "SIGNED", "ABANDONED"])
                .optional()
                .describe("可选：按商机状态筛选"),
            }),
            execute: async ({ query, status }) => {
              const rows = await searchOpportunitiesForUser(role, userId, query, {
                status: status ?? "ALL",
              });
              return {
                count: rows.length,
                opportunities: rows.map((o) => ({
                  id: o.id,
                  title: o.title,
                  status: o.status,
                  customerName: o.customer.name,
                })),
              };
            },
          }),
        }
      : {}),
    ...(config.toolGetCustomer
      ? {
          getCustomer: tool({
            description:
              "根据客户 ID 获取详情。writable=false 时不可录入往来或完善打卡，应告知销售联系负责人。",
            parameters: z.object({
              customerId: z.string().describe("客户 ID"),
            }),
            execute: async ({ customerId }) => {
              const customer = await getCustomerForUser(customerId, role, userId);
              if (!customer) {
                return { error: "客户不存在或无权访问" };
              }
              const writable = canEditCustomerFollowUp(role, userId, customer);
              return {
                id: customer.id,
                name: customer.name,
                category: customer.category,
                province: customer.province,
                city: customer.city,
                customerType: customer.customerType,
                customerGrade: customer.customerGrade,
                writable,
                owner: customer.owner?.name ?? null,
                assistants: customer.assistantOwners.map((row) => row.user.name),
                notes: customer.notes,
                contacts: customer.contacts.map((c) => ({
                  name: c.name,
                  title: c.title,
                  phone: c.phone,
                  isPrimary: c.isPrimary,
                })),
              };
            },
          }),
        }
      : {}),
    getCustomerBrief: tool({
      description:
        "获取客户档案简报（等级、上次往来、下次计划）。销售自述后落库或需确认等级/商机时调用，勿在开场播报。",
      parameters: z.object({
        customerId: z.string().describe("客户 ID"),
      }),
      execute: async ({ customerId }) => {
        const brief = await fetchCustomerBriefForAgent(customerId, role, userId);
        if (!brief) {
          return { error: "客户不存在或无权访问" };
        }
        return customerBriefToToolPayload(brief);
      },
    }),
    ...(config.toolListFollowUps
      ? {
          listCustomerFollowUps: tool({
            description:
              "列出指定客户最近往来记录（需更详细历史时用）。日常优先 getCustomerBrief；切换客户前若快照无该客户也需先 getCustomerBrief。",
            parameters: z.object({
              customerId: z.string().describe("客户 ID"),
              limit: z
                .number()
                .int()
                .min(1)
                .max(20)
                .optional()
                .describe("返回条数，默认 10"),
            }),
            execute: async ({ customerId, limit }) => {
              const customer = await getCustomerForUser(customerId, role, userId);
              if (!customer) {
                return { error: "客户不存在或无权访问" };
              }

              const take = limit ?? 10;
              const rows = await prisma.followUp.findMany({
                where: { customerId },
                orderBy: { followUpAt: "desc" },
                take,
                select: {
                  followUpAt: true,
                  method: true,
                  content: true,
                  result: true,
                  user: { select: { name: true } },
                },
              });

              return {
                customerName: customer.name,
                count: rows.length,
                followUps: rows.map((f) => ({
                  at: f.followUpAt.toISOString(),
                  method: f.method,
                  content: f.content,
                  result: f.result,
                  by: f.user.name,
                })),
              };
            },
          }),
        }
      : {}),
    createCustomer: tool({
      description:
        "将确认过的新客户写入 CRM（含可选主联系人）。写入前须 searchCustomers 查重；若已存在则返回 existingCustomerId。",
      parameters: z.object({
        name: z.string().describe("客户全称"),
        category: z.enum(["HOSPITAL", "COMPANY", "INDIVIDUAL"]).describe("客户类别"),
        province: z.string().optional().describe("省份"),
        city: z.string().optional().describe("城市"),
        district: z.string().optional().describe("区县"),
        hospitalLevel: z
          .enum(["GRADE_3A", "GRADE_3B", "GRADE_3", "GRADE_2A", "GRADE_2B", "GRADE_2", "OTHER"])
          .optional()
          .describe("医院等级（医院客户）"),
        bedCount: z.number().int().positive().optional().describe("床位数"),
        existingSystem: z.string().optional().describe("现有系统"),
        source: z.string().optional().describe("客户来源（配置项 value）"),
        customerType: z.string().describe("关系类型（配置项 value，必填）"),
        customerGrade: z
          .enum(["STAR_3", "STAR_2", "STAR_1", "NONE"])
          .describe("客户等级：STAR_3 三星 / STAR_2 两星 / STAR_1 一星 / NONE 未评级"),
        notes: z.string().optional().describe("备注"),
        contactName: z.string().optional().describe("主联系人姓名"),
        contactPhone: z.string().optional().describe("主联系人电话"),
        contactTitle: z.string().optional().describe("主联系人职务"),
      }),
      execute: async (input) => createCustomerFromAgent(ctx, input),
    }),
    createFollowUp: tool({
      description:
        "为已有客户写入跟进/往来（须为该客户负责人或协助负责人，否则工具会失败）。写入前建议 searchCustomers/getCustomer 确认 writable=true。",
      parameters: z.object({
        customerId: z.string().optional().describe("客户 ID（与 customerName 二选一）"),
        customerName: z.string().optional().describe("客户名称（与 customerId 二选一）"),
        method: z
          .enum(["PHONE", "WECHAT", "FACE_VISIT", "OTHER"])
          .describe("往来方式：电话沟通/微信沟通/客户面访/其他"),
        content: z.string().describe("跟进内容摘要"),
        result: z.string().optional().describe("跟进结果/意向"),
        followUpAt: z.string().describe("跟进时间 ISO8601，如 2026-06-20T14:30:00"),
        nextFollowUpAt: z.string().optional().describe("下次跟进时间 ISO8601"),
        suggestedGrade: z
          .enum(["STAR_3", "STAR_2", "STAR_1", "NONE"])
          .optional()
          .describe("建议客户等级：STAR_3 三星 / STAR_2 两星 / STAR_1 一星 / NONE 未评级"),
      }),
      execute: async (input) => {
        try {
          return await createFollowUpFromAgent(ctx, input);
        } catch (error) {
          const message = error instanceof Error ? error.message : "写入往来失败";
          return {
            success: false,
            error: message,
            hint:
              message.includes("无权")
                ? "该客户非本人负责，勿重复落库；可写入日报说明，或请销售联系负责人。"
                : "请核对客户与必填字段后重试。",
          };
        }
      },
    }),
    submitDailyLog: tool({
      description:
        "提交今日销售日报。在信息采集完毕、销售确认后调用；会写入 SalesDailyLog 并标记为已提交。",
      parameters: z.object({
        dailyReport: z.string().describe("今日日报 Markdown 正文"),
        tomorrowPlan: z.string().optional().describe("明日计划"),
        riskFlag: z.boolean().optional().describe("是否带风险提交（信息不全时）"),
        riskNotes: z.string().optional().describe("风险说明"),
      }),
      execute: async (input) => submitDailyLogFromAgent(ctx, input),
    }),
    listTodayCheckIns: tool({
      description:
        "列出今日定位打卡记录。仅关联客户的 PENDING 打卡需要完善往来；无客户打卡仅记录定位，无需处理。",
      parameters: z.object({
        pendingOnly: z.boolean().optional().describe("仅返回待完善的打卡，默认 true"),
      }),
      execute: async ({ pendingOnly }) => {
        const rows = await listTodayCheckIns(
          role,
          userId,
          pendingOnly !== false ? "PENDING" : undefined
        );
        return {
          count: rows.length,
          checkIns: rows.map((row) => ({
            id: row.id,
            customerId: row.customer?.id ?? null,
            customerName: row.customer?.name ?? null,
            customerGrade: row.customer?.customerGrade ?? null,
            requiresFollowUp: checkInRequiresFollowUp(row),
            contactName: row.contact?.name ?? null,
            checkedInAt: row.checkedInAt.toISOString(),
            location: formatCheckInLocation(row),
            locationText: row.locationText,
            addressProvince: row.addressProvince,
            addressCity: row.addressCity,
            addressDistrict: row.addressDistrict,
            addressStreet: row.addressStreet,
            notes: row.notes,
            status: row.status,
          })),
        };
      },
    }),
    completeCheckIn: tool({
      description:
        "将今日关联客户的打卡记录完善为正式往来跟进。调用前务必先用 listTodayCheckIns 取得最新 checkInId；无客户打卡勿用。面访打卡默认 method=FACE_VISIT。",
      parameters: z.object({
        checkInId: z.string().describe("listTodayCheckIns 返回的 id 字段，勿编造或复用过期 ID"),
        method: z
          .enum(["PHONE", "WECHAT", "FACE_VISIT", "OTHER"])
          .describe("往来方式"),
        content: z.string().describe("往来内容"),
        result: z.string().optional().describe("结果/意向"),
        followUpAt: z.string().optional().describe("往来时间 ISO8601，默认打卡时间"),
        nextFollowUpAt: z.string().optional().describe("下次跟进时间"),
        suggestedGrade: z
          .enum(["STAR_3", "STAR_2", "STAR_1", "NONE"])
          .optional()
          .describe("建议客户等级：STAR_3 三星 / STAR_2 两星 / STAR_1 一星 / NONE 未评级"),
      }),
      execute: async (input) => {
        try {
          return await completeCheckInFromAgent(ctx, input);
        } catch (error) {
          const message = error instanceof Error ? error.message : "完善打卡失败";
          return {
            success: false,
            error: message,
            hint: "请先调用 listTodayCheckIns 获取最新 checkInId 后重试；若已完善可继续下一条或提交日报。若提示无权，说明该客户非本人负责，勿重复落库。",
          };
        }
      },
    }),
    createOpportunity: tool({
      description: "新建商机。需关联已有客户，填写预计金额、预计签约月份、阶段。",
      parameters: z.object({
        title: z.string().describe("商机名称"),
        customerId: z.string().optional().describe("客户 ID"),
        customerName: z.string().optional().describe("客户名称"),
        expectedAmount: z.number().positive().describe("预计金额（元）"),
        expectedCloseDate: z.string().describe("预计签约月份 YYYY-MM"),
        stage: z.string().describe("商机阶段（配置项 value）"),
        requirementDesc: z.string().optional().describe("需求描述"),
        winProbability: z.number().int().min(0).max(100).optional().describe("赢单概率 %"),
        competitor: z.string().optional().describe("竞争对手"),
        notes: z.string().optional().describe("备注"),
      }),
      execute: async (input) => createOpportunityFromAgent(ctx, input),
    }),
    updateOpportunity: tool({
      description: "更新已有商机（阶段、金额、预计签约月、需求等）。已放弃商机不可改。",
      parameters: z.object({
        opportunityId: z.string().describe("商机 ID"),
        title: z.string().optional().describe("商机名称"),
        expectedAmount: z.number().positive().optional().describe("预计金额"),
        expectedCloseDate: z.string().optional().describe("预计签约月份 YYYY-MM"),
        stage: z.string().optional().describe("商机阶段"),
        requirementDesc: z.string().optional().describe("需求描述"),
        winProbability: z.number().int().min(0).max(100).optional().describe("赢单概率"),
        competitor: z.string().optional().describe("竞争对手"),
        notes: z.string().optional().describe("备注"),
      }),
      execute: async (input) => updateOpportunityFromAgent(ctx, input),
    }),
  };
}
