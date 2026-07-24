import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { SalesDailyLogStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkInStatusLabel } from "@/lib/sales-log/check-in";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";
import { isAutoDailyLogCheckIn } from "@/lib/sales-log/auto-log-check-in";
import {
  TEAM_ACTIVITY_OTHER_FILTER,
  TEAM_ACTIVITY_OTHER_ROLES,
  type TeamActivityUserFilter,
} from "@/lib/today-work/activity-view-scope";
import { teamPerformanceMemberWhere } from "@/lib/sales/team-performance";

export type TeamWorkActivityKind = "check_in" | "follow_up" | "daily_log";

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
  meta: string | null;
  logSubmitted?: boolean;
  /** 日报合并的自动定位文案 */
  locationLabel?: string | null;
};

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

const dailyLogStatusLabel: Record<SalesDailyLogStatus, string> = {
  IN_PROGRESS: "进行中",
  PENDING_CONFIRM: "待确认",
  SUBMITTED: "已提交",
  RISK_SUBMITTED: "已提交（有风险）",
};

function dayKeyOf(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function dayLabelOf(dayKey: string) {
  const date = new Date(`${dayKey}T12:00:00`);
  return format(date, "M月d日 EEEE", { locale: zhCN });
}

function kindLabel(kind: TeamWorkActivityKind) {
  if (kind === "check_in") return "打卡";
  if (kind === "follow_up") return "往来";
  return "日报";
}

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
  const members = await listTeamActivityMembers();
  return members
    .filter((u) => u.role === "SALES")
    .map(({ id, name }) => ({ id, name }));
}

export async function listTeamWorkActivity(options: {
  start: Date;
  end: Date;
  /** null=全员；other=销售管理+管理员；string=指定用户 */
  filter?: TeamActivityUserFilter;
}): Promise<TeamWorkActivityItem[]> {
  const members = await listTeamActivityMembers();
  const filter = options.filter ?? null;

  let userIds: string[];
  if (filter === TEAM_ACTIVITY_OTHER_FILTER) {
    userIds = members
      .filter((u) => TEAM_ACTIVITY_OTHER_ROLES.includes(u.role))
      .map((u) => u.id);
  } else if (typeof filter === "string") {
    userIds = members.filter((u) => u.id === filter).map((u) => u.id);
  } else {
    userIds = members.map((u) => u.id);
  }

  if (userIds.length === 0) return [];

  const [checkIns, followUps, dailyLogs] = await Promise.all([
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
        opportunity: { select: { title: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.salesDailyLog.findMany({
      where: {
        userId: { in: userIds },
        logDate: { gte: options.start, lt: options.end },
        OR: [
          { status: { not: SalesDailyLogStatus.IN_PROGRESS } },
          { dailyReport: { not: null } },
          // 有实际日报正文的才展示；纯打卡/往来触发的空草稿不占列表
        ],
      },
      orderBy: [{ logDate: "desc" }, { updatedAt: "desc" }],
      include: {
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  const meaningfulDailyLogs = dailyLogs.filter((row) => {
    if (row.status !== SalesDailyLogStatus.IN_PROGRESS) return true;
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

  const items: TeamWorkActivityItem[] = [
    ...standaloneCheckIns.map((row) => {
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
      };
    }),
    ...followUps.map((row) => {
      const at = row.followUpAt;
      const method = salesLogMethodLabel(row.method);
      const subtitle = row.contact?.name ? `${method} · ${row.contact.name}` : method;
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
      };
    }),
    ...meaningfulDailyLogs.map((row) => {
      const at = row.submittedAt ?? row.logDate;
      const logSubmitted =
        row.status === SalesDailyLogStatus.SUBMITTED ||
        row.status === SalesDailyLogStatus.RISK_SUBMITTED;
      const auto =
        autoCheckInsByLogId.get(row.id) ??
        autoCheckInsByUserDay.get(`${row.userId}:${dayKeyOf(row.logDate)}`) ??
        null;
      const locationLabel = auto ? formatCheckInLocation(auto) : null;
      const metaParts = [
        row.submittedAt ? `提交于 ${format(row.submittedAt, "HH:mm")}` : null,
        locationLabel && locationLabel !== "—" ? `定位：${locationLabel}` : null,
      ].filter(Boolean);
      return {
        id: row.id,
        kind: "daily_log" as const,
        at,
        dayKey: dayKeyOf(row.logDate),
        userId: row.user.id,
        userName: row.user.name,
        title: `${format(row.logDate, "M月d日")} 日报`,
        subtitle: dailyLogStatusLabel[row.status],
        detail: row.dailyReport?.trim() || null,
        customerId: null,
        customerName: null,
        meta: metaParts.length > 0 ? metaParts.join(" · ") : null,
        logSubmitted,
        locationLabel,
      };
    }),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
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
        checkIns: dayItems.filter((i) => i.kind === "check_in").length,
        followUps: dayItems.filter((i) => i.kind === "follow_up").length,
        logsSubmitted: dayItems.filter((i) => i.kind === "daily_log" && i.logSubmitted).length,
      },
    }));
}

export function summarizeTeamWorkActivity(items: TeamWorkActivityItem[]) {
  return {
    checkIns: items.filter((i) => i.kind === "check_in").length,
    followUps: items.filter((i) => i.kind === "follow_up").length,
    logsSubmitted: items.filter((i) => i.kind === "daily_log" && i.logSubmitted).length,
  };
}

export { kindLabel, dailyLogStatusLabel };
