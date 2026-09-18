import { tool } from "ai";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import type { EffectiveAiAgentConfig } from "@/lib/agent/config";
import { canEditCustomerFollowUp, customerDetailInclude, getCustomerForUser } from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";
import {
  createCustomerFromAgent,
  createFollowUpFromAgent,
  setContactResponsibleProvincesFromAgent,
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
  clientIp?: string | null;
};

function writeContext(session: AgentSession) {
  return {
    userId: session.user.id,
    role: session.user.role,
    dailyLogId: session.dailyLogId,
    clientIp: session.clientIp ?? null,
  };
}

/** 工具参数枚举：仅暴露当前启用的 value + 中文 label，避免模型传 seed 旧值 */
function zAllowedConfigTokens(
  options: { value: string; label: string }[],
  opts?: { optional?: boolean; describe: string }
) {
  const tokens = [
    ...new Set(
      options.flatMap((o) => [o.value, o.label].filter((s) => Boolean(s?.trim())))
    ),
  ];
  const describe = opts?.describe ?? "";
  if (tokens.length === 0) {
    const schema = z.string().describe(describe);
    return opts?.optional ? schema.optional() : schema;
  }
  const schema = z
    .enum(tokens as [string, ...string[]])
    .describe(
      `${describe} 仅允许：${options.map((o) => `${o.label}（${o.value}）`).join("、")}`
    );
  return opts?.optional ? schema.optional() : schema;
}

export async function createCrmAgentTools(
  session: AgentSession,
  config: EffectiveAiAgentConfig
) {
  const { role, id: userId } = session.user;
  const ctx = writeContext(session);

  const { CONFIG_CATEGORY, getConfigOptions } = await import("@/lib/config-options");
  const [customerSourceOptions, customerTypeOptions, channelKindOptions] = await Promise.all([
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_SOURCE),
    getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
    getConfigOptions(CONFIG_CATEGORY.CHANNEL_KIND),
  ]);
  const defaultSource =
    customerSourceOptions.find((o) => o.label === "自行开发" || o.value === "ACTIVE_DEV")
      ?.value ?? customerSourceOptions[0]?.value;

  const sourceParam = zAllowedConfigTokens(customerSourceOptions, {
    optional: true,
    describe:
      "客户来源（只用当前配置；可省略，省略时默认自行开发类选项）。禁止 ACTIVE_DEV/COMPANY_ASSIGN 等旧 seed 值。",
  });
  const customerTypeParam = zAllowedConfigTokens(customerTypeOptions, {
    optional: true,
    describe:
      "关系类型（只用当前配置）。医院客户可省略（自动直接客户）；渠道/公司须传「渠道」或 CHANNEL。禁止 PARTNER 等未启用旧值。",
  });
  const channelKindParam = zAllowedConfigTokens(channelKindOptions, {
    optional: true,
    describe:
      "渠道类型（仅关系类型=渠道时必填）：信息化集成商/HRP厂商/友商/其他。运营商归入其他。",
  });

  return {
    ...(config.toolSearchCustomers
      ? {
          searchCustomers: tool({
            description:
              "按客户名称或联系人姓名搜索系统已有客户。联系人命中时返回 matchedContactName，应优先关联该公司/医院，勿再为该人新建个人客户。返回 writable 与 canLogFollowUp。日报确认后：canLogFollowUp=true 时必须 createFollowUp；writable=false 仍须记往来。新建医院/公司前须先全库查重，再 verifyOrgName 核对官方全称。",
            parameters: z.object({
              query: z.string().describe("客户名称关键词"),
            }),
            execute: async ({ query }) => {
              // 查重须扫全库并标记可写，避免「公海/他人客户」搜不到被误判为新客户
              const rows = await searchCustomersForUser(role, userId, query, {
                markWritable: true,
              });
              return {
                count: rows.length,
                customers: rows.map((c) => ({
                  id: c.id,
                  name: c.name,
                  category: c.category,
                  customerGrade: c.customerGrade,
                  writable: c.writable,
                  canLogFollowUp: true,
                  ownerName: c.ownerName,
                  matchedContactName: c.matchedContactName ?? null,
                  matchedContactTitle: c.matchedContactTitle ?? null,
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
                  customerName: o.customer?.name ?? "未指定客户",
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
              "根据客户 ID 获取详情。返回 writable 与 canLogFollowUp。日报流程中 canLogFollowUp=true 即可 createFollowUp；writable=false 时仍记往来，但不要改等级/档案，可顺带告知销售负责人是谁。",
            parameters: z.object({
              customerId: z.string().describe("客户 ID"),
            }),
            execute: async ({ customerId }) => {
              const customer = await prisma.customer.findUnique({
                where: { id: customerId },
                include: customerDetailInclude,
              });
              if (!customer) {
                return { error: "客户不存在" };
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
                nationwideChannel: customer.nationwideChannel,
                writable,
                canLogFollowUp: true,
                owner: customer.owner?.name ?? null,
                assistants: customer.assistantOwners.map((row) => row.user.name),
                notes: customer.notes,
                contacts: customer.contacts.map((c) => ({
                  id: c.id,
                  name: c.name,
                  title: c.title,
                  phone: c.phone,
                  isPrimary: c.isPrimary,
                  responsibleProvinces: c.responsibleProvinces.map((r) => r.province),
                  needsResponsibleProvince:
                    customer.nationwideChannel && c.responsibleProvinces.length === 0,
                })),
              };
            },
          }),
        }
      : {}),
    getCustomerBrief: tool({
      description:
        "获取客户档案简报（等级、上次往来、下次计划）。销售自述后写入或需确认等级/商机时调用，勿在开场播报。",
      parameters: z.object({
        customerId: z.string().describe("客户 ID"),
      }),
      execute: async ({ customerId }) => {
        const brief = await fetchCustomerBriefForAgent(customerId, role, userId);
        if (!brief) {
          return { error: "客户不存在" };
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
    verifyOrgName: tool({
      description:
        "核对医院/公司的官方准确全称（新建前必用）。传入销售口述名称与类别，返回官方全称及地址等；须把官方全称念给销售确认后，再在总结里用该全称 createCustomer。核验失败则追问更完整名称，禁止用简称直接建档。",
      parameters: z.object({
        name: z.string().describe("销售口述的医院或公司名称"),
        category: z.enum(["HOSPITAL", "COMPANY"]).describe("HOSPITAL=医院；COMPANY=公司/渠道"),
        province: z.string().optional().describe("已知省份（可选，用于同名消歧）"),
        city: z.string().optional().describe("已知城市（可选）"),
        district: z.string().optional().describe("已知区县（可选）"),
      }),
      execute: async (input) => {
        try {
          const { requireVerifiedOrgProfile } = await import("@/lib/customers/kimi-enrich");
          const verified = await requireVerifiedOrgProfile(input);
          return {
            success: true as const,
            officialName: verified.officialName,
            nameCorrected: verified.nameCorrected,
            inputName: input.name.trim(),
            province: verified.province,
            city: verified.city,
            district: verified.district,
            hospitalLevel: verified.hospitalLevel,
            bedCount: verified.bedCount,
            message: verified.nameCorrected
              ? `建议官方全称：「${verified.officialName}」（原口述：「${input.name.trim()}」）。请向销售确认后，用官方全称建档。`
              : `名称已核对为官方全称：「${verified.officialName}」。请向销售确认后建档。`,
          };
        } catch (e) {
          return {
            success: false as const,
            error: e instanceof Error ? e.message : "机构名称核验失败",
          };
        }
      },
    }),
    createCustomer: tool({
      description: [
        "将确认过的新客户记进系统（含可选主联系人）。写入前须 searchCustomers 全库查重；若已存在则返回 existingCustomerId。",
        "医院/公司：必须先 verifyOrgName 核对官方全称，并经销售确认；createCustomer 的 name 须用官方全称（系统仍会再次核验，不通过则拒绝建档）。",
        "建档优先级：医院 HOSPITAL / 公司 COMPANY 优先；见到的人必须写入 contactName 作为机构下的联系人，禁止把联系人单独建成个人客户。",
        "仅当销售明确确认「没有所属医院/公司」时才可用 INDIVIDUAL；名称像医院/公司时禁止 INDIVIDUAL。",
        "客户来源仅可用：" +
          (customerSourceOptions.map((o) => `${o.label}=${o.value}`).join("；") ||
            "（无，请省略）") +
          "。",
        "关系类型仅可用：" +
          (customerTypeOptions.map((o) => `${o.label}=${o.value}`).join("；") || "（无）") +
          "（医院可省略）。",
        "渠道类型仅可用：" +
          (channelKindOptions.map((o) => `${o.label}=${o.value}`).join("；") || "（无）") +
          "（关系类型为渠道时必填；运营商归入其他）。",
        "禁止传 ACTIVE_DEV、COMPANY_ASSIGN、CHANNEL_INTRO、PARTNER 等已停用/不存在的旧配置值。",
      ].join(""),
      parameters: z.object({
        name: z
          .string()
          .describe(
            "须为已核对的官方全称（verifyOrgName 返回的 officialName）；个人客户时才是本人姓名"
          ),
        category: z
          .enum(["HOSPITAL", "COMPANY", "INDIVIDUAL"])
          .describe(
            "HOSPITAL=医院；COMPANY=公司/渠道；INDIVIDUAL=个人（仅无所属机构时）。默认优先 HOSPITAL/COMPANY"
          ),
        province: z.string().optional().describe("省份"),
        city: z.string().optional().describe("城市"),
        district: z.string().optional().describe("区县"),
        hospitalLevel: z
          .enum(["GRADE_3A", "GRADE_3B", "GRADE_3", "GRADE_2A", "GRADE_2B", "GRADE_2", "OTHER"])
          .optional()
          .describe("医院等级（医院客户）"),
        bedCount: z.number().int().positive().optional().describe("床位数"),
        existingSystem: z.string().optional().describe("现有系统"),
        source: sourceParam,
        customerType: customerTypeParam,
        channelKind: channelKindParam,
        customerGrade: z
          .enum(["STAR_3", "STAR_2", "STAR_1", "NONE"])
          .describe("客户等级：STAR_3 有意向或在建 / STAR_2 已交付 / STAR_1 短期无意向 / NONE 长期无意向"),
        notes: z.string().optional().describe("备注"),
        contactName: z
          .string()
          .optional()
          .describe("机构客户的主联系人（自然人姓名）；销售见了谁就填谁，不要另建个人客户"),
        contactPhone: z.string().optional().describe("主联系人电话"),
        contactTitle: z.string().optional().describe("主联系人职务（可写中文）"),
      }),
      execute: async (input) => {
        try {
          return await createCustomerFromAgent(ctx, {
            ...input,
            source: input.source?.trim() || defaultSource || null,
            customerType:
              input.customerType?.trim() ||
              (input.category === "HOSPITAL" ? "DIRECT" : null),
            channelKind: input.channelKind?.trim() || null,
          });
        } catch (e) {
          return {
            success: false as const,
            error: e instanceof Error ? e.message : "新建客户失败",
          };
        }
      },
    }),
    createFollowUp: tool({
      description:
        "为已有客户写入跟进/往来（日报确认后必须真实调用）。必须指定联系人（contactIds 或 contactName）。不要求本人是负责人：任意已存在客户均可记入当前销售的往来。仅在销售确认完整总结后调用。除「长期无意向」客户外，必须同时传 nextFollowUpAt + nextFollowUpMethod + nextFollowUpContent。全国性渠道且联系人无负责省时：须先问销售并 setContactResponsibleProvinces / 传 responsibleProvinces，或总部对接传 skipResponsibleProvinces=true。writable=false 时仍须调用；不要改客户等级（勿传 suggestedGrade）。对销售勿复述工具名。",
      parameters: z.object({
        customerId: z.string().optional().describe("客户 ID（与 customerName 二选一）"),
        customerName: z.string().optional().describe("客户名称（与 customerId 二选一）"),
        contactId: z.string().optional().describe("联系人 ID（与 contactIds/contactName 三选一）"),
        contactIds: z
          .array(z.string().min(1))
          .optional()
          .describe("联系人 ID 列表（可多选；优先用 getCustomer 返回的 id）"),
        contactName: z
          .string()
          .optional()
          .describe("联系人姓名；系统无此人且本人可写档案时会自动新建"),
        contactNames: z.array(z.string().min(1)).optional().describe("多名联系人姓名"),
        responsibleProvinces: z
          .array(z.string().min(1))
          .optional()
          .describe("全国性渠道：为本次联系人标注负责省（如「江苏」「浙江」）；与 setContactResponsibleProvinces 二选一"),
        skipResponsibleProvinces: z
          .boolean()
          .optional()
          .describe("全国性渠道且销售确认该联系人为总部对接、暂不划分省区时传 true"),
        method: z
          .enum(["PHONE", "WECHAT", "FACE_VISIT", "OTHER"])
          .describe("本次往来方式：电话沟通/微信沟通/客户面访/其他"),
        content: z.string().describe("跟进内容摘要"),
        result: z.string().optional().describe("跟进结果/意向"),
        followUpAt: z
          .string()
          .describe(
            "跟进/拜访发生时间，ISO8601 且必须带东八区偏移，如 2026-07-18T14:30:00+08:00；禁止用 Z/UTC，禁止只写日期"
          ),
        nextFollowUpAt: z
          .string()
          .optional()
          .describe("下次往来计划时间，东八区 ISO8601（非长期无意向客户必填）"),
        nextFollowUpMethod: z
          .enum(["PHONE", "WECHAT", "FACE_VISIT", "OTHER"])
          .optional()
          .describe(
            "下次往来计划方式（非长期无意向客户必填）：PHONE=电话 / WECHAT=微信 / FACE_VISIT=当面拜访或客户面访 / OTHER=其他"
          ),
        nextFollowUpContent: z
          .string()
          .optional()
          .describe("下次往来目的和内容（非长期无意向客户必填，须写具体事项，禁止只填标点）"),
        suggestedGrade: z
          .enum(["STAR_3", "STAR_2", "STAR_1", "NONE"])
          .optional()
          .describe("建议客户等级：STAR_3 有意向或在建 / STAR_2 已交付 / STAR_1 短期无意向 / NONE 长期无意向；非负责人勿传"),
        skipAssignmentCompletion: z
          .boolean()
          .optional()
          .describe("销售明确说本次不完成指派任务时传 true；默认自动完成匹配的未完成指派"),
      }),
      execute: async (input) => {
        try {
          return await createFollowUpFromAgent(ctx, {
            ...input,
            enforceNationwideProvinces: true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "写入往来失败";
          const planHint =
            message.includes("下次往来")
              ? "写入失败是因为缺少下次往来计划字段。请根据销售已确认的内容，在工具参数中补齐 nextFollowUpAt、nextFollowUpMethod（PHONE/WECHAT/FACE_VISIT/OTHER）、nextFollowUpContent 后重试；不要只反复口头追问销售已回答过的问题。"
              : null;
          const contactHint = message.includes("联系人")
            ? "写入往来必须指定联系人。请向销售确认见了谁/打给谁，用 getCustomer 取 contactId，或传 contactName；全国性渠道缺负责省时先问清省份。"
            : null;
          const provinceHint = message.includes("负责省")
            ? "全国性渠道联系人缺负责省区。请向销售确认负责哪些省后调用 setContactResponsibleProvinces，或在 createFollowUp 传 responsibleProvinces；总部对接可传 skipResponsibleProvinces=true。"
            : null;
          return {
            success: false,
            error: message,
            hint:
              planHint ??
              contactHint ??
              provinceHint ??
              (message.includes("无权")
                ? "当前账号无权写入该客户；请写入日报说明或请销售联系管理员（对销售勿提技术术语）。"
                : "请核对客户与必填信息后重试。"),
          };
        }
      },
    }),
    setContactResponsibleProvinces: tool({
      description:
        "为全国性渠道客户的联系人标注负责省区（片区）。当 getCustomer 显示 needsResponsibleProvince=true 时，先向销售确认省份再调用；写入往来前应完成。仅负责人/协助负责人可改。",
      parameters: z.object({
        customerId: z.string().optional().describe("客户 ID"),
        customerName: z.string().optional().describe("客户名称"),
        contactId: z.string().optional().describe("联系人 ID（优先）"),
        contactName: z.string().optional().describe("联系人姓名"),
        provinces: z
          .array(z.string().min(1))
          .min(1)
          .describe("负责省列表，如 [\"江苏\",\"浙江\"]；用短省名"),
      }),
      execute: async (input) => {
        try {
          return await setContactResponsibleProvincesFromAgent(ctx, input);
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "标注负责省失败",
          };
        }
      },
    }),
    submitDailyLog: tool({
      description:
        "提交今日销售日报。仅在销售已在对话中确认完整总结（含今日总结+明日计划）后调用；须先有合格明日计划（具体事项+预计成果），「待安排」「继续跟进」等会被拒绝。禁止在未展示总结并获确认前调用。未收到本工具 success:true 前，禁止对销售说「日报已提交」。",
      parameters: z.object({
        dailyReport: z.string().describe("今日日报 Markdown 正文"),
        tomorrowPlan: z
          .string()
          .describe(
            "明日计划（必填）：须含具体事项与预计成果，禁止待安排/待定/继续跟进等敷衍表述"
          ),
        riskFlag: z.boolean().optional().describe("是否带风险提交（信息不全时）"),
        riskNotes: z.string().optional().describe("风险说明"),
      }),
      execute: async (input) => {
        try {
          const result = await submitDailyLogFromAgent(ctx, input);
          console.info("[agent-tool] submitDailyLog ok", {
            userId: ctx.userId,
            dailyLogId: ctx.dailyLogId,
            status: result.status,
          });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : "提交日报失败";
          console.error("[agent-tool] submitDailyLog failed", {
            userId: ctx.userId,
            dailyLogId: ctx.dailyLogId,
            message,
            tomorrowPlanLen: input.tomorrowPlan?.length ?? 0,
            reportLen: input.dailyReport?.length ?? 0,
          });
          return {
            success: false,
            error: message,
            hint: message.includes("明日计划")
              ? "不要提交。先收齐明日计划，发出完整总结供销售确认，确认后再调用本工具。且不得对销售说已提交。"
              : "请修正日报内容后重试。在收到 success:true 前不得对销售说日报已提交。",
          };
        }
      },
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
        "将今日关联客户的打卡记录完善为正式往来跟进。仅在销售确认完整总结后调用；调用前务必先用 listTodayCheckIns 取得最新 checkInId；无客户打卡勿用。面访打卡默认 method=FACE_VISIT。除「长期无意向」客户外，必须同时传 nextFollowUpAt + nextFollowUpMethod + nextFollowUpContent。对销售勿复述工具名。",
      parameters: z.object({
        checkInId: z.string().describe("listTodayCheckIns 返回的 id 字段，勿编造或复用过期 ID"),
        method: z
          .enum(["PHONE", "WECHAT", "FACE_VISIT", "OTHER"])
          .describe("本次往来方式"),
        content: z.string().describe("往来内容"),
        result: z.string().optional().describe("结果/意向"),
        followUpAt: z
          .string()
          .optional()
          .describe(
            "往来时间，东八区 ISO8601（如 2026-07-18T14:30:00+08:00）；默认用打卡时间。须为实际拜访时刻"
          ),
        nextFollowUpAt: z
          .string()
          .optional()
          .describe("下次往来计划时间，东八区 ISO8601（非长期无意向客户必填）"),
        nextFollowUpMethod: z
          .enum(["PHONE", "WECHAT", "FACE_VISIT", "OTHER"])
          .optional()
          .describe(
            "下次往来计划方式（非长期无意向客户必填）：PHONE=电话 / WECHAT=微信 / FACE_VISIT=当面拜访或客户面访 / OTHER=其他"
          ),
        nextFollowUpContent: z
          .string()
          .optional()
          .describe("下次往来目的和内容（非长期无意向客户必填）"),
        suggestedGrade: z
          .enum(["STAR_3", "STAR_2", "STAR_1", "NONE"])
          .optional()
          .describe("建议客户等级：STAR_3 有意向或在建 / STAR_2 已交付 / STAR_1 短期无意向 / NONE 长期无意向"),
      }),
      execute: async (input) => {
        try {
          return await completeCheckInFromAgent(ctx, input);
        } catch (error) {
          const message = error instanceof Error ? error.message : "完善打卡失败";
          const planHint =
            message.includes("下次往来")
              ? "完善失败是因为缺少下次往来计划字段。请补齐 nextFollowUpAt、nextFollowUpMethod、nextFollowUpContent 后重试；销售已回答过的内容不要再口头追问。"
              : null;
          return {
            success: false,
            error: message,
            hint:
              planHint ??
              "请先调用 listTodayCheckIns 获取最新 checkInId 后重试；若已完善可继续下一条或提交日报。若提示无权，说明该客户非本人负责，勿重复写入；对销售用白话说明。",
          };
        }
      },
    }),
    createOpportunity: tool({
      description: "新建商机。需关联已有客户，填写预计金额、预计签约月份、阶段；等级默认 P3（空心星）。",
      parameters: z.object({
        title: z.string().describe("商机名称"),
        customerId: z.string().optional().describe("客户 ID"),
        customerName: z.string().optional().describe("客户名称"),
        expectedAmount: z.number().positive().describe("预计金额（元）"),
        expectedCloseDate: z.string().describe("预计签约月份 YYYY-MM"),
        stage: z.string().describe("商机阶段（配置项 value）"),
        grade: z
          .enum(["P0", "P1", "P2", "P3"])
          .optional()
          .describe("商机等级，默认 P3"),
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
