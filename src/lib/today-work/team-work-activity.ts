import { format, startOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkInStatusLabel } from "@/lib/sales-log/check-in";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { isAutoDailyLogCheckIn } from "@/lib/sales-log/auto-log-check-in";
import {
  getDailyReportDeadline,
  isDailyReportCountedAsLate,
  isDailyReportSubmitted,
} from "@/lib/sales-log/daily-report-submission";
import {
  dailyReportMakeupDesktopPath,
  dailyReportMakeupPath,
} from "@/lib/sales-log/daily-report-reminders";
import { ensureCompanyCalendarCache, isDailyReportRequiredDay } from "@/lib/calendar/cn-daily-report-days";
import {
  ensureUnsubmittedDailyReportsForUsers,
  isUnsubmittedDailyReportPlaceholder,
  purgeInvalidUnsubmittedDailyReportPlaceholders,
  UNSUBMITTED_DAILY_REPORT_BODY,
} from "@/lib/sales-log/unsubmitted-daily-report";
import {
  TEAM_ACTIVITY_OTHER_FILTER,
  TEAM_ACTIVITY_OTHER_ROLES,
  type TeamActivityUserFilter,
} from "@/lib/today-work/activity-view-scope";
import { teamPerformanceMemberWhere } from "@/lib/sales/team-performance";
import { ENTITY_TYPES } from "@/lib/audit/entity-operation-log";
import {
  dailyLogStatusLabel,
  type TeamWorkActivityItem,
  type TeamWorkActivityKind,
} from "@/lib/today-work/team-work-activity-shared";
import { hasPermissionSync, preloadRolePermissions } from "@/lib/rbac/has-permission";
import { ALL_ROLES } from "@/lib/rbac/permission-keys";

export type { TeamWorkActivityItem, TeamWorkActivityKind };
export { dailyLogStatusLabel, kindLabel } from "@/lib/today-work/team-work-activity-shared";

export type TeamWorkDayGroup = {
  dayKey: string;
  dayLabel: string;
  items: TeamWorkActivityItem[];
  stats: {
    checkIns: number;
    followUps: number;
    logsSubmitted: number;
  };
};

function dayKeyOf(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function dayLabelOf(dayKey: string) {
  const date = new Date(`${dayKey}T12:00:00`);
  return format(date, "M月d日 EEEE", { locale: zhCN });
}

function parseDayKeyLocal(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function eachDayKeysInRange(start: Date, end: Date): string[] {
  const keys: string[] = [];
  for (let day = startOfDay(start); day < end; day.setDate(day.getDate() + 1)) {
    keys.push(dayKeyOf(day));
  }
  return keys;
}

/** 该日志日是否已过日报截止（可展示未提交/迟交） */
export {
  isDailyReportDayPastDeadline,
  missingDailyLogActivityId,
} from "@/lib/sales-log/daily-report-submission";

export type TeamActivityMember = {
  id: string;
  name: string;
  role: UserRole;
};

/** 可出现在团队工作记录中的账号：参与团队业绩的销售功能人员 */
export async function listTeamActivityMembers(): Promise<TeamActivityMember[]> {
  return prisma.user.findMany({
    where: teamPerformanceMemberWhere(),
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

export async function listTeamSalesMembers() {
  for (const role of ALL_ROLES) {
    await preloadRolePermissions(role);
  }
  const members = await listTeamActivityMembers();
  return members
    .filter((u) => hasPermissionSync(u.role, "daily_reports.required"))
    .map(({ id, name }) => ({ id, name }));
}

export async function listTeamWorkActivity(options: {
  start: Date;
  end: Date;
  /** null=全员；other=销售管理+管理员；string=指定用户 */
  filter?: TeamActivityUserFilter;
  now?: Date;
}): Promise<TeamWorkActivityItem[]> {
  const now = options.now ?? new Date();
  const members = await listTeamActivityMembers();
  const filter = options.filter ?? null;

  let scopedMembers: TeamActivityMember[];
  if (filter === TEAM_ACTIVITY_OTHER_FILTER) {
    scopedMembers = members.filter((u) => TEAM_ACTIVITY_OTHER_ROLES.includes(u.role));
  } else if (typeof filter === "string") {
    scopedMembers = members.filter((u) => u.id === filter);
  } else {
    scopedMembers = members;
  }

  const userIds = scopedMembers.map((u) => u.id);
  if (userIds.length === 0) return [];

  const dayKeys = eachDayKeysInRange(options.start, options.end);
  const rangeDates = dayKeys.map(parseDayKeyLocal);
  // 超时未交：仅纳入日报考核的角色；区间内非考核日顺带清理误生成占位
  for (const role of ALL_ROLES) {
    await preloadRolePermissions(role);
  }
  const ensureUserIds = scopedMembers
    .filter((m) => hasPermissionSync(m.role, "daily_reports.required"))
    .map((m) => m.id);
  if (ensureUserIds.length > 0 && rangeDates.length > 0) {
    await ensureCompanyCalendarCache();
    await purgeInvalidUnsubmittedDailyReportPlaceholders();
    await ensureUnsubmittedDailyReportsForUsers({
      userIds: ensureUserIds,
      logDates: rangeDates,
      now,
    });
  }

  const [checkIns, followUps, dailyLogs, createLogs] = await Promise.all([
    prisma.salesCheckIn.findMany({
      where: {
        userId: { in: userIds },
        checkedInAt: { gte: options.start, lt: options.end },
      },
      orderBy: { checkedInAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        contact: { select: { name: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.followUp.findMany({
      where: {
        userId: { in: userIds },
        followUpAt: { gte: options.start, lt: options.end },
        weeklyAssignment: null,
      },
      orderBy: { followUpAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        contact: { select: { name: true } },
        linkedContacts: { include: { contact: { select: { name: true } } } },
        opportunity: { select: { title: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.salesDailyLog.findMany({
      where: {
        userId: { in: userIds },
        logDate: { gte: options.start, lt: options.end },
      },
      orderBy: [{ logDate: "desc" }, { updatedAt: "desc" }],
      include: {
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.entityOperationLog.findMany({
      where: {
        userId: { in: userIds },
        action: "创建",
        entityType: { in: [ENTITY_TYPES.CUSTOMER, ENTITY_TYPES.OPPORTUNITY] },
        createdAt: { gte: options.start, lt: options.end },
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  const customerCreateIds = createLogs
    .filter((row) => row.entityType === ENTITY_TYPES.CUSTOMER)
    .map((row) => row.entityId);
  const opportunityCreateIds = createLogs
    .filter((row) => row.entityType === ENTITY_TYPES.OPPORTUNITY)
    .map((row) => row.entityId);

  const [createdCustomers, createdOpportunities] = await Promise.all([
    customerCreateIds.length > 0
      ? prisma.customer.findMany({
          where: { id: { in: customerCreateIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    opportunityCreateIds.length > 0
      ? prisma.opportunity.findMany({
          where: { id: { in: opportunityCreateIds } },
          select: {
            id: true,
            title: true,
            customerId: true,
            customer: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve(
          [] as {
            id: string;
            title: string;
            customerId: string | null;
            customer: { id: string; name: string } | null;
          }[]
        ),
  ]);

  const customerNameById = new Map(createdCustomers.map((c) => [c.id, c.name]));
  const opportunityById = new Map(createdOpportunities.map((o) => [o.id, o]));

  const meaningfulDailyLogs = dailyLogs.filter((row) => {
    if (isDailyReportSubmitted(row.status)) return true;
    if (isUnsubmittedDailyReportPlaceholder(row)) {
      // 非考核日占位不进入团队动态（清理前的兜底）
      return isDailyReportRequiredDay(row.logDate);
    }
    return Boolean(row.dailyReport?.trim());
  });

  const autoCheckInsByLogId = new Map<string, (typeof checkIns)[number]>();
  const autoCheckInsByUserDay = new Map<string, (typeof checkIns)[number]>();
  for (const row of checkIns) {
    if (!isAutoDailyLogCheckIn(row)) continue;
    if (row.salesDailyLogId) {
      const prev = autoCheckInsByLogId.get(row.salesDailyLogId);
      if (!prev || row.checkedInAt > prev.checkedInAt) {
        autoCheckInsByLogId.set(row.salesDailyLogId, row);
      }
    }
    const key = `${row.userId}:${dayKeyOf(row.checkedInAt)}`;
    const prev = autoCheckInsByUserDay.get(key);
    if (!prev || row.checkedInAt > prev.checkedInAt) {
      autoCheckInsByUserDay.set(key, row);
    }
  }

  const standaloneCheckIns = checkIns.filter((row) => !isAutoDailyLogCheckIn(row));
  const followUpIds = new Set(followUps.map((row) => row.id));
  const checkInByFollowUpId = new Map<string, (typeof standaloneCheckIns)[number]>();
  for (const row of standaloneCheckIns) {
    if (row.followUpId && followUpIds.has(row.followUpId)) {
      checkInByFollowUpId.set(row.followUpId, row);
    }
  }
  const mergedCheckInIds = new Set(
    [...checkInByFollowUpId.values()].map((row) => row.id)
  );

  const items: TeamWorkActivityItem[] = [
    ...standaloneCheckIns
      .filter((row) => !mergedCheckInIds.has(row.id))
      .map((row) => {
        const at = row.checkedInAt;
        return {
          id: row.id,
          kind: "check_in" as const,
          at,
          dayKey: dayKeyOf(at),
          userId: row.user.id,
          userName: row.user.name,
          title: row.customer?.name ?? "无客户打卡",
          subtitle: row.contact?.name ? `联系人：${row.contact.name}` : checkInStatusLabel(row),
          detail: formatCheckInLocation(row),
          customerId: row.customer?.id ?? null,
          customerName: row.customer?.name ?? null,
          meta: checkInStatusLabel(row),
          contactNames: row.contact?.name ? [row.contact.name] : [],
        };
      }),
    ...followUps.map((row) => {
      const at = row.followUpAt;
      const method = salesLogMethodLabel(row.method);
      const contactNames = [
        ...new Set(
          [
            ...(row.linkedContacts?.map((lc) => lc.contact.name) ?? []),
            row.contact?.name,
          ].filter((name): name is string => Boolean(name?.trim()))
        ),
      ];
      const linkedCheckIn = checkInByFollowUpId.get(row.id) ?? null;
      const subtitle = contactNames.length > 0 ? `${method} · ${contactNames.join("、")}` : method;
      return {
        id: row.id,
        kind: "follow_up" as const,
        at,
        dayKey: dayKeyOf(at),
        userId: row.user.id,
        userName: row.user.name,
        title: row.customer.name,
        subtitle,
        detail: row.content,
        customerId: row.customer.id,
        customerName: row.customer.name,
        meta: row.opportunity?.title ? `商机：${row.opportunity.title}` : null,
        methodLabel: method,
        contactNames,
        nextFollowUpAt: row.nextFollowUpAt,
        nextFollowUpMethodLabel: row.nextFollowUpMethod
          ? salesLogMethodLabel(row.nextFollowUpMethod)
          : null,
        nextFollowUpContent: row.nextFollowUpContent?.trim() || null,
        result: row.result?.trim() || null,
        checkInId: linkedCheckIn?.id ?? null,
        checkInLocation: linkedCheckIn ? formatCheckInLocation(linkedCheckIn) : null,
        checkInStatusLabel: linkedCheckIn ? checkInStatusLabel(linkedCheckIn) : null,
      };
    }),
    ...meaningfulDailyLogs.map((row) => {
      const placeholder = isUnsubmittedDailyReportPlaceholder(row);
      const logSubmitted = isDailyReportSubmitted(row.status);
      const logLate =
        Boolean(row.lateMarkedAt) ||
        (logSubmitted &&
          isDailyReportCountedAsLate({
            logDate: row.logDate,
            status: row.status,
            submittedAt: row.submittedAt,
            updatedAt: row.updatedAt,
            lateMarkedAt: row.lateMarkedAt,
          }));
      const at = placeholder
        ? row.lateMarkedAt ?? getDailyReportDeadline(row.logDate)
        : row.submittedAt ?? row.updatedAt ?? row.logDate;
      const auto =
        autoCheckInsByLogId.get(row.id) ??
        autoCheckInsByUserDay.get(`${row.userId}:${dayKeyOf(row.logDate)}`) ??
        null;
      const locationLabel = auto ? formatCheckInLocation(auto) : null;
      const baseStatus = dailyLogStatusLabel[row.status];
      const subtitle = placeholder
        ? UNSUBMITTED_DAILY_REPORT_BODY
        : logLate
          ? `${baseStatus}（迟交）`
          : baseStatus;
      const metaParts = [
        row.submittedAt ? `提交于 ${format(row.submittedAt, "HH:mm")}` : null,
        placeholder ? "可补录 · 不计入正常日报统计" : null,
        logLate && !placeholder ? "迟交（统计已锁定）" : null,
        locationLabel && locationLabel !== "—" ? `定位：${locationLabel}` : null,
      ].filter(Boolean);
      return {
        id: row.id,
        kind: "daily_log" as const,
        at,
        dayKey: dayKeyOf(row.logDate),
        userId: row.user.id,
        userName: row.user.name,
        title: placeholder
          ? UNSUBMITTED_DAILY_REPORT_BODY
          : `${format(row.logDate, "M月d日")} 日报`,
        subtitle,
        detail: placeholder
          ? "超时未交，系统已生成本条。点「补录日报」打开对话框填写；补录后显示迟交，不改变统计。"
          : row.dailyReport?.trim() || null,
        customerId: null,
        customerName: null,
        meta: metaParts.length > 0 ? metaParts.join(" · ") : null,
        logSubmitted,
        logLate,
        logPendingMakeup: placeholder,
        makeupHref: placeholder ? dailyReportMakeupDesktopPath() : null,
        makeupMobileHref: placeholder ? dailyReportMakeupPath() : null,
        locationLabel,
        riskFlag: placeholder ? false : Boolean(row.riskFlag),
        riskNotes: placeholder ? null : row.riskNotes,
      };
    }),
    ...createLogs.map((row) => {
      const at = row.createdAt;
      if (row.entityType === ENTITY_TYPES.CUSTOMER) {
        const name = customerNameById.get(row.entityId) ?? row.summary;
        return {
          id: row.id,
          kind: "customer_create" as const,
          at,
          dayKey: dayKeyOf(at),
          userId: row.user.id,
          userName: row.user.name,
          title: name,
          subtitle: row.user.name,
          detail: row.summary,
          customerId: row.entityId,
          customerName: name,
          meta: null,
        };
      }
      const opp = opportunityById.get(row.entityId);
      const title = opp?.title ?? row.summary;
      const customerName = opp?.customer?.name ?? null;
      return {
        id: row.id,
        kind: "opportunity_create" as const,
        at,
        dayKey: dayKeyOf(at),
        userId: row.user.id,
        userName: row.user.name,
        title,
        subtitle: customerName
          ? `${row.user.name} · ${customerName}`
          : row.user.name,
        detail: row.summary,
        customerId: opp?.customerId ?? opp?.customer?.id ?? null,
        customerName,
        opportunityId: row.entityId,
        meta: customerName ? `客户：${customerName}` : null,
      };
    }),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

function countsCheckIn(item: TeamWorkActivityItem) {
  return item.kind === "check_in" || Boolean(item.checkInId);
}

function countsFollowUp(item: TeamWorkActivityItem) {
  return item.kind === "follow_up";
}

export function groupTeamWorkByDay(items: TeamWorkActivityItem[]): TeamWorkDayGroup[] {
  const map = new Map<string, TeamWorkActivityItem[]>();
  for (const item of items) {
    const list = map.get(item.dayKey) ?? [];
    list.push(item);
    map.set(item.dayKey, list);
  }

  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, dayItems]) => ({
      dayKey,
      dayLabel: dayLabelOf(dayKey),
      items: dayItems.sort((a, b) => b.at.getTime() - a.at.getTime()),
      stats: {
        checkIns: dayItems.filter(countsCheckIn).length,
        followUps: dayItems.filter(countsFollowUp).length,
        logsSubmitted: dayItems.filter((i) => i.kind === "daily_log" && i.logSubmitted).length,
      },
    }));
}

export function summarizeTeamWorkActivity(items: TeamWorkActivityItem[]) {
  return {
    checkIns: items.filter(countsCheckIn).length,
    followUps: items.filter(countsFollowUp).length,
    logsSubmitted: items.filter((i) => i.kind === "daily_log" && i.logSubmitted).length,
  };
}
