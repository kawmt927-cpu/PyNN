/**
 * 导入项目 + 排班到当前 DATABASE_URL。
 * 默认先删除库内全部项目，再按 JSON 重建（客户按名称匹配，人员按姓名匹配）。
 *
 * 用法：
 *   npx tsx scripts/import-projects-schedule.ts [--keep-existing] [json路径]
 * 默认 json：tmp/projects-schedule-sync.json
 */
import { readFile } from "fs/promises";
import path from "path";
import {
  AllocationMode,
  PersonnelType,
  Prisma,
  PrismaClient,
  ProjectStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

type ExportAllocation = {
  userName: string;
  startDate: string;
  endDate: string;
  allocationMode: AllocationMode;
  plannedDays: string | null;
  splitWeight: string | null;
  dailyRateSnapshot: string;
  notes: string | null;
};

type ExportProject = {
  name: string;
  status: ProjectStatus;
  progressPercent: number;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  notes: string | null;
  customerName: string | null;
  contractTitle: string | null;
  projectManagerName: string | null;
  members: Array<{
    userName: string;
    isProjectManager: boolean;
    memberRole?: PersonnelType;
  }>;
  allocations: ExportAllocation[];
};

type ExportFile = {
  exportedAt: string;
  count: number;
  projects: ExportProject[];
};

function dec(v: string | null | undefined): Prisma.Decimal | null {
  if (v == null || v === "") return null;
  return new Prisma.Decimal(v);
}

async function deleteAllProjects() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  console.log(`→ 删除线上全部项目（${projects.length}）…`);

  for (const p of projects) {
    await prisma.$transaction(async (tx) => {
      await tx.paymentInstallment.updateMany({
        where: { phase: { projectId: p.id } },
        data: { phaseId: null },
      });
      const costIds = (
        await tx.projectCost.findMany({
          where: { projectId: p.id },
          select: { id: true },
        })
      ).map((c) => c.id);
      if (costIds.length > 0) {
        await tx.expenseInvoice.updateMany({
          where: { postedProjectCostId: { in: costIds } },
          data: { postedProjectCostId: null },
        });
      }
      await tx.expenseInvoice.updateMany({
        where: { projectId: p.id },
        data: { projectId: null },
      });
      await tx.projectStaffAllocation.updateMany({
        where: { projectId: p.id },
        data: { phaseId: null },
      });
      await tx.task.updateMany({
        where: { projectId: p.id },
        data: { phaseId: null },
      });
      await tx.project.delete({ where: { id: p.id } });
    });
    console.log(`  − 已删 ${p.name}`);
  }
}

async function resolveUserId(name: string, byName: Map<string, string>) {
  const id = byName.get(name);
  if (!id) throw new Error(`找不到人员「${name}」，请先同步花名册`);
  return id;
}

async function importOne(
  row: ExportProject,
  byName: Map<string, string>,
  customersByName: Map<string, string>,
  contractsByTitle: Map<string, string>
) {
  const customerId = row.customerName
    ? customersByName.get(row.customerName) ?? null
    : null;
  if (row.customerName && !customerId) {
    throw new Error(`找不到客户「${row.customerName}」，无法导入项目「${row.name}」`);
  }

  let contractId: string | null = null;
  if (row.contractTitle) {
    contractId = contractsByTitle.get(row.contractTitle) ?? null;
    if (!contractId) {
      console.warn(`  ! 项目「${row.name}」合同「${row.contractTitle}」未匹配，跳过合同关联`);
    }
  }

  const projectManagerId = row.projectManagerName
    ? await resolveUserId(row.projectManagerName, byName)
    : null;

  const project = await prisma.project.create({
    data: {
      name: row.name,
      status: row.status,
      progressPercent: row.progressPercent,
      plannedStartAt: row.plannedStartAt ? new Date(row.plannedStartAt) : null,
      plannedEndAt: row.plannedEndAt ? new Date(row.plannedEndAt) : null,
      actualStartAt: row.actualStartAt ? new Date(row.actualStartAt) : null,
      actualEndAt: row.actualEndAt ? new Date(row.actualEndAt) : null,
      notes: row.notes,
      customerId,
      contractId,
      projectManagerId,
    },
  });

  for (const m of row.members) {
    const userId = await resolveUserId(m.userName, byName);
    await prisma.projectMember.create({
      data: {
        projectId: project.id,
        userId,
        isProjectManager: m.isProjectManager,
        memberRole: m.memberRole ?? "IMPLEMENTER",
      },
    });
  }

  for (const a of row.allocations) {
    const userId = await resolveUserId(a.userName, byName);
    await prisma.projectStaffAllocation.create({
      data: {
        projectId: project.id,
        userId,
        startDate: new Date(a.startDate),
        endDate: new Date(a.endDate),
        allocationMode: a.allocationMode,
        plannedDays: dec(a.plannedDays),
        splitWeight: dec(a.splitWeight),
        dailyRateSnapshot: new Prisma.Decimal(a.dailyRateSnapshot || "0"),
        notes: a.notes,
      },
    });
  }

  console.log(
    `  + ${row.name} · 成员 ${row.members.length} · 排班 ${row.allocations.length}`
  );
}

async function main() {
  const keepExisting = process.argv.includes("--keep-existing");
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const jsonPath = path.resolve(
    args[0] ?? path.join(process.cwd(), "tmp", "projects-schedule-sync.json")
  );

  const raw = await readFile(jsonPath, "utf8");
  const data = JSON.parse(raw) as ExportFile;
  if (!Array.isArray(data.projects)) throw new Error("JSON 格式无效：缺少 projects");

  console.log(
    `→ 导入 ${data.projects.length} 个项目（导出于 ${data.exportedAt}）${
      keepExisting ? "，保留已有项目" : "，先清空全部项目"
    }…`
  );

  if (!keepExisting) {
    await deleteAllProjects();
  }

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const byName = new Map(users.map((u) => [u.name, u.id]));

  const customers = await prisma.customer.findMany({ select: { id: true, name: true } });
  const customersByName = new Map(customers.map((c) => [c.name, c.id]));

  const contracts = await prisma.contract.findMany({ select: { id: true, title: true } });
  const contractsByTitle = new Map(contracts.map((c) => [c.title, c.id]));

  for (const row of data.projects) {
    await importOne(row, byName, customersByName, contractsByTitle);
  }

  const projectCount = await prisma.project.count();
  const allocCount = await prisma.projectStaffAllocation.count();
  console.log(`\n✓ 完成。当前项目 ${projectCount}，排班 ${allocCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
