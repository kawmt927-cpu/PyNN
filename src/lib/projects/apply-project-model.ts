import { addCalendarDays, countCalendarDays, toDateOnly } from "@/lib/projects/workdays";
import {
  layoutProjectModelTimeline,
  type ProjectModelPhaseInput,
} from "@/lib/projects/project-model-timeline";

export type ScaledPhasePlan = {
  sourceModelPhaseId: string;
  name: string;
  sortOrder: number;
  progressWeight: number;
  plannedStartAt: Date;
  plannedEndAt: Date;
  startDay: number;
  endDay: number;
  barDays: number;
};

/**
 * 将模板阶段等比例映射到项目计划窗口。
 * - scale = T_project / T_model
 * - 日序 round 后夹紧；单阶段至少 1 天
 * - 末阶段吸收差额，贴齐项目计划起止
 */
export function scaleProjectModelPhasesToWindow(input: {
  modelPhases: ProjectModelPhaseInput[];
  modelTotalDays: number;
  projectStart: Date;
  projectEnd: Date;
}): ScaledPhasePlan[] {
  const projectStart = toDateOnly(input.projectStart);
  const projectEnd = toDateOnly(input.projectEnd);
  const T_project = countCalendarDays(projectStart, projectEnd);
  if (T_project < 1) {
    throw new Error("项目计划结束日必须不早于计划开始日");
  }

  const T_model = Math.max(1, Math.floor(input.modelTotalDays) || 1);
  const layout = layoutProjectModelTimeline(input.modelPhases, [], T_model);
  if (layout.phases.length === 0) {
    throw new Error("该模型尚无阶段");
  }

  const scale = T_project / T_model;

  type Raw = {
    sourceModelPhaseId: string;
    name: string;
    sortOrder: number;
    startDay: number;
    endDay: number;
  };

  const raw: Raw[] = layout.phases.map((phase) => {
    let startDay = Math.round(phase.startDay * scale);
    let endDay = Math.round(phase.endDay * scale);
    startDay = Math.min(Math.max(1, startDay), T_project);
    endDay = Math.min(Math.max(1, endDay), T_project);
    if (endDay < startDay) endDay = startDay;
    return {
      sourceModelPhaseId: phase.id ?? phase.key,
      name: phase.name,
      sortOrder: phase.sortOrder,
      startDay,
      endDay,
    };
  });

  // 首阶段贴齐第 1 天，末阶段贴齐总工期
  raw[0].startDay = 1;
  raw[raw.length - 1].endDay = T_project;

  // 按 sortOrder 保证相邻阶段不倒挂（串行时尽量衔接）
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].startDay < raw[i - 1].startDay) {
      raw[i].startDay = raw[i - 1].startDay;
    }
    if (raw[i].endDay < raw[i].startDay) {
      raw[i].endDay = raw[i].startDay;
    }
  }
  raw[raw.length - 1].endDay = T_project;

  const withDays = raw.map((phase) => ({
    ...phase,
    barDays: phase.endDay - phase.startDay + 1,
  }));

  const totalBar = withDays.reduce((sum, p) => sum + p.barDays, 0) || 1;
  let weightSum = 0;
  const scaled: ScaledPhasePlan[] = withDays.map((phase, index) => {
    const isLast = index === withDays.length - 1;
    const progressWeight = isLast
      ? Math.max(0, 100 - weightSum)
      : Math.max(0, Math.round((phase.barDays / totalBar) * 100));
    if (!isLast) weightSum += progressWeight;
    return {
      sourceModelPhaseId: phase.sourceModelPhaseId,
      name: phase.name,
      sortOrder: phase.sortOrder,
      progressWeight,
      startDay: phase.startDay,
      endDay: phase.endDay,
      barDays: phase.barDays,
      plannedStartAt: addCalendarDays(projectStart, phase.startDay),
      plannedEndAt: addCalendarDays(projectStart, phase.endDay),
    };
  });

  return scaled;
}

/** 按阶段计划工期重算权重并归一到 100 */
export function recomputePhaseWeightsByDuration(
  phases: Array<{ id: string; plannedStartAt: Date | null; plannedEndAt: Date | null }>
): Map<string, number> {
  const days = phases.map((phase) => {
    if (!phase.plannedStartAt || !phase.plannedEndAt) {
      return { id: phase.id, barDays: 0 };
    }
    return {
      id: phase.id,
      barDays: Math.max(0, countCalendarDays(phase.plannedStartAt, phase.plannedEndAt)),
    };
  });
  const total = days.reduce((sum, row) => sum + row.barDays, 0);
  const result = new Map<string, number>();
  if (total <= 0) {
    const even = phases.length > 0 ? Math.floor(100 / phases.length) : 0;
    let used = 0;
    phases.forEach((phase, index) => {
      const weight = index === phases.length - 1 ? Math.max(0, 100 - used) : even;
      used += weight;
      result.set(phase.id, weight);
    });
    return result;
  }

  let used = 0;
  days.forEach((row, index) => {
    const isLast = index === days.length - 1;
    const weight = isLast
      ? Math.max(0, 100 - used)
      : Math.max(0, Math.round((row.barDays / total) * 100));
    if (!isLast) used += weight;
    result.set(row.id, weight);
  });
  return result;
}
