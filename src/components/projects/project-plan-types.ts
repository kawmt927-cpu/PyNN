import type { PhaseStatus, ProjectTaskStatus } from "@prisma/client";

export type PlanTask = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectTaskStatus;
  plannedStartAt: Date;
  plannedEndAt: Date;
  progressPercent?: number | null;
  actualCompletedAt: Date | null;
  cancelledNote: string | null;
  sortOrder: number;
  assigneeId: string | null;
  assigneeName: string | null;
};

export type PlanPhase = {
  id: string;
  name: string;
  sortOrder: number;
  progressWeight: number;
  status: PhaseStatus;
  plannedStartAt: Date | null;
  plannedEndAt: Date | null;
  sourceModelPhaseId: string | null;
  tasks: PlanTask[];
};

export type PlanMemo = {
  id: string;
  content: string;
  category: string;
  isRisk: boolean;
  followStatus: string;
  authorName: string;
  createdAt: Date;
  taskLinks: Array<{ taskId: string; taskName: string }>;
};

export type ProjectModelOption = {
  id: string;
  name: string;
  phaseCount: number;
  totalDurationDays: number;
};
