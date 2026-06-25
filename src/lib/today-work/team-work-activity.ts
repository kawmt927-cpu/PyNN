import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { SalesDailyLogStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkInStatusLabel } from "@/lib/sales-log/check-in";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";

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

export async function listTeamSalesMembers() {
  return prisma.user.findMany({
    where: { role: "SALES", personnelProfile: { enabled: true } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listTeamWorkActivity(options: {
  start: Date;
  end: Date;
  userId?: string | null;
}): Promise<TeamWorkActivityItem[]> {
  const members = await listTeamSalesMembers();
  const userIds = options.userId
    ? members.filter((u) => u.id === options.userId).map((u) => u.id)
    : members.map((u) => u.id);

  if (userIds.length === 0) return [];

  const userNameMap = new Map(members.map((u) => [u.id, u.name]));

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
      },
      orderBy: [{ logDate: "desc" }, { updatedAt: "desc" }],
      include: {
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  const items: TeamWorkActivityItem[] = [
    ...checkIns.map((row) => {
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
      return {
        id: row.id,
        kind: "follow_up" as const,
        at,
        dayKey: dayKeyOf(at),
        userId: row.user.id,
        userName: row.user.name,
        title: row.customer.name,
        subtitle: salesLogMethodLabel(row.method),
        detail: row.content,
        customerId: row.customer.id,
        customerName: row.customer.name,
        meta: row.opportunity?.title ? `商机：${row.opportunity.title}` : null,
      };
    }),
    ...dailyLogs.map((row) => {
      const at = row.submittedAt ?? row.logDate;
      const logSubmitted =
        row.status === SalesDailyLogStatus.SUBMITTED ||
        row.status === SalesDailyLogStatus.RISK_SUBMITTED;
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
        meta: row.submittedAt ? `提交于 ${format(row.submittedAt, "HH:mm")}` : null,
        logSubmitted,
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
    salesActive: new Set(items.map((i) => i.userId)).size,
  };
}

export { kindLabel, dailyLogStatusLabel };
