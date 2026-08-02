import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import {
  extractDraftFromConversation,
  getDailyLogForUser,
  parseLogDateParam,
  type ConversationMessage,
} from "@/lib/sales-log/daily-log";
import { isDailyReportSubmitted } from "@/lib/sales-log/daily-report-submission";
import { submitDailyLogFromAgent } from "@/lib/sales-log/write";

export const maxDuration = 30;

const ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

/**
 * 用户已确认但 Agent 未真正 submit 时的兜底提交。
 * 从对话拟稿或请求体提取日报内容并直接落库。
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
    dailyReport?: string;
    tomorrowPlan?: string;
    riskFlag?: boolean;
    riskNotes?: string;
  };

  const logDate = parseLogDateParam(body.date);
  const log = await getDailyLogForUser(session.user.id, logDate);
  if (!log) {
    return Response.json({ error: "当日尚无日志记录" }, { status: 404 });
  }
  if (isDailyReportSubmitted(log.status)) {
    return Response.json({
      ok: true,
      alreadySubmitted: true,
      status: log.status,
      dailyLogId: log.id,
    });
  }

  let dailyReport = body.dailyReport?.trim() ?? "";
  let tomorrowPlan = body.tomorrowPlan?.trim() ?? "";

  if (!dailyReport || !tomorrowPlan) {
    const conversation = Array.isArray(log.conversation)
      ? (log.conversation as ConversationMessage[])
      : [];
    const draft = extractDraftFromConversation(conversation);
    if (draft) {
      dailyReport = dailyReport || draft.dailyReport;
      tomorrowPlan = tomorrowPlan || draft.tomorrowPlan;
    }
  }

  if (!dailyReport.trim()) {
    return Response.json(
      {
        error:
          "未能从对话中还原日报正文。请再与助理确认一次，或联系管理员根据对话补录。",
      },
      { status: 400 }
    );
  }

  try {
    const result = await submitDailyLogFromAgent(
      {
        userId: session.user.id,
        role: session.user.role,
        dailyLogId: log.id,
      },
      {
        dailyReport,
        tomorrowPlan: tomorrowPlan || undefined,
        riskFlag: body.riskFlag,
        riskNotes: body.riskNotes,
      }
    );
    console.info("[sales-log] ensure-submit ok", {
      userId: session.user.id,
      dailyLogId: log.id,
      status: result.status,
    });
    return Response.json({
      ok: true,
      alreadySubmitted: false,
      status: result.status,
      dailyLogId: result.dailyLogId,
      message: result.message,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "补交失败";
    console.error("[sales-log] ensure-submit failed", {
      userId: session.user.id,
      dailyLogId: log.id,
      message,
    });
    return Response.json({ error: message }, { status: 400 });
  }
}
