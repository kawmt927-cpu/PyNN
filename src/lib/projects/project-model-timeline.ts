export const PROJECT_START_REF = "PROJECT_START";
export const PROJECT_END_REF = "PROJECT_END";
export const DURATION_REF = "DURATION";

export function phaseStartRef(phaseKey: string) {
  return `PHASE_START:${phaseKey}`;
}

export function phaseEndRef(phaseKey: string) {
  return `PHASE_END:${phaseKey}`;
}

export function nodeRef(nodeKey: string) {
  return `NODE:${nodeKey}`;
}

export type ProjectModelPhaseInput = {
  id?: string;
  key: string;
  name: string;
  sortOrder: number;
  /** 保存时由布局自动计算，编辑时不必填写 */
  progressWeight?: number;
  startRef: string;
  /** 相对参照日的浮动（可正可负） */
  startOffset: number;
  endRef: string;
  endOffset: number;
  durationDays: number | null;
};

export type ProjectModelNodeInput = {
  id?: string;
  key: string;
  name: string;
  sortOrder: number;
  timeRef: string;
  timeOffset: number;
};

export type ProjectModelPhaseLayout = ProjectModelPhaseInput & {
  /** 1-based 含 */
  startDay: number;
  /** 1-based 含 */
  endDay: number;
  barDays: number;
  /** 按工期占比自动计算；无法解析时为 null */
  computedProgressWeight: number | null;
  /** 本阶段的布局错误 */
  errors: string[];
};

export type ProjectModelNodeLayout = ProjectModelNodeInput & {
  /** 1-based，节点所在自然日 */
  day: number;
  /** 本节点的布局错误 */
  errors: string[];
};

export type ProjectModelTimelineResult = {
  totalDays: number;
  phases: ProjectModelPhaseLayout[];
  nodes: ProjectModelNodeLayout[];
  progressWeightSum: number;
  /** 全部错误（兼容）；优先使用各卡片上的 errors */
  errors: string[];
};

type EntityErrors = Map<string, string[]>;

function addEntityError(errors: EntityErrors, entityKey: string, message: string) {
  const list = errors.get(entityKey) ?? [];
  if (!list.includes(message)) list.push(message);
  errors.set(entityKey, list);
}

function clampDay(day: number, total: number): number {
  if (total < 1) return 1;
  return Math.min(Math.max(1, Math.round(day)), total);
}

function naturalDay(day: number): number {
  return Math.max(1, Math.round(day));
}

function recordTimelineOverflow(
  entityErrors: EntityErrors,
  entityKey: string,
  naturalDay: number,
  total: number
) {
  if (naturalDay <= total) return;
  addEntityError(
    entityErrors,
    entityKey,
    `已超过项目总工期（${total} 天），时间线延伸至第 ${naturalDay} 天，请调大上方「项目总工期」`
  );
}

export function isProjectModelTimelineOverflowError(message: string): boolean {
  return message.includes("已超过项目总工期");
}

function parsePhaseRefKey(ref: string): { kind: "start" | "end"; key: string } | null {
  const startMatch = ref.match(/^PHASE_START:(.+)$/);
  if (startMatch) return { kind: "start", key: startMatch[1] };
  const endMatch = ref.match(/^PHASE_END:(.+)$/);
  if (endMatch) return { kind: "end", key: endMatch[1] };
  return null;
}

function parseNodeRefKey(ref: string): string | null {
  const match = ref.match(/^NODE:(.+)$/);
  return match?.[1] ?? null;
}

type PhaseResolveContext = {
  selfKey: string;
  selfKind: "phase" | "node";
  phasesByKey: Map<string, ProjectModelPhaseInput>;
  phasesResolved: Map<string, { startDay: number; endDay: number }>;
  nodesByKey: Map<string, ProjectModelNodeInput>;
  nodesResolved: Map<string, number>;
  total: number;
  entityErrors: EntityErrors;
};

function resolveTimeRefDay(ref: string, ctx: PhaseResolveContext): number | null {
  if (ref === PROJECT_START_REF) return 1;
  if (ref === PROJECT_END_REF) return ctx.total;
  if (ref === DURATION_REF) return null;

  const nodeKey = parseNodeRefKey(ref);
  if (nodeKey) {
    if (nodeKey === ctx.selfKey && ctx.selfKind === "node") {
      addEntityError(ctx.entityErrors, ctx.selfKey, "不能参照自身");
      return null;
    }
    if (!ctx.nodesByKey.has(nodeKey)) {
      addEntityError(ctx.entityErrors, ctx.selfKey, "参照的关键节点不存在或已删除");
      return null;
    }
    const day = ctx.nodesResolved.get(nodeKey);
    return day ?? null;
  }

  const parsed = parsePhaseRefKey(ref);
  if (!parsed) {
    addEntityError(ctx.entityErrors, ctx.selfKey, `无效的时间参照`);
    return null;
  }
  if (parsed.key === ctx.selfKey && ctx.selfKind === "phase") {
    addEntityError(ctx.entityErrors, ctx.selfKey, "不能参照自身");
    return null;
  }
  if (!ctx.phasesByKey.has(parsed.key)) {
    addEntityError(ctx.entityErrors, ctx.selfKey, "参照的阶段不存在或已删除");
    return null;
  }
  const span = ctx.phasesResolved.get(parsed.key);
  if (!span) return null;
  return parsed.kind === "start" ? span.startDay : span.endDay;
}

function layoutPhasesInternal(
  phases: ProjectModelPhaseInput[],
  total: number,
  entityErrors: EntityErrors
): Map<string, { startDay: number; endDay: number }> {
  const byKey = new Map(phases.map((p) => [p.key, p]));
  const resolved = new Map<string, { startDay: number; endDay: number }>();

  function tryResolve(phase: ProjectModelPhaseInput): boolean {
    if (resolved.has(phase.key)) return true;

    const ctx: PhaseResolveContext = {
      selfKey: phase.key,
      selfKind: "phase",
      phasesByKey: byKey,
      phasesResolved: resolved,
      nodesByKey: new Map(),
      nodesResolved: new Map(),
      total,
      entityErrors,
    };

    const startRefDay = resolveTimeRefDay(phase.startRef, ctx);
    if (startRefDay == null && phase.startRef !== DURATION_REF) return false;

    const rawStart = naturalDay((startRefDay ?? 1) + phase.startOffset);
    recordTimelineOverflow(entityErrors, phase.key, rawStart, total);
    const startDay = clampDay(rawStart, total);

    let endDay: number | null = null;
    if (phase.endRef === DURATION_REF) {
      const dur = Math.max(1, Math.floor(phase.durationDays ?? 0) || 0);
      if (dur < 1) {
        addEntityError(entityErrors, phase.key, "结束为固定工期时请填写工期天数");
        return false;
      }
      const rawEnd = rawStart + dur - 1;
      recordTimelineOverflow(entityErrors, phase.key, rawEnd, total);
      endDay = clampDay(rawEnd, total);
    } else {
      const endRefDay = resolveTimeRefDay(phase.endRef, ctx);
      if (endRefDay == null) return false;
      const rawEnd = naturalDay(endRefDay + phase.endOffset);
      recordTimelineOverflow(entityErrors, phase.key, rawEnd, total);
      endDay = clampDay(rawEnd, total);
    }

    if (endDay < startDay) {
      addEntityError(
        entityErrors,
        phase.key,
        `结束早于开始（第 ${startDay}–${endDay} 天），请检查时间参照与浮动`
      );
      endDay = startDay;
    }

    resolved.set(phase.key, { startDay, endDay });
    return true;
  }

  let guard = 0;
  while (resolved.size < phases.length && guard < phases.length + 2) {
    guard += 1;
    let progressed = false;
    for (const phase of phases) {
      if (resolved.has(phase.key)) continue;
      if (tryResolve(phase)) progressed = true;
    }
    if (!progressed) break;
  }

  for (const phase of phases) {
    if (!resolved.has(phase.key)) {
      tryResolve(phase);
      if (!resolved.has(phase.key)) {
        const start = clampDay(phase.startOffset || 1, total);
        const dur = Math.max(1, phase.durationDays ?? 1);
        resolved.set(phase.key, {
          startDay: start,
          endDay: clampDay(start + dur - 1, total),
        });
        addEntityError(
          entityErrors,
          phase.key,
          "依赖无法解析（可能存在循环），已用默认区间"
        );
      }
    }
  }

  return resolved;
}

function layoutNodesInternal(
  nodes: ProjectModelNodeInput[],
  phases: ProjectModelPhaseInput[],
  phasesResolved: Map<string, { startDay: number; endDay: number }>,
  total: number,
  entityErrors: EntityErrors
): Map<string, number> {
  const nodesByKey = new Map(nodes.map((n) => [n.key, n]));
  const resolved = new Map<string, number>();

  function tryResolve(node: ProjectModelNodeInput): boolean {
    if (resolved.has(node.key)) return true;

    const ctx: PhaseResolveContext = {
      selfKey: node.key,
      selfKind: "node",
      phasesByKey: new Map(phases.map((p) => [p.key, p])),
      phasesResolved,
      nodesByKey,
      nodesResolved: resolved,
      total,
      entityErrors,
    };

    const refDay = resolveTimeRefDay(node.timeRef, ctx);
    if (refDay == null) return false;

    const rawDay = naturalDay(refDay + node.timeOffset);
    recordTimelineOverflow(entityErrors, node.key, rawDay, total);
    resolved.set(node.key, clampDay(rawDay, total));
    return true;
  }

  let guard = 0;
  while (resolved.size < nodes.length && guard < nodes.length + 2) {
    guard += 1;
    let progressed = false;
    for (const node of nodes) {
      if (resolved.has(node.key)) continue;
      if (tryResolve(node)) progressed = true;
    }
    if (!progressed) break;
  }

  for (const node of nodes) {
    if (!resolved.has(node.key)) {
      tryResolve(node);
      if (!resolved.has(node.key)) {
        resolved.set(node.key, clampDay(1 + node.timeOffset, total));
        addEntityError(
          entityErrors,
          node.key,
          "依赖无法解析（可能存在循环），已用默认时间"
        );
      }
    }
  }

  return resolved;
}

function flattenEntityErrors(
  entityErrors: EntityErrors,
  phases: ProjectModelPhaseInput[],
  nodes: ProjectModelNodeInput[]
): string[] {
  const keys = [...phases.map((p) => p.key), ...nodes.map((n) => n.key)];
  const messages: string[] = [];
  for (const key of keys) {
    const list = entityErrors.get(key);
    if (!list?.length) continue;
    const item = phases.find((p) => p.key === key) ?? nodes.find((n) => n.key === key);
    const prefix = item ? `「${item.name}」` : "";
    for (const msg of list) {
      messages.push(prefix ? `${prefix}${msg}` : msg);
    }
  }
  return messages;
}

/**
 * 解析阶段起止与关键节点时间点。
 * 天数均为相对项目开始的第 N 个自然日（1-based，含首尾）。
 */
export function layoutProjectModelTimeline(
  phases: ProjectModelPhaseInput[],
  nodes: ProjectModelNodeInput[],
  totalDurationDays: number
): ProjectModelTimelineResult {
  const total = Math.max(1, Math.floor(totalDurationDays) || 1);
  const entityErrors: EntityErrors = new Map();

  const phasesResolved = layoutPhasesInternal(phases, total, entityErrors);
  const nodesResolved = layoutNodesInternal(nodes, phases, phasesResolved, total, entityErrors);

  const phaseLayouts: ProjectModelPhaseLayout[] = [...phases]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"))
    .map((phase) => {
      const span = phasesResolved.get(phase.key)!;
      const barDays = span.endDay - span.startDay + 1;
      const errors = entityErrors.get(phase.key) ?? [];
      const computedProgressWeight =
        errors.length > 0 ? null : Math.max(0, Math.round((barDays / total) * 100));

      return {
        ...phase,
        startDay: span.startDay,
        endDay: span.endDay,
        barDays,
        computedProgressWeight,
        progressWeight: computedProgressWeight ?? 0,
        errors,
      };
    });

  const nodeLayouts: ProjectModelNodeLayout[] = [...nodes]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"))
    .map((node) => ({
      ...node,
      day: nodesResolved.get(node.key) ?? 1,
      errors: entityErrors.get(node.key) ?? [],
    }));

  const progressWeightSum = phaseLayouts.reduce(
    (sum, p) => sum + (p.computedProgressWeight ?? 0),
    0
  );

  return {
    totalDays: total,
    phases: phaseLayouts,
    nodes: nodeLayouts,
    progressWeightSum,
    errors: flattenEntityErrors(entityErrors, phases, nodes),
  };
}

export function hasProjectModelTimelineOverflow(
  phases: ProjectModelPhaseInput[],
  nodes: ProjectModelNodeInput[],
  totalDurationDays: number
): boolean {
  const layout = layoutProjectModelTimeline(phases, nodes, totalDurationDays);
  return (
    layout.phases.some((p) => p.errors.some(isProjectModelTimelineOverflowError)) ||
    layout.nodes.some((n) => n.errors.some(isProjectModelTimelineOverflowError))
  );
}

function normalizeModelEntityName(name: string): string {
  return name.trim();
}

/** 按 entity key 收集名称重复错误（阶段之间、节点之间、阶段与节点之间均不可重名） */
export function collectProjectModelNameErrors(
  phases: Pick<ProjectModelPhaseInput, "key" | "name">[],
  nodes: Pick<ProjectModelNodeInput, "key" | "name">[]
): Map<string, string[]> {
  const byName = new Map<string, Array<{ key: string; kind: "phase" | "node" }>>();

  for (const phase of phases) {
    const normalized = normalizeModelEntityName(phase.name);
    if (!normalized) continue;
    const list = byName.get(normalized) ?? [];
    list.push({ key: phase.key, kind: "phase" });
    byName.set(normalized, list);
  }
  for (const node of nodes) {
    const normalized = normalizeModelEntityName(node.name);
    if (!normalized) continue;
    const list = byName.get(normalized) ?? [];
    list.push({ key: node.key, kind: "node" });
    byName.set(normalized, list);
  }

  const result = new Map<string, string[]>();
  const duplicateMessage = (displayName: string, kind: "phase" | "node") =>
    kind === "phase"
      ? `阶段名称「${displayName}」重复（阶段与节点均不可同名）`
      : `节点名称「${displayName}」重复（阶段与节点均不可同名）`;

  for (const [normalized, entities] of byName) {
    if (entities.length <= 1) continue;
    for (const entity of entities) {
      const list = result.get(entity.key) ?? [];
      const message = duplicateMessage(normalized, entity.kind);
      if (!list.includes(message)) list.push(message);
      result.set(entity.key, list);
    }
  }

  return result;
}

export function hasProjectModelNameErrors(
  phases: Pick<ProjectModelPhaseInput, "key" | "name">[],
  nodes: Pick<ProjectModelNodeInput, "key" | "name">[]
): boolean {
  return collectProjectModelNameErrors(phases, nodes).size > 0;
}

/** @deprecated 使用 layoutProjectModelTimeline */
export function layoutProjectModelPhases(
  phases: ProjectModelPhaseInput[],
  totalDurationDays: number
): ProjectModelTimelineResult {
  return layoutProjectModelTimeline(phases, [], totalDurationDays);
}
