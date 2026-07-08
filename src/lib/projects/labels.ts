import { AllocationMode, PersonnelType, PhaseStatus, ProjectStatus } from "@prisma/client";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PENDING_START: "待启动",
  IMPLEMENTING: "实施中",
  ACCEPTED: "已验收",
  MAINTAINING: "维保中",
  CLOSED: "已关闭",
};

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  BLOCKED: "阻塞",
};

export const PERSONNEL_TYPE_LABELS: Record<PersonnelType, string> = {
  PROJECT_MANAGER: "项目经理",
  CONSULTANT: "顾问",
  IMPLEMENTER: "实施",
  DEVELOPER: "开发",
};

export const ALLOCATION_MODE_LABELS: Record<AllocationMode, string> = {
  AUTO: "自动",
  MANUAL: "手动",
};
