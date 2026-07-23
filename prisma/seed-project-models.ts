/**
 * 恢复项目模型种子数据（可重复执行）
 * 用法: npm run db:seed:project-models
 */
import { PrismaClient } from "@prisma/client";
import { layoutProjectModelTimeline } from "../src/lib/projects/project-model-timeline";

const prisma = new PrismaClient();

const MODEL_ID = "seed-project-model-standard";

const SEED_PHASES = [
  {
    id: "seed-phase-kickoff",
    name: "项目启动",
    sortOrder: 1,
    startRef: "PROJECT_START",
    startOffset: 0,
    endRef: "DURATION",
    endOffset: 0,
    durationDays: 5,
  },
  {
    id: "seed-phase-survey",
    name: "需求调研",
    sortOrder: 2,
    startRef: "PHASE_END:seed-phase-kickoff",
    startOffset: 1,
    endRef: "DURATION",
    endOffset: 0,
    durationDays: 10,
  },
  {
    id: "seed-phase-deploy",
    name: "系统部署",
    sortOrder: 3,
    startRef: "PHASE_END:seed-phase-survey",
    startOffset: 1,
    endRef: "DURATION",
    endOffset: 0,
    durationDays: 15,
  },
  {
    id: "seed-phase-migrate",
    name: "数据迁移",
    sortOrder: 3,
    startRef: "PHASE_END:seed-phase-survey",
    startOffset: 1,
    endRef: "DURATION",
    endOffset: 0,
    durationDays: 10,
  },
  {
    id: "seed-phase-train",
    name: "用户培训",
    sortOrder: 4,
    startRef: "PHASE_END:seed-phase-deploy",
    startOffset: 1,
    endRef: "DURATION",
    endOffset: 0,
    durationDays: 5,
  },
  {
    id: "seed-phase-accept",
    name: "项目验收",
    sortOrder: 5,
    startRef: "PHASE_END:seed-phase-train",
    startOffset: 1,
    endRef: "DURATION",
    endOffset: 0,
    durationDays: 5,
  },
] as const;

const SEED_TASKS = [
  { id: "seed-task-kickoff-1", phaseId: "seed-phase-kickoff", name: "任务 1", sortOrder: 1, durationDays: 1 },
  { id: "seed-task-kickoff-2", phaseId: "seed-phase-kickoff", name: "任务 2", sortOrder: 2, durationDays: 1 },
  { id: "seed-task-kickoff-3", phaseId: "seed-phase-kickoff", name: "任务 3", sortOrder: 3, durationDays: 3 },
] as const;

async function main() {
  await prisma.projectModel.upsert({
    where: { id: MODEL_ID },
    update: {
      name: "标准实施模型",
      description: "含并行部署与迁移的标准软件实施阶段",
      enabled: true,
      totalDurationDays: 45,
    },
    create: {
      id: MODEL_ID,
      name: "标准实施模型",
      description: "含并行部署与迁移的标准软件实施阶段",
      enabled: true,
      totalDurationDays: 45,
    },
  });

  const layoutInput = SEED_PHASES.map((p) => ({
    key: p.id,
    name: p.name,
    sortOrder: p.sortOrder,
    startRef: p.startRef,
    startOffset: p.startOffset,
    endRef: p.endRef,
    endOffset: p.endOffset,
    durationDays: p.durationDays,
  }));

  const layout = layoutProjectModelTimeline(layoutInput, [], 45);
  const weightByKey = new Map(layout.phases.map((p) => [p.key, p.computedProgressWeight ?? 0]));

  for (const phase of SEED_PHASES) {
    await prisma.projectModelPhase.upsert({
      where: { id: phase.id },
      update: {
        modelId: MODEL_ID,
        name: phase.name,
        sortOrder: phase.sortOrder,
        startRef: phase.startRef,
        startOffset: phase.startOffset,
        endRef: phase.endRef,
        endOffset: phase.endOffset,
        durationDays: phase.durationDays,
        progressWeight: weightByKey.get(phase.id) ?? 0,
      },
      create: {
        id: phase.id,
        modelId: MODEL_ID,
        name: phase.name,
        sortOrder: phase.sortOrder,
        startRef: phase.startRef,
        startOffset: phase.startOffset,
        endRef: phase.endRef,
        endOffset: phase.endOffset,
        durationDays: phase.durationDays,
        progressWeight: weightByKey.get(phase.id) ?? 0,
      },
    });
  }

  for (const task of SEED_TASKS) {
    await prisma.projectModelTask.upsert({
      where: { id: task.id },
      update: {
        phaseId: task.phaseId,
        name: task.name,
        sortOrder: task.sortOrder,
        durationDays: task.durationDays,
      },
      create: {
        id: task.id,
        phaseId: task.phaseId,
        name: task.name,
        sortOrder: task.sortOrder,
        durationDays: task.durationDays,
      },
    });
  }

  await prisma.projectModelNode.upsert({
    where: { id: "seed-node-final-acceptance" },
    update: {
      modelId: MODEL_ID,
      name: "最终验收",
      sortOrder: 1,
      timeRef: "PROJECT_END",
      timeOffset: 0,
    },
    create: {
      id: "seed-node-final-acceptance",
      modelId: MODEL_ID,
      name: "最终验收",
      sortOrder: 1,
      timeRef: "PROJECT_END",
      timeOffset: 0,
    },
  });

  const models = await prisma.projectModel.findMany({
    include: { _count: { select: { phases: true, nodes: true } } },
    orderBy: { name: "asc" },
  });

  console.log("已恢复项目模型种子数据:");
  for (const m of models) {
    console.log(`  - ${m.name}（${m._count.phases} 阶段，${m._count.nodes} 节点）`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
