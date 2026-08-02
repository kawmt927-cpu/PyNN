import { format, subDays } from "date-fns";
import { SalesDailyLogStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SALES_LOG_CONVERSATION_RETENTION_DAYS = 7;

export function getTodayLogDate(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatLogDateParam(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function parseYmdToLocalDate(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return null;
  const [y, m, d] = dateStr.trim().split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** 解析 yyyy-MM-dd；限制在今天起往前 retention 天内（AI 对话） */
export function parseLogDateParam(
  dateStr?: string | null,
  now = new Date()
): Date {
  const today = getTodayLogDate(now);
  const date = dateStr ? parseYmdToLocalDate(dateStr) : null;
  if (!date) return today;
  const earliest = subDays(today, SALES_LOG_CONVERSATION_RETENTION_DAYS - 1);
  if (date > today) return today;
  if (date < earliest) return earliest;
  return date;
}

/** 解析 yyyy-MM-dd；允许任意过去日期，不可超过今天（工作日志） */
export function parseActivityDateParam(
  dateStr?: string | null,
  now = new Date()
): Date {
  const today = getTodayLogDate(now);
  const date = dateStr ? parseYmdToLocalDate(dateStr) : null;
  if (!date) return today;
  if (date > today) return today;
  return date;
}

export function conversationDateBounds(now = new Date()): {
  min: string;
  max: string;
} {
  const today = getTodayLogDate(now);
  return {
    min: formatLogDateParam(
      subDays(today, SALES_LOG_CONVERSATION_RETENTION_DAYS - 1)
    ),
    max: formatLogDateParam(today),
  };
}

/** 该日志日是否仍在 AI 对话保留窗口内（含今天共 retention 天） */
export function isWithinConversationRetention(
  logDate: Date,
  now = new Date()
): boolean {
  const today = getTodayLogDate(now);
  const day = getTodayLogDate(logDate);
  const earliest = subDays(today, SALES_LOG_CONVERSATION_RETENTION_DAYS - 1);
  return day.getTime() >= earliest.getTime() && day.getTime() <= today.getTime();
}

export function listRecentLogDateOptions(
  days = SALES_LOG_CONVERSATION_RETENTION_DAYS,
  now = new Date()
): string[] {
  const today = getTodayLogDate(now);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(formatLogDateParam(subDays(today, i)));
  }
  return out;
}

export async function ensureDailyLogForDate(userId: string, logDate: Date) {
  return prisma.salesDailyLog.upsert({
    where: { userId_logDate: { userId, logDate } },
    create: {
      userId,
      logDate,
      conversation: [],
      status: SalesDailyLogStatus.IN_PROGRESS,
    },
    update: {},
  });
}

export async function ensureTodayDailyLog(userId: string) {
  return ensureDailyLogForDate(userId, getTodayLogDate());
}

export type ConversationMessage = {
  role: string;
  content: string;
};

export async function syncDailyLogConversation(
  userId: string,
  messages: ConversationMessage[],
  logDate: Date = getTodayLogDate()
) {
  const log = await ensureDailyLogForDate(userId, logDate);
  const updated = await prisma.salesDailyLog.update({
    where: { id: log.id },
    data: { conversation: messages },
    select: {
      id: true,
      status: true,
      dailyReport: true,
      submittedAt: true,
      logDate: true,
      updatedAt: true,
    },
  });
  return updated;
}

const dailyLogSelect = {
  id: true,
  logDate: true,
  status: true,
  dailyReport: true,
  structuredOutput: true,
  conversation: true,
  updatedAt: true,
  submittedAt: true,
  lateMarkedAt: true,
} as const;

export async function getDailyLogForUser(userId: string, logDate: Date) {
  return prisma.salesDailyLog.findUnique({
    where: { userId_logDate: { userId, logDate } },
    select: dailyLogSelect,
  });
}

export async function getTodayDailyLogForUser(userId: string) {
  return getDailyLogForUser(userId, getTodayLogDate());
}

/** 最近 N 天有对话或日报的摘要（两端同步用） */
export async function listRecentDailyLogsWithConversation(
  userId: string,
  days = SALES_LOG_CONVERSATION_RETENTION_DAYS
) {
  const today = getTodayLogDate();
  const start = subDays(today, days - 1);
  const rows = await prisma.salesDailyLog.findMany({
    where: {
      userId,
      logDate: { gte: start, lte: today },
    },
    select: {
      id: true,
      logDate: true,
      status: true,
      updatedAt: true,
      submittedAt: true,
      conversation: true,
      dailyReport: true,
    },
    orderBy: { logDate: "desc" },
  });

  return rows.map((row) => {
    const conversation = Array.isArray(row.conversation)
      ? (row.conversation as ConversationMessage[])
      : [];
    return {
      id: row.id,
      logDate: row.logDate,
      date: formatLogDateParam(row.logDate),
      status: row.status,
      updatedAt: row.updatedAt,
      submittedAt: row.submittedAt,
      messageCount: conversation.filter((m) => m.content?.trim()).length,
      hasConversation: conversation.some((m) => m.content?.trim()),
      hasReport: Boolean(row.dailyReport?.trim()),
    };
  });
}

/** 从对话中提取最后一份完整拟稿（今日总结 + 明日计划） */
export function extractDraftFromConversation(
  messages: ConversationMessage[]
): { dailyReport: string; tomorrowPlan: string } | null {
  const assistants = [...messages]
    .reverse()
    .filter((m) => m.role === "assistant" && m.content?.trim());

  for (const msg of assistants) {
    const content = msg.content.trim();
    if (
      !/今日(工作)?总结|今日总结|##\s*今日总结/.test(content) ||
      !/明日计划/.test(content)
    ) {
      continue;
    }
    // 去掉定位附言
    const cleaned = content
      .replace(/\n*已自动获取当前位置：[\s\S]*$/m, "")
      .replace(/\n*未能自动获取定位[\s\S]*$/m, "")
      .trim();

    const planMatch = cleaned.match(
      /(?:^|\n)(?:#+\s*)?明日计划\s*\n+([\s\S]*?)(?=\n(?:#+\s*|确认后|以上是|没问题)|$)/i
    );
    const tomorrowPlan = (planMatch?.[1] ?? "")
      .split("\n")
      .map((line) => line.replace(/^[-*•\d.)]+\s*/, "").trim())
      .filter(Boolean)
      .join("；")
      .trim();

    let dailyReport = cleaned;
    // 若拟稿不是标准 Markdown，包一层结构
    if (!/^#+\s*今日/.test(cleaned) && /今日(工作)?总结/.test(cleaned)) {
      const todayMatch = cleaned.match(
        /今日(?:工作)?总结\s*\n+([\s\S]*?)(?=\n+明日计划|$)/i
      );
      const todayBody = (todayMatch?.[1] ?? cleaned).trim();
      dailyReport = [
        "## 今日总结",
        "",
        todayBody,
        "",
        "## 明日计划",
        "",
        tomorrowPlan || "（见对话）",
      ].join("\n");
    }

    if (dailyReport.trim() && tomorrowPlan.trim()) {
      return { dailyReport: dailyReport.trim(), tomorrowPlan };
    }
  }
  return null;
}

export function isSalesLogUserConfirmMessage(text: string): boolean {
  const t = text.replace(/\s+/g, "").trim();
  if (!t) return false;
  return /^(确认|确认。|确认！|没问题|可以|对的|写入吧|就这样|好的确认|ok|OK|Ok)([。.!！]?)$/.test(
    t
  ) || /^(确认提交|确认写入|确认记进系统)/.test(t);
}
