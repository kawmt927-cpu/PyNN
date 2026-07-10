import { prisma } from "@/lib/prisma";
import { dateRangesOverlap } from "./allocation-overlap";
import { compareDates, toDateOnly } from "./workdays";

/** 修剪同项目同人员重叠分段，保留各段独立、仅截断或删除重叠部分 */
export async function trimOverlappingProjectAllocations(): Promise<number> {
  const rows = await prisma.projectStaffAllocation.findMany({
    select: { projectId: true, userId: true },
  });
  const groups = new Map<string, { projectId: string; userId: string }>();
  for (const row of rows) {
    groups.set(`${row.projectId}\0${row.userId}`, row);
  }

  let fixed = 0;
  for (const { projectId, userId } of groups.values()) {
    fixed += await trimPairUntilClean(projectId, userId);
  }
  return fixed;
}

async function trimPairUntilClean(projectId: string, userId: string): Promise<number> {
  let fixed = 0;
  while (true) {
    const allocations = await prisma.projectStaffAllocation.findMany({
      where: { projectId, userId },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
    });
    let changed = false;
    for (let i = 0; i < allocations.length; i++) {
      for (let j = i + 1; j < allocations.length; j++) {
        const a = allocations[i];
        const b = allocations[j];
        if (!dateRangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) continue;

        const trimEnd = toDateOnly(b.startDate);
        trimEnd.setDate(trimEnd.getDate() - 1);
        if (compareDates(a.startDate, trimEnd) > 0) {
          await prisma.projectStaffAllocation.delete({ where: { id: a.id } });
        } else {
          await prisma.projectStaffAllocation.update({
            where: { id: a.id },
            data: { endDate: trimEnd },
          });
        }
        changed = true;
        fixed += 1;
        break;
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  return fixed;
}

/** @deprecated 使用 trimOverlappingProjectAllocations */
export async function dedupeAllProjectUserAllocations(): Promise<number> {
  return trimOverlappingProjectAllocations();
}

/** @deprecated */
export async function mergeProjectUserAllocations(
  projectId: string,
  userId: string
): Promise<{ id: string } | null> {
  const first = await prisma.projectStaffAllocation.findFirst({
    where: { projectId, userId },
    select: { id: true },
  });
  return first ? { id: first.id } : null;
}
