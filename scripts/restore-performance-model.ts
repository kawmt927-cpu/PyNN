/**
 * 从浏览器内存导出的数据恢复「绩效考核系统-标准型」
 * 用法: npx tsx scripts/restore-performance-model.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { layoutProjectModelTimeline } from "../src/lib/projects/project-model-timeline";

const prisma = new PrismaClient();

const MODEL_ID = "cmrjcwgh700008lmmj2yklzrl";
const MODEL_NAME = "绩效考核系统-标准型";
const MODEL_DESC = "标准版的绩效考核系统包含了全套的咨询方案和软件上线";
const TOTAL_DAYS = 270;

type Task = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  durationDays: number;
};

type Phase = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  startRef: string;
  startOffset: number;
  endRef: string;
  endOffset: number;
  durationDays: number | null;
  tasks: Task[];
};

type Node = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  timeRef: string;
  timeOffset: number;
};

async function main() {
  const phases = JSON.parse(
    readFileSync(resolve(__dirname, "../tmp-restored-phases.json"), "utf8")
  ) as Phase[];
  const nodes = JSON.parse(
    readFileSync(resolve(__dirname, "../tmp-restored-nodes.json"), "utf8")
  ) as Node[];

  const layout = layoutProjectModelTimeline(
    phases.map((p) => ({
      key: p.key,
      name: p.name,
      sortOrder: p.sortOrder,
      startRef: p.startRef,
      startOffset: p.startOffset,
      endRef: p.endRef,
      endOffset: p.endOffset,
      durationDays: p.durationDays,
    })),
    nodes.map((n) => ({
      key: n.key,
      name: n.name,
      sortOrder: n.sortOrder,
      timeRef: n.timeRef,
      timeOffset: n.timeOffset,
    })),
    TOTAL_DAYS
  );
  const weightByKey = new Map(
    layout.phases.map((p) => [p.key, p.computedProgressWeight ?? 0])
  );

  await prisma.$transaction(async (tx) => {
    await tx.projectModel.upsert({
      where: { id: MODEL_ID },
      update: {
        name: MODEL_NAME,
        description: MODEL_DESC,
        enabled: true,
        totalDurationDays: TOTAL_DAYS,
      },
      create: {
        id: MODEL_ID,
        name: MODEL_NAME,
        description: MODEL_DESC,
        enabled: true,
        totalDurationDays: TOTAL_DAYS,
      },
    });

    for (const phase of phases) {
      await tx.projectModelPhase.upsert({
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
          progressWeight: weightByKey.get(phase.key) ?? 0,
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
          progressWeight: weightByKey.get(phase.key) ?? 0,
        },
      });

      for (const task of phase.tasks) {
        await tx.projectModelTask.upsert({
          where: { id: task.id },
          update: {
            phaseId: phase.id,
            name: task.name,
            sortOrder: task.sortOrder,
            durationDays: task.durationDays,
          },
          create: {
            id: task.id,
            phaseId: phase.id,
            name: task.name,
            sortOrder: task.sortOrder,
            durationDays: task.durationDays,
          },
        });
      }
    }

    for (const node of nodes) {
      await tx.projectModelNode.upsert({
        where: { id: node.id },
        update: {
          modelId: MODEL_ID,
          name: node.name,
          sortOrder: node.sortOrder,
          timeRef: node.timeRef,
          timeOffset: node.timeOffset,
        },
        create: {
          id: node.id,
          modelId: MODEL_ID,
          name: node.name,
          sortOrder: node.sortOrder,
          timeRef: node.timeRef,
          timeOffset: node.timeOffset,
        },
      });
    }
  });

  const saved = await prisma.projectModel.findUnique({
    where: { id: MODEL_ID },
    include: {
      phases: { include: { tasks: true } },
      nodes: true,
    },
  });

  console.log("已恢复:");
  console.log(`  ${saved?.name}（${saved?.phases.length} 阶段，${saved?.nodes.length} 节点）`);
  console.log(
    `  任务合计: ${saved?.phases.reduce((n, p) => n + p.tasks.length, 0)}`
  );
  for (const p of saved?.phases ?? []) {
    console.log(`  - ${p.name}: ${p.tasks.length} 任务`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
