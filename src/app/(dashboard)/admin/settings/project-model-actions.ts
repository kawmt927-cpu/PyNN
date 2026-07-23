"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import {
  DURATION_REF,
  layoutProjectModelTimeline,
  PROJECT_END_REF,
  PROJECT_START_REF,
  collectProjectModelNameErrors,
  isProjectModelTimelineOverflowError,
} from "@/lib/projects/project-model-timeline";

const TIME_REF = z
  .string()
  .refine(
    (v) =>
      v === PROJECT_START_REF ||
      v === PROJECT_END_REF ||
      v === DURATION_REF ||
      /^PHASE_(START|END):.+$/.test(v) ||
      /^NODE:.+$/.test(v),
    "时间参照无效"
  );

const modelSchema = z.object({
  name: z.string().trim().min(1, "请输入模型名称"),
  description: z.string().optional(),
  totalDurationDays: z.coerce.number().int().min(1).optional(),
});

const phaseSchema = z
  .object({
    id: z.string().optional(),
    key: z.string().min(1),
    name: z.string().trim().min(1, "阶段名称不能为空"),
    sortOrder: z.coerce.number().int().min(0),
    startRef: TIME_REF,
    startOffset: z.coerce.number().int(),
    endRef: TIME_REF,
    endOffset: z.coerce.number().int(),
    durationDays: z.number().int().min(1).nullable().optional(),
  })
  .superRefine((phase, ctx) => {
    if (phase.endRef === DURATION_REF && (phase.durationDays == null || phase.durationDays < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `「${phase.name}」结束为固定工期时请填写工期天数`,
        path: ["durationDays"],
      });
    }
  });

function formatError(error: unknown): ActionResult {
  if (error instanceof z.ZodError) {
    return { error: error.errors[0]?.message ?? "校验失败" };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "操作失败" };
}

async function requireProjectModelAccess() {
  return requireRole(["PROJECT_ADMIN", "ADMIN"]);
}

export async function createProjectModel(formData: FormData): Promise<ActionResult> {
  try {
    await requireProjectModelAccess();
    const parsed = modelSchema.parse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      totalDurationDays: formData.get("totalDurationDays") || 40,
    });

    const created = await prisma.projectModel.create({
      data: {
        name: parsed.name,
        description: parsed.description?.trim() || null,
        totalDurationDays: parsed.totalDurationDays ?? 40,
      },
    });

    revalidatePath("/admin/settings");
    return { modelId: created.id };
  } catch (error) {
    return formatError(error);
  }
}

export async function updateProjectModel(formData: FormData): Promise<ActionResult> {
  try {
    await requireProjectModelAccess();
    const id = formData.get("id")?.toString();
    if (!id) return { error: "缺少模型 ID" };

    const parsed = modelSchema.parse({
      name: formData.get("name"),
      description: formData.get("description") || undefined,
      totalDurationDays: formData.get("totalDurationDays") || undefined,
    });

    const existing = await prisma.projectModel.findUnique({ where: { id } });
    if (!existing) {
      return { error: "项目模型不存在或已被删除，请返回列表重新打开或新建模型后再保存" };
    }

    await prisma.projectModel.update({
      where: { id },
      data: {
        name: parsed.name,
        description: parsed.description?.trim() || null,
        enabled: formData.get("enabled") === "on",
        ...(parsed.totalDurationDays != null
          ? { totalDurationDays: parsed.totalDurationDays }
          : {}),
      },
    });

    revalidatePath("/admin/settings");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

export async function deleteProjectModel(id: string): Promise<ActionResult> {
  try {
    await requireProjectModelAccess();
    await prisma.projectModel.delete({ where: { id } });
    revalidatePath("/admin/settings");
    return {};
  } catch (error) {
    return formatError(error);
  }
}

function nextCopiedModelName(sourceName: string, existingNames: string[]): string {
  const trimmed = sourceName.trim();
  const numbered = trimmed.match(/^(.*) (\d+)$/);
  const base = numbered ? numbered[1] : trimmed;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?: (\\d+))?$`);
  let maxSlot = 1;
  for (const name of existingNames) {
    const match = name.trim().match(pattern);
    if (!match) continue;
    const slot = match[1] ? Number.parseInt(match[1], 10) : 1;
    maxSlot = Math.max(maxSlot, slot);
  }
  return `${base} ${maxSlot + 1}`;
}

function remapTimeRef(ref: string, idMap: Map<string, string>): string {
  const phaseMatch = ref.match(/^(PHASE_(?:START|END):)(.+)$/);
  if (phaseMatch) {
    const nextId = idMap.get(phaseMatch[2]);
    return nextId ? `${phaseMatch[1]}${nextId}` : ref;
  }
  const nodeMatch = ref.match(/^(NODE:)(.+)$/);
  if (nodeMatch) {
    const nextId = idMap.get(nodeMatch[2]);
    return nextId ? `${nodeMatch[1]}${nextId}` : ref;
  }
  return ref;
}

export async function copyProjectModel(id: string): Promise<ActionResult> {
  try {
    await requireProjectModelAccess();
    const source = await prisma.projectModel.findUnique({
      where: { id },
      include: {
        phases: {
          include: { tasks: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
        nodes: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!source) return { error: "项目模型不存在或已被删除" };

    const existingNames = (
      await prisma.projectModel.findMany({ select: { name: true } })
    ).map((row) => row.name);
    const copyName = nextCopiedModelName(source.name, existingNames);

    const created = await prisma.$transaction(async (tx) => {
      const model = await tx.projectModel.create({
        data: {
          name: copyName,
          description: source.description,
          enabled: source.enabled,
          totalDurationDays: source.totalDurationDays,
        },
      });

      const idMap = new Map<string, string>();
      for (const phase of source.phases) {
        const createdPhase = await tx.projectModelPhase.create({
          data: {
            modelId: model.id,
            name: phase.name,
            sortOrder: phase.sortOrder,
            progressWeight: phase.progressWeight,
            startRef: phase.startRef,
            startOffset: phase.startOffset,
            endRef: phase.endRef,
            endOffset: phase.endOffset,
            durationDays: phase.durationDays,
          },
        });
        idMap.set(phase.id, createdPhase.id);

        if (phase.tasks.length > 0) {
          await tx.projectModelTask.createMany({
            data: phase.tasks.map((task) => ({
              phaseId: createdPhase.id,
              name: task.name,
              sortOrder: task.sortOrder,
              durationDays: task.durationDays,
            })),
          });
        }
      }

      for (const node of source.nodes) {
        const createdNode = await tx.projectModelNode.create({
          data: {
            modelId: model.id,
            name: node.name,
            sortOrder: node.sortOrder,
            timeRef: node.timeRef,
            timeOffset: node.timeOffset,
          },
        });
        idMap.set(node.id, createdNode.id);
      }

      for (const phase of source.phases) {
        const newPhaseId = idMap.get(phase.id);
        if (!newPhaseId) continue;
        await tx.projectModelPhase.update({
          where: { id: newPhaseId },
          data: {
            startRef: remapTimeRef(phase.startRef, idMap),
            endRef: remapTimeRef(phase.endRef, idMap),
          },
        });
      }

      for (const node of source.nodes) {
        const newNodeId = idMap.get(node.id);
        if (!newNodeId) continue;
        await tx.projectModelNode.update({
          where: { id: newNodeId },
          data: { timeRef: remapTimeRef(node.timeRef, idMap) },
        });
      }

      return model;
    });

    revalidatePath("/admin/settings");
    return { modelId: created.id };
  } catch (error) {
    return formatError(error);
  }
}

export type ProjectModelPhaseSaveInput = {
  id?: string;
  key: string;
  name: string;
  sortOrder: number;
  startRef: string;
  startOffset: number;
  endRef: string;
  endOffset: number;
  durationDays: number | null;
  tasks?: ProjectModelTaskSaveInput[];
};

export type ProjectModelTaskSaveInput = {
  id?: string;
  key: string;
  name: string;
  sortOrder: number;
  durationDays: number;
};

export type ProjectModelNodeSaveInput = {
  id?: string;
  key: string;
  name: string;
  sortOrder: number;
  timeRef: string;
  timeOffset: number;
};

const taskSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1),
  name: z.string().trim().min(1, "任务名称不能为空"),
  sortOrder: z.coerce.number().int().min(0),
  durationDays: z.coerce.number().int().min(1),
});

const nodeSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(1),
  name: z.string().trim().min(1, "节点名称不能为空"),
  sortOrder: z.coerce.number().int().min(0),
  timeRef: TIME_REF,
  timeOffset: z.coerce.number().int(),
});

export async function saveProjectModelPhases(input: {
  modelId: string;
  totalDurationDays: number;
  phases: ProjectModelPhaseSaveInput[];
  nodes?: ProjectModelNodeSaveInput[];
}): Promise<ActionResult & { progressWeightSum?: number; layoutErrors?: string[] }> {
  try {
    await requireProjectModelAccess();
    const model = await prisma.projectModel.findUnique({ where: { id: input.modelId } });
    if (!model) return { error: "项目模型不存在" };

    const totalDurationDays = Math.max(1, Math.floor(input.totalDurationDays) || 1);
    const parsedPhases = input.phases.map((phase) => ({
      ...phaseSchema.parse({
        ...phase,
        durationDays: phase.durationDays ?? null,
      }),
      tasks: phase.tasks ?? [],
    }));
    const parsedNodes = (input.nodes ?? []).map((node) => nodeSchema.parse(node));

    const nameErrors = collectProjectModelNameErrors(parsedPhases, parsedNodes);
    if (nameErrors.size > 0) {
      const firstMessage = [...nameErrors.values()][0]?.[0];
      return { error: firstMessage ?? "阶段或节点名称重复" };
    }

    const layout = layoutProjectModelTimeline(
      parsedPhases.map((p) => ({
        key: p.key,
        id: p.id,
        name: p.name,
        sortOrder: p.sortOrder,
        startRef: p.startRef,
        startOffset: p.startOffset,
        endRef: p.endRef,
        endOffset: p.endOffset,
        durationDays: p.durationDays ?? null,
      })),
      parsedNodes.map((n) => ({
        key: n.key,
        id: n.id,
        name: n.name,
        sortOrder: n.sortOrder,
        timeRef: n.timeRef,
        timeOffset: n.timeOffset,
      })),
      totalDurationDays
    );

    for (const phase of layout.phases) {
      const overflow = phase.errors.find(isProjectModelTimelineOverflowError);
      if (overflow) {
        return { error: `阶段「${phase.name}」${overflow}` };
      }
    }
    for (const node of layout.nodes) {
      const overflow = node.errors.find(isProjectModelTimelineOverflowError);
      if (overflow) {
        return { error: `节点「${node.name}」${overflow}` };
      }
    }

    const layoutByKey = new Map(layout.phases.map((p) => [p.key, p]));

    await prisma.$transaction(async (tx) => {
      await tx.projectModel.update({
        where: { id: input.modelId },
        data: { totalDurationDays },
      });

      const existingPhases = await tx.projectModelPhase.findMany({
        where: { modelId: input.modelId },
        select: { id: true },
      });
      const keepPhaseIds = new Set(parsedPhases.map((p) => p.id).filter(Boolean) as string[]);
      const deletePhaseIds = existingPhases
        .map((row) => row.id)
        .filter((id) => !keepPhaseIds.has(id));
      if (deletePhaseIds.length > 0) {
        await tx.projectModelPhase.deleteMany({ where: { id: { in: deletePhaseIds } } });
      }

      for (const phase of parsedPhases) {
        const laid = layoutByKey.get(phase.key);
        const data = {
          name: phase.name,
          sortOrder: phase.sortOrder,
          progressWeight: laid?.computedProgressWeight ?? 0,
          startRef: phase.startRef,
          startOffset: phase.startOffset,
          endRef: phase.endRef,
          endOffset: phase.endOffset,
          durationDays: phase.endRef === DURATION_REF ? phase.durationDays : phase.durationDays,
        };
        let phaseId = phase.id;
        if (phase.id) {
          const existingPhase = await tx.projectModelPhase.findUnique({
            where: { id: phase.id },
            select: { id: true, modelId: true },
          });
          if (existingPhase && existingPhase.modelId === input.modelId) {
            await tx.projectModelPhase.update({ where: { id: phase.id }, data });
          } else {
            const created = await tx.projectModelPhase.create({
              data: { id: phase.id, modelId: input.modelId, ...data },
            });
            phaseId = created.id;
          }
        } else {
          const created = await tx.projectModelPhase.create({
            data: { modelId: input.modelId, ...data },
          });
          phaseId = created.id;
        }

        if (!phaseId) continue;

        const parsedTasks = (phase.tasks ?? []).map((task) => taskSchema.parse(task));
        const existingTasks = await tx.projectModelTask.findMany({
          where: { phaseId },
          select: { id: true },
        });
        const keepTaskIds = new Set(parsedTasks.map((t) => t.id).filter(Boolean) as string[]);
        const deleteTaskIds = existingTasks
          .map((row) => row.id)
          .filter((id) => !keepTaskIds.has(id));
        if (deleteTaskIds.length > 0) {
          await tx.projectModelTask.deleteMany({ where: { id: { in: deleteTaskIds } } });
        }

        for (const task of parsedTasks) {
          const taskData = {
            name: task.name,
            sortOrder: task.sortOrder,
            durationDays: task.durationDays,
          };
          if (task.id) {
            const existingTask = await tx.projectModelTask.findUnique({
              where: { id: task.id },
              select: { id: true, phaseId: true },
            });
            if (existingTask && existingTask.phaseId === phaseId) {
              await tx.projectModelTask.update({ where: { id: task.id }, data: taskData });
            } else {
              await tx.projectModelTask.create({
                data: { id: task.id, phaseId, ...taskData },
              });
            }
          } else {
            await tx.projectModelTask.create({
              data: { phaseId, ...taskData },
            });
          }
        }
      }

      const existingNodes = await tx.projectModelNode.findMany({
        where: { modelId: input.modelId },
        select: { id: true },
      });
      const keepNodeIds = new Set(parsedNodes.map((n) => n.id).filter(Boolean) as string[]);
      const deleteNodeIds = existingNodes
        .map((row) => row.id)
        .filter((id) => !keepNodeIds.has(id));
      if (deleteNodeIds.length > 0) {
        await tx.projectModelNode.deleteMany({ where: { id: { in: deleteNodeIds } } });
      }

      for (const node of parsedNodes) {
        const data = {
          name: node.name,
          sortOrder: node.sortOrder,
          timeRef: node.timeRef,
          timeOffset: node.timeOffset,
        };
        if (node.id) {
          const existingNode = await tx.projectModelNode.findUnique({
            where: { id: node.id },
            select: { id: true, modelId: true },
          });
          if (existingNode && existingNode.modelId === input.modelId) {
            await tx.projectModelNode.update({ where: { id: node.id }, data });
          } else {
            await tx.projectModelNode.create({
              data: { id: node.id, modelId: input.modelId, ...data },
            });
          }
        } else {
          await tx.projectModelNode.create({
            data: { modelId: input.modelId, ...data },
          });
        }
      }
    });

    revalidatePath("/admin/settings");
    revalidatePath("/projects");
    return {
      progressWeightSum: layout.progressWeightSum,
      layoutErrors: layout.errors,
    };
  } catch (error) {
    return formatError(error);
  }
}
