import { AllocationMode, PersonnelType, PhaseStatus, ProjectStatus, ProjectTaskStatus } from "@prisma/client";

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

export const PROJECT_TASK_STATUS_LABELS: Record<ProjectTaskStatus, string> = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  TESTING: "测试中",
  WAITING: "等待中",
  PAUSED: "已暂停",
  COMPLETED: "已完成",
};

/** 甘特条颜色 */
export const PROJECT_TASK_STATUS_BAR_CLASS: Record<ProjectTaskStatus, string> = {
  COMPLETED: "bg-slate-400 text-white",
  IN_PROGRESS: "bg-teal-400 text-white",
  TESTING: "bg-violet-500 text-white",
  WAITING: "bg-sky-500 text-white",
  PAUSED: "bg-amber-500 text-white",
  NOT_STARTED: "bg-blue-500 text-white",
};

/** 表格/图例状态胶囊 */
export const PROJECT_TASK_STATUS_BADGE_CLASS: Record<ProjectTaskStatus, string> = {
  COMPLETED: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
  IN_PROGRESS: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
  TESTING: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  WAITING: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  PAUSED: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  NOT_STARTED: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
};

/** 进度条填充色（与甘特一致） */
export const PROJECT_TASK_PROGRESS_FILL_CLASS: Record<ProjectTaskStatus, string> = {
  COMPLETED: "bg-slate-400",
  IN_PROGRESS: "bg-teal-400",
  TESTING: "bg-violet-500",
  WAITING: "bg-sky-500",
  PAUSED: "bg-amber-500",
  NOT_STARTED: "bg-blue-500",
};

export const PROJECT_MEMO_CATEGORY_LABELS: Record<string, string> = {
  FEEDBACK: "反馈",
  MEETING: "会议纪要",
  OTHER: "其它",
};

/** 备忘分类色：对齐稿 2 标签风格 */
export const PROJECT_MEMO_CATEGORY_BADGE_CLASS: Record<string, string> = {
  FEEDBACK: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  MEETING: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  OTHER: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300",
};

export const PROJECT_MEMO_RISK_BADGE_CLASS =
  "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300";

export const PROJECT_MEMO_FOLLOW_STATUS_LABELS: Record<string, string> = {
  OPEN: "待跟进",
  DONE: "已闭环",
};

export const PROJECT_MEMO_FOLLOW_STATUS_BADGE_CLASS: Record<string, string> = {
  OPEN: "bg-amber-500 text-white",
  DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
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
