/**
 * 为张销售插入今日测试用往来记录。
 * 用法: npx tsx scripts/seed-zhang-today-follow-ups.ts
 */
import { PrismaClient, FollowUpMethod } from "@prisma/client";

const prisma = new PrismaClient();

const SALES_EMAIL = "sales1@example.com";

function todayAt(hour: number, minute: number) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysFromNowAt(days: number, hour: number, minute: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: SALES_EMAIL },
    select: { id: true, name: true },
  });
  if (!user) {
    throw new Error(`未找到销售账号 ${SALES_EMAIL}`);
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const deleted = await prisma.followUp.deleteMany({
    where: {
      userId: user.id,
      followUpAt: { gte: todayStart, lt: todayEnd },
      content: { startsWith: "[测试]" },
    },
  });

  const customers = await prisma.customer.findMany({
    where: { ownerId: user.id },
    select: {
      id: true,
      name: true,
      contacts: { select: { id: true, name: true }, take: 1 },
      opportunities: {
        where: { status: "NOT_SIGNED" },
        select: { id: true, title: true },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
    take: 8,
  });

  if (customers.length === 0) {
    throw new Error("张销售名下暂无客户，无法创建往来");
  }

  const samples: Array<{
    method: FollowUpMethod;
    hour: number;
    minute: number;
    content: string;
    result?: string;
    nextDays?: number;
    nextMethod?: FollowUpMethod;
    nextContent?: string;
  }> = [
    {
      method: "FACE_VISIT",
      hour: 9,
      minute: 15,
      content: "[测试] 上午到院拜访信息科，演示绩效考核模块报表功能，陈主任对科室 KPI 看板较感兴趣。",
      result: "客户希望下周安排科室主任一起再看演示。",
      nextDays: 5,
      nextMethod: "FACE_VISIT",
      nextContent: "带科室主任复演示 KPI 看板",
    },
    {
      method: "PHONE",
      hour: 10,
      minute: 40,
      content: "[测试] 电话跟进上周报价，确认院领导对预算审批进度，对方反馈正在走院内流程。",
      result: "预计两周内有结果。",
      nextDays: 7,
      nextMethod: "PHONE",
      nextContent: "询问预算审批结果",
    },
    {
      method: "WECHAT",
      hour: 11,
      minute: 20,
      content: "[测试] 微信发送产品白皮书和同类医院案例，对方已读并回复「收到，转给信息科」。",
      nextDays: 3,
      nextMethod: "WECHAT",
      nextContent: "确认信息科是否已阅读材料",
    },
    {
      method: "FACE_VISIT",
      hour: 14,
      minute: 5,
      content: "[测试] 下午面访副院长，沟通电子病历与绩效系统联动需求，对方提出要先做小范围试点。",
      result: "同意先选两个科室试点。",
      nextDays: 10,
      nextMethod: "FACE_VISIT",
      nextContent: "提交试点方案与报价",
    },
    {
      method: "PHONE",
      hour: 15,
      minute: 30,
      content: "[测试] 电话回访渠道伙伴，了解其在兴化地区的医院资源，对方表示可介绍两家县级医院。",
      result: "约定下周一起拜访其中一家。",
      nextDays: 6,
      nextMethod: "FACE_VISIT",
      nextContent: "与渠道伙伴联合拜访县级医院",
    },
    {
      method: "WECHAT",
      hour: 16,
      minute: 45,
      content: "[测试] 微信沟通合同条款修订意见，客户法务对验收标准有两处修改建议。",
      nextDays: 2,
      nextMethod: "WECHAT",
      nextContent: "反馈修订后的验收条款",
    },
    {
      method: "OTHER",
      hour: 17,
      minute: 10,
      content: "[测试] 参加线上产品说明会，客户信息科 3 人参与，会后整理了会议纪要发给对方。",
      result: "客户要求补充接口对接说明。",
      nextDays: 4,
      nextMethod: "OTHER",
      nextContent: "发送接口对接说明文档",
    },
    {
      method: "FACE_VISIT",
      hour: 18,
      minute: 0,
      content: "[测试] 收工前顺路回访老客户，了解系统上线后使用情况，运维反馈整体稳定。",
      result: "客户满意，有二期扩展意向。",
      nextDays: 14,
      nextMethod: "PHONE",
      nextContent: "电话沟通二期扩展需求",
    },
  ];

  const created: string[] = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const customer = customers[i % customers.length];
    const contactId = customer.contacts[0]?.id ?? null;
    const opportunityId = customer.opportunities[0]?.id ?? null;

    const followUp = await prisma.followUp.create({
      data: {
        userId: user.id,
        customerId: customer.id,
        contactId,
        opportunityId,
        method: sample.method,
        content: sample.content,
        result: sample.result ?? null,
        followUpAt: todayAt(sample.hour, sample.minute),
        nextFollowUpAt: sample.nextDays
          ? daysFromNowAt(sample.nextDays, 9, 0)
          : null,
        nextFollowUpMethod: sample.nextMethod ?? null,
        nextFollowUpContent: sample.nextContent ?? null,
      },
    });

    if (contactId) {
      await prisma.followUpContact.create({
        data: { followUpId: followUp.id, contactId },
      });
    }

    created.push(`${sample.hour}:${String(sample.minute).padStart(2, "0")} ${customer.name}`);
  }

  console.log(`已清理旧测试往来 ${deleted.count} 条`);
  console.log(`已为 ${user.name} 创建今日测试往来 ${created.length} 条：`);
  for (const line of created) console.log(`  · ${line}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
