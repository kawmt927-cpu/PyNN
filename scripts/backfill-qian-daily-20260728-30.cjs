/**
 * 一次性补录：钱金明 2026-07-28 / 2026-07-30 日报
 * Agent 口头称已提交但未调用 submitDailyLog，从对话拟稿恢复。
 *
 * 用法（生产容器内）:
 *   node /tmp/backfill-qian-daily-20260728-30.cjs
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const drafts = {
  cms4fvqkv002hql01ekodb0lw: {
    label: "2026-07-28",
    dailyReport: `## 今日总结

### 客户工作
- 【如东县第二人民医院 · 老客户】客户面访 · 拜访许书记、管科和金院长。先向许书记汇报，随后与管科详细沟通系统情况，管科对系统表示肯定。之后一起到金院长办公室汇报，金院长要求将电脑留在办公室，他会仔细了解，之后电话联系去取。

## 明日计划

电话联系涡阳县中医院，了解项目正式挂网启动时间；电话联系大丰人民医院，了解项目正式挂网启动时间`,
    tomorrowPlan:
      "电话联系涡阳县中医院，了解项目正式挂网启动时间；电话联系大丰人民医院，了解项目正式挂网启动时间",
    submittedAt: null,
    clearLate: true,
  },
  cms79itj60001ri012ggguz9z: {
    label: "2026-07-30",
    dailyReport: `## 今日总结

### 客户工作
- 【如东县第二人民医院 · 老客户】客户面访 · 金院长认可系统，想等 HIS 厂家确定后一起启动绩效项目，倾向 9-10 月启动。新大楼年底完工，明年 3 月搬入。
- 【渠道 · 纪超（周振国下属销售）】询问南京市口腔医院进展，表示想拿授权参与。已告知我方在跟，暂不放。

## 明日计划

电话徐州经销商牛总（周振国介绍），约下周一具体见面时间和地点。预计成果：敲定见面时间地点，或至少确认对方意向和方便时段。`,
    tomorrowPlan:
      "电话徐州经销商牛总（周振国介绍），约下周一具体见面时间和地点。预计成果：敲定见面时间地点，或至少确认对方意向和方便时段。",
    // 约 21:30 CST，迟交锁定（22:58）之前
    submittedAt: new Date("2026-07-30T13:30:00.000Z"),
    clearLate: true,
  },
};

async function main() {
  for (const [id, d] of Object.entries(drafts)) {
    const existing = await prisma.salesDailyLog.findUnique({ where: { id } });
    if (!existing) {
      console.log("missing", id);
      continue;
    }
    if (
      existing.status === "SUBMITTED" ||
      existing.status === "RISK_SUBMITTED"
    ) {
      console.log("skip already submitted", d.label, existing.status);
      continue;
    }
    const submittedAt = d.submittedAt || existing.updatedAt;
    const prev =
      existing.structuredOutput &&
      typeof existing.structuredOutput === "object" &&
      !Array.isArray(existing.structuredOutput)
        ? existing.structuredOutput
        : {};
    const updated = await prisma.salesDailyLog.update({
      where: { id },
      data: {
        dailyReport: d.dailyReport,
        status: "SUBMITTED",
        submittedAt,
        lateMarkedAt: d.clearLate ? null : existing.lateMarkedAt,
        structuredOutput: {
          ...prev,
          dailyReport: d.dailyReport,
          tomorrowPlan: d.tomorrowPlan,
          submittedAt: submittedAt.toISOString(),
          unsubmittedPlaceholder: false,
          adminBackfill: true,
          adminBackfillReason:
            "Agent claimed submitDailyLog success without writing; restored from conversation draft",
        },
      },
    });
    console.log(
      "ok",
      d.label,
      updated.status,
      String(updated.submittedAt),
      "late=",
      updated.lateMarkedAt
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
