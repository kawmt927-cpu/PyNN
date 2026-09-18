/**
 * 合并汉中市中心医院同名商机：
 * keep = 较新且已有往来/任务挂靠的那条
 * drop = 旧的那条
 *
 * 用法（本地）:
 *   npx tsx scripts/merge-hanzhong-opportunities.ts
 * 线上在容器内对 prod.db 执行同等逻辑（见 deploy 步骤）
 */
import { PrismaClient } from "@prisma/client";

const KEEP_ID = "cmsn8x1c1002yrx01ne13bw5o";
const DROP_ID = "cms8q0bf6003fok01y22on4d5";

async function main() {
  const prisma = new PrismaClient();
  try {
    const [keep, drop] = await Promise.all([
      prisma.opportunity.findUnique({ where: { id: KEEP_ID } }),
      prisma.opportunity.findUnique({ where: { id: DROP_ID } }),
    ]);
    if (!keep) {
      console.log("keep 商机不存在，可能已合并，跳过");
      return;
    }
    if (!drop) {
      console.log("drop 商机不存在，可能已合并，跳过");
      return;
    }

    const mergedRequirement = [drop.requirementDesc, keep.requirementDesc]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .join("\n\n");

    await prisma.$transaction(async (tx) => {
      // 外键改挂 keep
      await tx.followUp.updateMany({
        where: { opportunityId: DROP_ID },
        data: { opportunityId: KEEP_ID },
      });
      await tx.salesWeeklyAssignment.updateMany({
        where: { opportunityId: DROP_ID },
        data: { opportunityId: KEEP_ID },
      });
      await tx.salesPlanItem.updateMany({
        where: { opportunityId: DROP_ID },
        data: { opportunityId: KEEP_ID },
      });
      await tx.contract.updateMany({
        where: { opportunityId: DROP_ID },
        data: { opportunityId: KEEP_ID },
      });

      // FollowUpOpportunity 多对多：避免唯一约束冲突
      const dropLinks = await tx.followUpOpportunity.findMany({
        where: { opportunityId: DROP_ID },
      });
      for (const link of dropLinks) {
        const exists = await tx.followUpOpportunity.findUnique({
          where: {
            followUpId_opportunityId: {
              followUpId: link.followUpId,
              opportunityId: KEEP_ID,
            },
          },
        });
        if (exists) {
          await tx.followUpOpportunity.delete({
            where: {
              followUpId_opportunityId: {
                followUpId: link.followUpId,
                opportunityId: DROP_ID,
              },
            },
          });
        } else {
          await tx.followUpOpportunity.update({
            where: {
              followUpId_opportunityId: {
                followUpId: link.followUpId,
                opportunityId: DROP_ID,
              },
            },
            data: { opportunityId: KEEP_ID },
          });
        }
      }

      // 旧商机专属跟进 / 报价 / 阶段日志：迁到 keep
      await tx.opportunityFollowUp.updateMany({
        where: { opportunityId: DROP_ID },
        data: { opportunityId: KEEP_ID },
      });
      await tx.opportunityQuote.updateMany({
        where: { opportunityId: DROP_ID },
        data: { opportunityId: KEEP_ID },
      });
      await tx.opportunityStageLog.updateMany({
        where: { opportunityId: DROP_ID },
        data: { opportunityId: KEEP_ID },
      });

      // OpportunityParty：避免 unique 冲突
      const dropParties = await tx.opportunityParty.findMany({
        where: { opportunityId: DROP_ID },
      });
      for (const party of dropParties) {
        const exists = await tx.opportunityParty.findUnique({
          where: {
            opportunityId_customerId: {
              opportunityId: KEEP_ID,
              customerId: party.customerId,
            },
          },
        });
        if (exists) {
          await tx.opportunityParty.delete({ where: { id: party.id } });
        } else {
          await tx.opportunityParty.update({
            where: { id: party.id },
            data: { opportunityId: KEEP_ID },
          });
        }
      }

      await tx.opportunity.update({
        where: { id: KEEP_ID },
        data: {
          requirementDesc: mergedRequirement || keep.requirementDesc,
          // 保留较新商机的等级；若旧的需求说明更有用已合并
        },
      });

      await tx.opportunityStageLog.create({
        data: {
          opportunityId: KEEP_ID,
          userId: keep.ownerId,
          toStage: keep.stage,
          note: `合并重复商机：已并入并删除 ${DROP_ID}（创建于 ${drop.createdAt.toISOString()}）`,
        },
      });

      await tx.opportunity.delete({ where: { id: DROP_ID } });
    });

    console.log("✓ 已合并：保留", KEEP_ID, "删除", DROP_ID);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
