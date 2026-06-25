/**
 * 合并名称重复的客户：保留关联数据最多的一条，迁移其余记录后删除重复项。
 * 用法:
 *   npx tsx scripts/merge-duplicate-customers.ts --dry-run
 *   npx tsx scripts/merge-duplicate-customers.ts
 */
import { PrismaClient, type HospitalLevel } from "@prisma/client";
import { customerNameMatchKey } from "../src/lib/customers/duplicate-name";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

type CustomerRow = {
  id: string;
  name: string;
  updatedAt: Date;
  customerType: string | null;
  customerGrade: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  hospitalLevel: string | null;
  bedCount: number | null;
  existingSystem: string | null;
  source: string | null;
  notes: string | null;
  ownerId: string | null;
};

async function scoreCustomer(id: string): Promise<number> {
  const [followUps, opportunities, contacts, contractsSign, contractsEnd, checkIns, projects] =
    await Promise.all([
      prisma.followUp.count({ where: { customerId: id } }),
      prisma.opportunity.count({ where: { customerId: id } }),
      prisma.contact.count({ where: { customerId: id } }),
      prisma.contract.count({ where: { signCustomerId: id } }),
      prisma.contract.count({ where: { endUserCustomerId: id } }),
      prisma.salesCheckIn.count({ where: { customerId: id } }),
      prisma.project.count({ where: { customerId: id } }),
    ]);
  return followUps + opportunities + contacts + contractsSign + contractsEnd + checkIns + projects;
}

function pickKeeper(rows: CustomerRow[], scores: Map<string, number>): CustomerRow {
  return [...rows].sort((a, b) => {
    const scoreDiff = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}

function mergeScalarFields(keeper: CustomerRow, duplicate: CustomerRow) {
  return {
    customerType: keeper.customerType ?? duplicate.customerType,
    customerGrade: keeper.customerGrade ?? duplicate.customerGrade,
    province: keeper.province ?? duplicate.province,
    city: keeper.city ?? duplicate.city,
    district: keeper.district ?? duplicate.district,
    hospitalLevel: keeper.hospitalLevel ?? duplicate.hospitalLevel,
    bedCount: keeper.bedCount ?? duplicate.bedCount,
    existingSystem: keeper.existingSystem ?? duplicate.existingSystem,
    source: keeper.source ?? duplicate.source,
    notes: keeper.notes ?? duplicate.notes,
    ownerId: keeper.ownerId ?? duplicate.ownerId,
    name: keeper.name.length >= duplicate.name.length ? keeper.name : duplicate.name,
  };
}

async function mergeGroup(group: CustomerRow[]) {
  const scores = new Map<string, number>();
  for (const row of group) {
    scores.set(row.id, await scoreCustomer(row.id));
  }

  const keeper = pickKeeper(group, scores);
  const duplicates = group.filter((row) => row.id !== keeper.id);

  console.log(`\n「${keeper.name}」(${customerNameMatchKey(keeper.name)})`);
  console.log(`  保留: ${keeper.id} (score=${scores.get(keeper.id)})`);
  for (const duplicate of duplicates) {
    console.log(`  合并并删除: ${duplicate.id} (score=${scores.get(duplicate.id)})`);
  }

  if (dryRun) return { merged: duplicates.length };

  for (const duplicate of duplicates) {
    await prisma.$transaction(async (tx) => {
      const currentKeeper = await tx.customer.findUniqueOrThrow({ where: { id: keeper.id } });
      const patch = mergeScalarFields(currentKeeper as CustomerRow, duplicate);
      await tx.customer.update({
        where: { id: keeper.id },
        data: {
          ...patch,
          hospitalLevel: (patch.hospitalLevel as HospitalLevel | null) ?? undefined,
        },
      });

      await tx.contact.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keeper.id } });
      await tx.followUp.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keeper.id } });
      await tx.opportunity.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keeper.id } });
      await tx.project.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keeper.id } });
      await tx.salesTask.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keeper.id } });
      await tx.salesCost.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keeper.id } });
      await tx.presalesAssignment.updateMany({
        where: { customerId: duplicate.id },
        data: { customerId: keeper.id },
      });
      await tx.salesCheckIn.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keeper.id } });
      await tx.salesWeeklyAssignment.updateMany({
        where: { customerId: duplicate.id },
        data: { customerId: keeper.id },
      });
      await tx.salesPlanItem.updateMany({ where: { customerId: duplicate.id }, data: { customerId: keeper.id } });
      await tx.customerClaimRequest.updateMany({
        where: { customerId: duplicate.id },
        data: { customerId: keeper.id },
      });
      await tx.contract.updateMany({
        where: { signCustomerId: duplicate.id },
        data: { signCustomerId: keeper.id },
      });
      await tx.contract.updateMany({
        where: { endUserCustomerId: duplicate.id },
        data: { endUserCustomerId: keeper.id },
      });

      const tags = await tx.customerTag.findMany({ where: { customerId: duplicate.id } });
      for (const tag of tags) {
        const exists = await tx.customerTag.findFirst({
          where: { customerId: keeper.id, tagValue: tag.tagValue },
        });
        if (exists) {
          await tx.customerTag.delete({
            where: { customerId_tagValue: { customerId: duplicate.id, tagValue: tag.tagValue } },
          });
        } else {
          await tx.customerTag.update({
            where: { customerId_tagValue: { customerId: duplicate.id, tagValue: tag.tagValue } },
            data: { customerId: keeper.id },
          });
        }
      }

      const fromRels = await tx.customerRelation.findMany({ where: { customerId: duplicate.id } });
      for (const rel of fromRels) {
        const relatedCustomerId = rel.relatedCustomerId === duplicate.id ? keeper.id : rel.relatedCustomerId;
        if (relatedCustomerId === keeper.id) {
          await tx.customerRelation.delete({ where: { id: rel.id } });
          continue;
        }
        const exists = await tx.customerRelation.findFirst({
          where: { customerId: keeper.id, relatedCustomerId },
        });
        if (exists) await tx.customerRelation.delete({ where: { id: rel.id } });
        else {
          await tx.customerRelation.update({
            where: { id: rel.id },
            data: { customerId: keeper.id, relatedCustomerId },
          });
        }
      }

      const toRels = await tx.customerRelation.findMany({ where: { relatedCustomerId: duplicate.id } });
      for (const rel of toRels) {
        const customerId = rel.customerId === duplicate.id ? keeper.id : rel.customerId;
        if (customerId === keeper.id) {
          await tx.customerRelation.delete({ where: { id: rel.id } });
          continue;
        }
        const exists = await tx.customerRelation.findFirst({
          where: { customerId, relatedCustomerId: keeper.id },
        });
        if (exists) await tx.customerRelation.delete({ where: { id: rel.id } });
        else {
          await tx.customerRelation.update({
            where: { id: rel.id },
            data: { customerId, relatedCustomerId: keeper.id },
          });
        }
      }

      await tx.customer.delete({ where: { id: duplicate.id } });
    });
  }

  return { merged: duplicates.length };
}

async function main() {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      name: true,
      updatedAt: true,
      customerType: true,
      customerGrade: true,
      province: true,
      city: true,
      district: true,
      hospitalLevel: true,
      bedCount: true,
      existingSystem: true,
      source: true,
      notes: true,
      ownerId: true,
    },
  });

  const groups = new Map<string, CustomerRow[]>();
  for (const customer of customers) {
    const key = customerNameMatchKey(customer.name);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(customer);
    groups.set(key, list);
  }

  const duplicateGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  if (duplicateGroups.length === 0) {
    console.log("未发现重复客户。");
    return;
  }

  console.log(`${dryRun ? "[dry-run] " : ""}发现 ${duplicateGroups.length} 组重复客户`);

  let mergedCount = 0;
  for (const [, group] of duplicateGroups) {
    const result = await mergeGroup(group);
    mergedCount += result.merged;
  }

  console.log(`\n${dryRun ? "预计" : "已"}合并删除 ${mergedCount} 条重复客户。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
