/**
 * 导出项目 + 排班（不含阶段/任务计划；客户按名称、人员按姓名匹配）。
 * 用法：npx tsx scripts/export-projects-schedule.ts [输出路径]
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function decStr(v: { toString(): string } | null | undefined): string | null {
  if (v == null) return null;
  return v.toString();
}

async function main() {
  const outPath = path.resolve(
    process.argv[2] ?? path.join(process.cwd(), "tmp", "projects-schedule-sync.json")
  );

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: {
      customer: { select: { name: true } },
      projectManager: { select: { name: true } },
      contract: { select: { title: true } },
      staffAllocations: {
        include: { user: { select: { name: true } } },
        orderBy: [{ startDate: "asc" }, { userId: "asc" }],
      },
      members: {
        include: {
          user: {
            select: {
              name: true,
              personnelProfile: { select: { personnelType: true } },
            },
          },
        },
      },
    },
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    count: projects.length,
    projects: projects.map((p) => ({
      name: p.name,
      status: p.status,
      progressPercent: p.progressPercent,
      plannedStartAt: p.plannedStartAt?.toISOString() ?? null,
      plannedEndAt: p.plannedEndAt?.toISOString() ?? null,
      actualStartAt: p.actualStartAt?.toISOString() ?? null,
      actualEndAt: p.actualEndAt?.toISOString() ?? null,
      notes: p.notes,
      customerName: p.customer?.name ?? null,
      contractTitle: p.contract?.title ?? null,
      projectManagerName: p.projectManager?.name ?? null,
      members: p.members.map((m) => ({
        userName: m.user.name,
        isProjectManager: m.isProjectManager,
        memberRole: m.memberRole ?? m.user.personnelProfile?.personnelType ?? "IMPLEMENTER",
      })),
      allocations: p.staffAllocations.map((a) => ({
        userName: a.user.name,
        startDate: a.startDate.toISOString(),
        endDate: a.endDate.toISOString(),
        allocationMode: a.allocationMode,
        plannedDays: decStr(a.plannedDays),
        splitWeight: decStr(a.splitWeight),
        dailyRateSnapshot: a.dailyRateSnapshot.toString(),
        notes: a.notes,
      })),
    })),
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(payload, null, 2), "utf8");
  const allocCount = payload.projects.reduce((n, p) => n + p.allocations.length, 0);
  console.log(`✓ 已导出 ${payload.count} 个项目、${allocCount} 段排班 → ${outPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
