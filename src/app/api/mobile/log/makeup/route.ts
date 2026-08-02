import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import {
  getDailyLogForUser,
  isWithinConversationRetention,
  parseActivityDateParam,
} from "@/lib/sales-log/daily-log";
import { isDailyReportSubmitted } from "@/lib/sales-log/daily-report-submission";
import { isUnsubmittedDailyReportPlaceholder } from "@/lib/sales-log/unsubmitted-daily-report";
import { submitDailyLogFromAgent } from "@/lib/sales-log/write";
import { prisma } from "@/lib/prisma";

export const maxDuration = 30;

const ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

/**
 * 手动补录超时「未提交日报」：表单写入，超 7 天窗口则清空 AI 对话。
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!ROLES.includes(session.user.role)) {
    return Response.json({ error: "无权访问" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    date?: string;
    dailyLogId?: string;
    dailyReport?: string;
    tomorrowPlan?: string;
  };

  const logDate = parseActivityDateParam(body.date);
  const log = body.dailyLogId
    ? await prisma.salesDailyLog.findFirst({
        where: { id: body.dailyLogId, userId: session.user.id },
      })
    : await getDailyLogForUser(session.user.id, logDate);

  if (!log) {
    return Response.json({ error: "找不到该日日报记录" }, { status: 404 });
  }
  if (isDailyReportSubmitted(log.status)) {
    return Response.json({
      ok: true,
      alreadySubmitted: true,
      status: log.status,
      dailyLogId: log.id,
      conversationCleared: false,
    });
  }
  if (!log.lateMarkedAt && !isUnsubmittedDailyReportPlaceholder(log)) {
    return Response.json(
      { error: "该日尚不需要补录，请到「今日日报」与助理完成提交" },
      { status: 400 }
    );
  }

  const dailyReport = body.dailyReport?.trim() ?? "";
  const tomorrowPlan = body.tomorrowPlan?.trim() ?? "";
  if (!dailyReport) {
    return Response.json({ error: "请填写今日工作总结" }, { status: 400 });
  }
  if (!tomorrowPlan) {
    return Response.json({ error: "请填写明日计划" }, { status: 400 });
  }

  try {
    const result = await submitDailyLogFromAgent(
      {
        userId: session.user.id,
        role: session.user.role,
        dailyLogId: log.id,
      },
      { dailyReport, tomorrowPlan }
    );

    let conversationCleared = false;
    if (!isWithinConversationRetention(log.logDate)) {
      await prisma.salesDailyLog.update({
        where: { id: log.id },
        data: { conversation: [] },
      });
      conversationCleared = true;
    }

    console.info("[sales-log] makeup ok", {
      userId: session.user.id,
      dailyLogId: log.id,
      conversationCleared,
    });

    return Response.json({
      ok: true,
      alreadySubmitted: false,
      status: result.status,
      dailyLogId: result.dailyLogId,
      message: result.message,
      conversationCleared,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "补录失败";
    console.error("[sales-log] makeup failed", {
      userId: session.user.id,
      dailyLogId: log.id,
      message,
    });
    return Response.json({ error: message }, { status: 400 });
  }
}
