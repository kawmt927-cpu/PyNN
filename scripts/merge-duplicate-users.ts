/**
 * 合并重复用户：将 duplicate 账号的全部关联迁移到 keeper，然后删除 duplicate。
 * 用法:
 *   npx tsx scripts/merge-duplicate-users.ts --keeper <id> --duplicate <id> --dry-run
 *   npx tsx scripts/merge-duplicate-users.ts --keeper <id> --duplicate <id>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function arg(name: string) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function countRefs(userId: string) {
  const [
    ownedCustomers,
    followUps,
    ownedOpportunities,
    contracts,
    salesCheckIns,
    salesDailyLogs,
    weeklyAssigned,
  ] = await Promise.all([
    prisma.customer.count({ where: { ownerId: userId } }),
    prisma.followUp.count({ where: { userId } }),
    prisma.opportunity.count({ where: { ownerId: userId } }),
    prisma.contract.count({ where: { ownerId: userId } }),
    prisma.salesCheckIn.count({ where: { userId } }),
    prisma.salesDailyLog.count({ where: { userId } }),
    prisma.salesWeeklyAssignment.count({ where: { assigneeId: userId } }),
  ]);
  return {
    ownedCustomers,
    followUps,
    ownedOpportunities,
    contracts,
    salesCheckIns,
    salesDailyLogs,
    weeklyAssigned,
    total:
      ownedCustomers +
      followUps +
      ownedOpportunities +
      contracts +
      salesCheckIns +
      salesDailyLogs +
      weeklyAssigned,
  };
}

async function mergeUser(keeperId: string, duplicateId: string) {
  const [keeper, duplicate] = await Promise.all([
    prisma.user.findUnique({ where: { id: keeperId } }),
    prisma.user.findUnique({ where: { id: duplicateId } }),
  ]);
  if (!keeper) throw new Error(`keeper 不存在: ${keeperId}`);
  if (!duplicate) throw new Error(`duplicate 不存在: ${duplicateId}`);
  if (keeperId === duplicateId) throw new Error("keeper 与 duplicate 不能相同");

  const before = await countRefs(duplicateId);
  console.log(`保留: ${keeper.name} <${keeper.email}> (${keeperId})`);
  console.log(`合并: ${duplicate.name} <${duplicate.email}> (${duplicateId})`);
  console.log("duplicate 关联计数:", before);

  if (dryRun) {
    console.log("[dry-run] 未写入数据库");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.customer.updateMany({ where: { ownerId: duplicateId }, data: { ownerId: keeperId } });
    await tx.followUp.updateMany({ where: { userId: duplicateId }, data: { userId: keeperId } });
    await tx.opportunity.updateMany({ where: { ownerId: duplicateId }, data: { ownerId: keeperId } });
    await tx.opportunityStageLog.updateMany({
      where: { userId: duplicateId },
      data: { userId: keeperId },
    });
    await tx.opportunityFollowUp.updateMany({
      where: { userId: duplicateId },
      data: { userId: keeperId },
    });
    await tx.contract.updateMany({ where: { ownerId: duplicateId }, data: { ownerId: keeperId } });
    await tx.contract.updateMany({
      where: { ourRepresentativeId: duplicateId },
      data: { ourRepresentativeId: keeperId },
    });
    await tx.contract.updateMany({
      where: { submittedById: duplicateId },
      data: { submittedById: keeperId },
    });
    await tx.contract.updateMany({
      where: { approvedById: duplicateId },
      data: { approvedById: keeperId },
    });
    await tx.contractPaymentRecord.updateMany({
      where: { recordedById: duplicateId },
      data: { recordedById: keeperId },
    });
    await tx.salesTarget.updateMany({ where: { userId: duplicateId }, data: { userId: keeperId } });
    await tx.salesMonthlyTarget.updateMany({
      where: { userId: duplicateId },
      data: { userId: keeperId },
    });
    await tx.salesTask.updateMany({ where: { userId: duplicateId }, data: { userId: keeperId } });
    await tx.salesDailyLog.updateMany({ where: { userId: duplicateId }, data: { userId: keeperId } });
    await tx.salesCheckIn.updateMany({ where: { userId: duplicateId }, data: { userId: keeperId } });
    await tx.salesWeeklyAssignment.updateMany({
      where: { assigneeId: duplicateId },
      data: { assigneeId: keeperId },
    });
    await tx.salesWeeklyAssignment.updateMany({
      where: { createdById: duplicateId },
      data: { createdById: keeperId },
    });
    await tx.salesPlanBoard.updateMany({ where: { userId: duplicateId }, data: { userId: keeperId } });
    await tx.salesCost.updateMany({ where: { salesUserId: duplicateId }, data: { salesUserId: keeperId } });
    await tx.salesCost.updateMany({
      where: { recordedById: duplicateId },
      data: { recordedById: keeperId },
    });
    await tx.salesCost.updateMany({
      where: { presalesUserId: duplicateId },
      data: { presalesUserId: keeperId },
    });
    await tx.presalesAssignment.updateMany({
      where: { presalesUserId: duplicateId },
      data: { presalesUserId: keeperId },
    });
    await tx.presalesAssignment.updateMany({
      where: { salesUserId: duplicateId },
      data: { salesUserId: keeperId },
    });
    await tx.presalesAssignment.updateMany({
      where: { assignedById: duplicateId },
      data: { assignedById: keeperId },
    });
    await tx.projectMember.updateMany({ where: { userId: duplicateId }, data: { userId: keeperId } });
    await tx.project.updateMany({
      where: { projectManagerId: duplicateId },
      data: { projectManagerId: keeperId },
    });
    await tx.task.updateMany({ where: { assigneeId: duplicateId }, data: { assigneeId: keeperId } });
    await tx.task.updateMany({ where: { creatorId: duplicateId }, data: { creatorId: keeperId } });
    await tx.projectCost.updateMany({
      where: { recordedById: duplicateId },
      data: { recordedById: keeperId },
    });
    await tx.customerClaimRequest.updateMany({
      where: { requesterId: duplicateId },
      data: { requesterId: keeperId },
    });
    await tx.customerClaimRequest.updateMany({
      where: { reviewerId: duplicateId },
      data: { reviewerId: keeperId },
    });
    await tx.aiAgentConfig.updateMany({
      where: { updatedById: duplicateId },
      data: { updatedById: keeperId },
    });
    await tx.amapConfig.updateMany({
      where: { updatedById: duplicateId },
      data: { updatedById: keeperId },
    });

    await tx.user.delete({ where: { id: duplicateId } });
  });

  const after = await countRefs(keeperId);
  console.log("合并完成。keeper 当前关联计数:", after);
}

async function main() {
  const keeperId = arg("--keeper");
  const duplicateId = arg("--duplicate");
  if (!keeperId || !duplicateId) {
    console.error("用法: npx tsx scripts/merge-duplicate-users.ts --keeper <id> --duplicate <id> [--dry-run]");
    process.exit(1);
  }
  await mergeUser(keeperId, duplicateId);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
