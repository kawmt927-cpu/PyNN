import { SalesDailyLogStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function getTodayLogDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function ensureTodayDailyLog(userId: string) {
  const logDate = getTodayLogDate();
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

export type ConversationMessage = {
  role: string;
  content: string;
};

export async function syncDailyLogConversation(
  userId: string,
  messages: ConversationMessage[]
) {
  const log = await ensureTodayDailyLog(userId);
  await prisma.salesDailyLog.update({
    where: { id: log.id },
    data: { conversation: messages },
  });
  return log;
}

export async function getTodayDailyLogForUser(userId: string) {
  const logDate = getTodayLogDate();
  return prisma.salesDailyLog.findUnique({
    where: { userId_logDate: { userId, logDate } },
    select: {
      id: true,
      status: true,
      dailyReport: true,
      structuredOutput: true,
      updatedAt: true,
    },
  });
}
