/** 团队动态展示用纯函数/类型（可给客户端组件引用，勿引入 Prisma / Node API） */

export type TeamWorkActivityKind =
  | "check_in"
  | "follow_up"
  | "daily_log"
  | "customer_create"
  | "opportunity_create";

export type TeamWorkActivityItem = {
  id: string;
  kind: TeamWorkActivityKind;
  at: Date;
  dayKey: string;
  userId: string;
  userName: string;
  title: string;
  subtitle: string;
  detail: string | null;
  customerId: string | null;
  customerName: string | null;
  /** 商机创建：跳转商机详情 */
  opportunityId?: string | null;
  meta: string | null;
  logSubmitted?: boolean;
  /** 已提交或未提交但已逾期/锁定 → 迟交 */
  logLate?: boolean;
  /** 未提交可补录 */
  logPendingMakeup?: boolean;
  /** 补录跳转（PC） */
  makeupHref?: string | null;
  /** 补录跳转（手机） */
  makeupMobileHref?: string | null;
  /** 日报合并的自动定位文案 */
  locationLabel?: string | null;
  /** 带风险提交 */
  riskFlag?: boolean;
  riskNotes?: string | null;
  /** 往来方式文案 */
  methodLabel?: string | null;
  /** 联系人姓名 */
  contactNames?: string[];
  /** 下次跟进 */
  nextFollowUpAt?: Date | null;
  nextFollowUpMethodLabel?: string | null;
  nextFollowUpContent?: string | null;
  result?: string | null;
  /** 与往来同时生成的打卡（合并展示） */
  checkInId?: string | null;
  checkInLocation?: string | null;
  checkInStatusLabel?: string | null;
};

export const dailyLogStatusLabel: Record<string, string> = {
  IN_PROGRESS: "进行中",
  PENDING_CONFIRM: "待确认",
  SUBMITTED: "已提交",
  RISK_SUBMITTED: "已提交（有风险）",
};

export function kindLabel(kind: TeamWorkActivityKind) {
  if (kind === "check_in") return "打卡";
  if (kind === "follow_up") return "往来";
  if (kind === "customer_create") return "新建客户";
  if (kind === "opportunity_create") return "新建商机";
  return "日报";
}
