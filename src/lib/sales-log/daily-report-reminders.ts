import { SalesDailyLogStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DAILY_REPORT_DEADLINE_HOUR,
  getDailyReportDeadline,
  isDailyReportSubmitted,
} from "@/lib/sales-log/daily-report-submission";
import { getTodayLogDate } from "@/lib/sales-log/daily-log";
import {
  ensureCompanyCalendarCache,
  isDailyReportRequiredDay,
  isDailyReportRequiredForUser,
} from "@/lib/calendar/cn-daily-report-days";
import { ensureUnsubmittedDailyReportPlaceholder } from "@/lib/sales-log/unsubmitted-daily-report";
import { ALL_ROLES } from "@/lib/rbac/permission-keys";
import { hasPermission, hasPermissionSync } from "@/lib/rbac/has-permission";

export const DAILY_REPORT_REMIND_SLOTS = ["20", "21", "late"] as const;
export type DailyReportRemindSlot = (typeof DAILY_REPORT_REMIND_SLOTS)[number];

async function listDailyReportRequiredRoles(): Promise<UserRole[]> {
  const roles: UserRole[] = [];
  for (const role of ALL_ROLES) {
    if (await hasPermission(role, "daily_reports.required")) roles.push(role);
  }
  return roles;
}

/** 补录入口：企微消息用手机端日报页（OAuth 深链） */
export function dailyReportMakeupPath() {
  return "/mobile/log";
}

export function dailyReportMakeupDesktopPath() {
  return "/today-work/daily-log";
}

/** 企微/站内跳转带 remindNid：进入填写页即记站内催交通知已读 */
export function dailyReportMakeupPathWithRemind(notificationId: string) {
  return `${dailyReportMakeupPath()}?remindNid=${encodeURIComponent(notificationId)}`;
}

export function dailyReportMakeupDesktopPathWithRemind(notificationId: string) {
  return `${dailyReportMakeupDesktopPath()}?remindNid=${encodeURIComponent(notificationId)}`;
}

/**
 * 从企微卡片 / 深链进入日报页时，将对应催交通知标为已读。
 * （企微无已读 API；以「点击进 CRM」为已读依据）
 */
export async function markDailyReportRemindOpenedByClick(input: {
  userId: string;
  notificationId: string;
}) {
  const nid = input.notificationId.trim();
  if (!nid) return false;

  const { NOTIFICATION_TYPES } = await import("@/lib/notifications/app-notifications");
  const notification = await prisma.appNotification.findFirst({
    where: {
      id: nid,
      type: {
        in: [
          NOTIFICATION_TYPES.DAILY_REPORT_REMIND,
          NOTIFICATION_TYPES.DAILY_REPORT_LATE,
        ],
      },
      receipts: { some: { userId: input.userId } },
    },
    select: { id: true },
  });
  if (!notification) return false;

  await prisma.appNotificationReceipt.updateMany({
    where: {
      notificationId: nid,
      userId: input.userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  return true;
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

export type RemindReadLabel = "已读" | "未读" | "未发送";

export type DailyReportRemindReadStatus = {
  remind20: RemindReadLabel;
  remind21: RemindReadLabel;
  remind20SentAt: Date | null;
  remind21SentAt: Date | null;
};

async function readLabelForNotification(
  notificationId: string | null | undefined,
  recipientUserId: string
): Promise<RemindReadLabel> {
  if (!notificationId) return "未发送";
  const receipt = await prisma.appNotificationReceipt.findUnique({
    where: {
      notificationId_userId: {
        notificationId,
        userId: recipientUserId,
      },
    },
    select: { readAt: true },
  });
  if (!receipt) return "未发送";
  return receipt.readAt ? "已读" : "未读";
}

/** 查询销售对 20/21 点站内催交通知的已读情况（企微应用消息无已读 API） */
export async function getDailyReportRemindReadStatus(input: {
  userId: string;
  logId?: string | null;
  remind20SentAt?: Date | null;
  remind21SentAt?: Date | null;
  remind20NotificationId?: string | null;
  remind21NotificationId?: string | null;
}): Promise<DailyReportRemindReadStatus> {
  let remind20SentAt = input.remind20SentAt ?? null;
  let remind21SentAt = input.remind21SentAt ?? null;
  let remind20NotificationId = input.remind20NotificationId ?? null;
  let remind21NotificationId = input.remind21NotificationId ?? null;

  if (
    input.logId &&
    (input.remind20NotificationId === undefined ||
      input.remind21NotificationId === undefined ||
      input.remind20SentAt === undefined ||
      input.remind21SentAt === undefined)
  ) {
    const log = await prisma.salesDailyLog.findUnique({
      where: { id: input.logId },
      select: {
        remind20SentAt: true,
        remind21SentAt: true,
        remind20NotificationId: true,
        remind21NotificationId: true,
      },
    });
    if (log) {
      if (input.remind20SentAt === undefined) remind20SentAt = log.remind20SentAt;
      if (input.remind21SentAt === undefined) remind21SentAt = log.remind21SentAt;
      if (input.remind20NotificationId === undefined) {
        remind20NotificationId = log.remind20NotificationId;
      }
      if (input.remind21NotificationId === undefined) {
        remind21NotificationId = log.remind21NotificationId;
      }
    }
  }

  const [remind20Raw, remind21Raw] = await Promise.all([
    readLabelForNotification(remind20NotificationId, input.userId),
    readLabelForNotification(remind21NotificationId, input.userId),
  ]);

  // 已发送但尚未关联通知 id（历史数据）：按「未读」保守展示
  const coerce = (
    sentAt: Date | null,
    notificationId: string | null,
    label: RemindReadLabel
  ): RemindReadLabel => {
    if (!sentAt && !notificationId) return "未发送";
    if (sentAt && !notificationId && label === "未发送") return "未读";
    return label;
  };

  return {
    remind20: coerce(remind20SentAt, remind20NotificationId, remind20Raw),
    remind21: coerce(remind21SentAt, remind21NotificationId, remind21Raw),
    remind20SentAt,
    remind21SentAt,
  };
}

function formatRemindReadSummary(status: DailyReportRemindReadStatus) {
  return `20:00 提醒：${status.remind20}；21:00 提醒：${status.remind21}`;
}

async function listDailyReportReminderRecipients() {
  const roles = await listDailyReportRequiredRoles();
  if (roles.length === 0) return [];
  return prisma.user.findMany({
    where: {
      role: { in: roles },
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true, name: true, role: true },
  });
}

async function listLateEscalateRecipientIds(excludeUserId: string) {
  const users = await prisma.user.findMany({
    where: {
      role: { in: ["SALES_MANAGER", "ADMIN"] },
      id: { not: excludeUserId },
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
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
      remind20NotificationId: true,
      remind21NotificationId: true,
      lateMarkedAt: true,
    },
  });
}

async function notifyDailyReportReminder(input: {
  userId: string;
  slot: DailyReportRemindSlot;
  logId: string;
}): Promise<string | null> {
  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );

  if (input.slot === "late") {
    const notification = await createAppNotification({
      type: NOTIFICATION_TYPES.DAILY_REPORT_LATE,
      title: "已生成「未提交日报」",
      body: `今日日报截止时间为 ${DAILY_REPORT_DEADLINE_HOUR}:00，现已超时，系统已生成「未提交日报」。\n可稍后补录；补录后显示为迟交，不改变已锁定的迟交统计。`,
      linkHref: dailyReportMakeupDesktopPath(),
      recipientUserIds: [input.userId],
      pushWeCom: false,
      meta: {
        slot: "late",
        dailyLogId: input.logId,
        makeupPath: dailyReportMakeupPath(),
      },
    });
    const nid = notification?.id ?? null;
    const mobileUrl = nid
      ? dailyReportMakeupPathWithRemind(nid)
      : dailyReportMakeupPath();
    if (nid) {
      await prisma.appNotification.update({
        where: { id: nid },
        data: { linkHref: dailyReportMakeupDesktopPathWithRemind(nid) },
      });
    }
    const { pushWeComTextCardToCrmUsers } = await import("@/lib/wecom/notify");
    await pushWeComTextCardToCrmUsers({
      crmUserIds: [input.userId],
      title: "已生成「未提交日报」",
      description: `截止 ${DAILY_REPORT_DEADLINE_HOUR}:00 已过。可点击补录；补录后为迟交，不影响统计。`,
      url: mobileUrl,
      btnText: "去补录",
      fields: [
        { keyname: "截止", value: `当日 ${DAILY_REPORT_DEADLINE_HOUR}:00` },
        { keyname: "说明", value: "补录不影响迟交统计" },
      ],
    });
    return nid;
  }

  const hourLabel = input.slot === "20" ? "20:00" : "21:00";
  const notification = await createAppNotification({
    type: NOTIFICATION_TYPES.DAILY_REPORT_REMIND,
    title: `请及时填写今日日报（${hourLabel} 提醒）`,
    body: `今日日报须在 ${DAILY_REPORT_DEADLINE_HOUR}:00 前提交。当前尚未提交，请尽快填写。`,
    linkHref: dailyReportMakeupDesktopPath(),
    recipientUserIds: [input.userId],
    pushWeCom: false,
    meta: {
      slot: input.slot,
      dailyLogId: input.logId,
      makeupPath: dailyReportMakeupPath(),
    },
  });

  const nid = notification?.id ?? null;
  const mobileUrl = nid
    ? dailyReportMakeupPathWithRemind(nid)
    : dailyReportMakeupPath();
  if (nid) {
    await prisma.appNotification.update({
      where: { id: nid },
      data: { linkHref: dailyReportMakeupDesktopPathWithRemind(nid) },
    });
  }

  const { pushWeComTextCardToCrmUsers } = await import("@/lib/wecom/notify");
  await pushWeComTextCardToCrmUsers({
    crmUserIds: [input.userId],
    title: `日报提醒（${hourLabel}）`,
    description: `请在今日 ${DAILY_REPORT_DEADLINE_HOUR}:00 前完成日报。点击打开填写页。`,
    url: mobileUrl,
    btnText: "去填写",
    fields: [
      { keyname: "提醒", value: hourLabel },
      { keyname: "截止", value: `当日 ${DAILY_REPORT_DEADLINE_HOUR}:00` },
    ],
  });

  return nid;
}

/** 22:00 未交：上报销管 + 管理员（含前置催交通知已读情况） */
async function notifyManagersDailyReportLate(input: {
  salesUserId: string;
  salesName: string;
  logId: string;
  readStatus: DailyReportRemindReadStatus;
}) {
  const recipientUserIds = await listLateEscalateRecipientIds(input.salesUserId);
  if (recipientUserIds.length === 0) return;

  const readSummary = formatRemindReadSummary(input.readStatus);
  const title = `${input.salesName} 日报逾期未交`;
  const body = `${input.salesName} 的今日日报截至 ${DAILY_REPORT_DEADLINE_HOUR}:00 仍未提交。\n前置催交站内通知：${readSummary}。\n（已读含：打开 CRM 通知，或点击企微卡片进入填写页。）`;

  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );
  await createAppNotification({
    type: NOTIFICATION_TYPES.DAILY_REPORT_LATE,
    title,
    body,
    linkHref: "/today-work",
    recipientUserIds,
    pushWeCom: false,
    meta: {
      slot: "late_escalate",
      dailyLogId: input.logId,
      salesUserId: input.salesUserId,
      remind20: input.readStatus.remind20,
      remind21: input.readStatus.remind21,
    },
  });

  const { pushWeComTextCardToCrmUsers } = await import("@/lib/wecom/notify");
  await pushWeComTextCardToCrmUsers({
    crmUserIds: recipientUserIds,
    title,
    description: `${input.salesName} 至 ${DAILY_REPORT_DEADLINE_HOUR}:00 未交日报。${readSummary}`,
    url: "/mobile/inbox",
    btnText: "查看通知",
    fields: [
      { keyname: "销售", value: input.salesName },
      { keyname: "20:00 提醒", value: input.readStatus.remind20 },
      { keyname: "21:00 提醒", value: input.readStatus.remind21 },
    ],
  });
}

export type DailyReportRemindRunResult = {
  slot: DailyReportRemindSlot;
  logDate: string;
  scanned: number;
  notified: number;
  escalated: number;
  skippedSubmitted: number;
  skippedAlreadySent: number;
  errors: string[];
};

/**
 * 跑一档日报催交/迟交任务。
 * - 20 / 21：未提交则企微+站内提醒（各档只发一次）
 * - late：未提交则生成「未提交日报」并锁定迟交；另通知销管/管理员（含前置提醒已读）
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
    escalated: 0,
    skippedSubmitted: 0,
    skippedAlreadySent: 0,
    errors: [],
  };

  await ensureCompanyCalendarCache();
  // 顺带清理历史误生成的非考核日占位
  const { purgeInvalidUnsubmittedDailyReportPlaceholders } = await import(
    "@/lib/sales-log/unsubmitted-daily-report"
  );
  await purgeInvalidUnsubmittedDailyReportPlaceholders();

  if (!isDailyReportRequiredDay(logDate)) {
    result.errors.push("周末或法定放假日不催交/不锁定迟交");
    return result;
  }

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
      if (!(await isDailyReportRequiredForUser(user.id, logDate))) {
        result.skippedSubmitted += 1;
        continue;
      }

      if (slot === "late") {
        const before = await prisma.salesDailyLog.findUnique({
          where: { userId_logDate: { userId: user.id, logDate } },
          select: {
            status: true,
            lateMarkedAt: true,
            remind20SentAt: true,
            remind21SentAt: true,
            remind20NotificationId: true,
            remind21NotificationId: true,
          },
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

        // 纳入日报考核的人逾期才上报销管/管理员
        if (hasPermissionSync(user.role, "daily_reports.required")) {
          const readStatus = await getDailyReportRemindReadStatus({
            userId: user.id,
            logId: log.id,
            remind20SentAt: before?.remind20SentAt ?? log.remind20SentAt,
            remind21SentAt: before?.remind21SentAt ?? log.remind21SentAt,
            remind20NotificationId:
              before?.remind20NotificationId ?? log.remind20NotificationId,
            remind21NotificationId:
              before?.remind21NotificationId ?? log.remind21NotificationId,
          });
          await notifyManagersDailyReportLate({
            salesUserId: user.id,
            salesName: user.name,
            logId: log.id,
            readStatus,
          });
          result.escalated += 1;
        }
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
        const notificationId = await notifyDailyReportReminder({
          userId: user.id,
          slot,
          logId: log.id,
        });
        await prisma.salesDailyLog.update({
          where: { id: log.id },
          data: {
            remind20SentAt: now,
            ...(notificationId ? { remind20NotificationId: notificationId } : {}),
          },
        });
        result.notified += 1;
        continue;
      }

      if (slot === "21") {
        if (log.remind21SentAt) {
          result.skippedAlreadySent += 1;
          continue;
        }
        const notificationId = await notifyDailyReportReminder({
          userId: user.id,
          slot,
          logId: log.id,
        });
        await prisma.salesDailyLog.update({
          where: { id: log.id },
          data: {
            remind21SentAt: now,
            ...(notificationId ? { remind21NotificationId: notificationId } : {}),
          },
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
