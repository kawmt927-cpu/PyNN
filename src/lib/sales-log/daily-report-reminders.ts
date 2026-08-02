import { SalesDailyLogStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DAILY_REPORT_DEADLINE_HOUR,
  getDailyReportDeadline,
  isDailyReportSubmitted,
} from "@/lib/sales-log/daily-report-submission";
import { getTodayLogDate } from "@/lib/sales-log/daily-log";
import { ensureUnsubmittedDailyReportPlaceholder } from "@/lib/sales-log/unsubmitted-daily-report";

export const DAILY_REPORT_REMIND_SLOTS = ["20", "21", "late"] as const;
export type DailyReportRemindSlot = (typeof DAILY_REPORT_REMIND_SLOTS)[number];

const SALES_DAILY_REPORT_ROLES: UserRole[] = ["SALES", "SALES_MANAGER"];

/** 补录入口：企微消息用手机端日报页（OAuth 深链） */
export function dailyReportMakeupPath() {
  return "/mobile/log";
}

export function dailyReportMakeupDesktopPath() {
  return "/today-work/daily-log";
}

export function isDailyReportRemindSlot(value: string): value is DailyReportRemindSlot {
  return (DAILY_REPORT_REMIND_SLOTS as readonly string[]).includes(value);
}

/** 按当前本地钟点推断应跑的档位（供手动/漏跑补调） */
export function inferDailyReportRemindSlot(now = new Date()): DailyReportRemindSlot | null {
  const hour = now.getHours();
  if (hour === 20) return "20";
  if (hour === 21) return "21";
  if (hour >= DAILY_REPORT_DEADLINE_HOUR) return "late";
  return null;
}

async function listDailyReportReminderRecipients() {
  return prisma.user.findMany({
    where: {
      role: { in: SALES_DAILY_REPORT_ROLES },
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true, name: true, role: true },
  });
}

async function ensureLogForRemind(userId: string, logDate: Date) {
  return prisma.salesDailyLog.upsert({
    where: { userId_logDate: { userId, logDate } },
    create: {
      userId,
      logDate,
      conversation: [],
      status: SalesDailyLogStatus.IN_PROGRESS,
    },
    update: {},
    select: {
      id: true,
      status: true,
      submittedAt: true,
      remind20SentAt: true,
      remind21SentAt: true,
      lateMarkedAt: true,
    },
  });
}

async function notifyDailyReportReminder(input: {
  userId: string;
  slot: DailyReportRemindSlot;
  logId: string;
}) {
  const makeupPath = dailyReportMakeupPath();
  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );

  if (input.slot === "late") {
    await createAppNotification({
      type: NOTIFICATION_TYPES.DAILY_REPORT_LATE,
      title: "已生成「未提交日报」",
      body: `今日日报截止时间为 ${DAILY_REPORT_DEADLINE_HOUR}:00，现已超时，系统已生成「未提交日报」。\n可稍后补录；补录后显示为迟交，不改变已锁定的迟交统计。`,
      linkHref: dailyReportMakeupDesktopPath(),
      recipientUserIds: [input.userId],
      pushWeCom: false,
      meta: {
        slot: "late",
        dailyLogId: input.logId,
        makeupPath,
      },
    });
    const { pushWeComTextCardToCrmUsers } = await import("@/lib/wecom/notify");
    await pushWeComTextCardToCrmUsers({
      crmUserIds: [input.userId],
      title: "已生成「未提交日报」",
      description: `截止 ${DAILY_REPORT_DEADLINE_HOUR}:00 已过。可点击补录；补录后为迟交，不影响统计。`,
      // pushWeComTextCard 内部会再包 wecomAutoLoginUrl，这里只传业务路径
      url: makeupPath,
      btnText: "去补录",
      fields: [
        { keyname: "截止", value: `当日 ${DAILY_REPORT_DEADLINE_HOUR}:00` },
        { keyname: "说明", value: "补录不影响迟交统计" },
      ],
    });
    return;
  }

  const hourLabel = input.slot === "20" ? "20:00" : "21:00";
  await createAppNotification({
    type: NOTIFICATION_TYPES.DAILY_REPORT_REMIND,
    title: `请及时填写今日日报（${hourLabel} 提醒）`,
    body: `今日日报须在 ${DAILY_REPORT_DEADLINE_HOUR}:00 前提交。当前尚未提交，请尽快填写。`,
    linkHref: dailyReportMakeupDesktopPath(),
    recipientUserIds: [input.userId],
    pushWeCom: false,
    meta: {
      slot: input.slot,
      dailyLogId: input.logId,
      makeupPath,
    },
  });

  const { pushWeComTextCardToCrmUsers } = await import("@/lib/wecom/notify");
  await pushWeComTextCardToCrmUsers({
    crmUserIds: [input.userId],
    title: `日报提醒（${hourLabel}）`,
    description: `请在今日 ${DAILY_REPORT_DEADLINE_HOUR}:00 前完成日报。点击打开填写页。`,
    url: makeupPath,
    btnText: "去填写",
    fields: [
      { keyname: "提醒", value: hourLabel },
      { keyname: "截止", value: `当日 ${DAILY_REPORT_DEADLINE_HOUR}:00` },
    ],
  });
}

export type DailyReportRemindRunResult = {
  slot: DailyReportRemindSlot;
  logDate: string;
  scanned: number;
  notified: number;
  skippedSubmitted: number;
  skippedAlreadySent: number;
  errors: string[];
};

/**
 * 跑一档日报催交/迟交任务。
 * - 20 / 21：未提交则企微+站内提醒（各档只发一次）
 * - late：未提交则生成「未提交日报」并锁定迟交，通知可补录
 */
export async function runDailyReportRemindJob(
  slot: DailyReportRemindSlot,
  now = new Date()
): Promise<DailyReportRemindRunResult> {
  const logDate = getTodayLogDate(now);
  const result: DailyReportRemindRunResult = {
    slot,
    logDate: logDate.toISOString(),
    scanned: 0,
    notified: 0,
    skippedSubmitted: 0,
    skippedAlreadySent: 0,
    errors: [],
  };

  if (slot === "late") {
    const deadline = getDailyReportDeadline(logDate);
    if (now.getTime() < deadline.getTime()) {
      result.errors.push(`未到截止时间 ${DAILY_REPORT_DEADLINE_HOUR}:00，跳过迟交锁定`);
      return result;
    }
  }

  const users = await listDailyReportReminderRecipients();
  result.scanned = users.length;

  for (const user of users) {
    try {
      if (slot === "late") {
        const before = await prisma.salesDailyLog.findUnique({
          where: { userId_logDate: { userId: user.id, logDate } },
          select: { status: true, lateMarkedAt: true },
        });
        if (before && isDailyReportSubmitted(before.status)) {
          result.skippedSubmitted += 1;
          continue;
        }
        const alreadyMarked = Boolean(before?.lateMarkedAt);
        const log = await ensureUnsubmittedDailyReportPlaceholder({
          userId: user.id,
          logDate,
          now,
        });
        if (!log) {
          result.skippedSubmitted += 1;
          continue;
        }
        if (alreadyMarked) {
          result.skippedAlreadySent += 1;
          continue;
        }
        await notifyDailyReportReminder({ userId: user.id, slot: "late", logId: log.id });
        result.notified += 1;
        continue;
      }

      const log = await ensureLogForRemind(user.id, logDate);
      if (isDailyReportSubmitted(log.status)) {
        result.skippedSubmitted += 1;
        continue;
      }

      if (slot === "20") {
        if (log.remind20SentAt) {
          result.skippedAlreadySent += 1;
          continue;
        }
        await notifyDailyReportReminder({ userId: user.id, slot, logId: log.id });
        await prisma.salesDailyLog.update({
          where: { id: log.id },
          data: { remind20SentAt: now },
        });
        result.notified += 1;
        continue;
      }

      if (slot === "21") {
        if (log.remind21SentAt) {
          result.skippedAlreadySent += 1;
          continue;
        }
        await notifyDailyReportReminder({ userId: user.id, slot, logId: log.id });
        await prisma.salesDailyLog.update({
          where: { id: log.id },
          data: { remind21SentAt: now },
        });
        result.notified += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${user.name}(${user.id}): ${message}`);
      console.error("[daily-report-remind]", user.id, error);
    }
  }

  return result;
}
