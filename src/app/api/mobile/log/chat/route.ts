import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { createSalesLogAgentStream, isAiAgentAvailable } from "@/lib/agent/runtime";
import { ensureTodayDailyLog } from "@/lib/sales-log/daily-log";

export const maxDuration = 60;

const CHAT_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!CHAT_ROLES.includes(session.user.role)) {
    return new Response(JSON.stringify({ error: "当前角色无法使用销售日志" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const available = await isAiAgentAvailable();
  if (!available) {
    return new Response(
      JSON.stringify({
        error: "AI 助手未启用或未配置 API Key，请管理员在系统配置 → AI 助手中设置",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages } = await req.json();
  const dailyLog = await ensureTodayDailyLog(session.user.id);

  try {
    const result = await createSalesLogAgentStream(messages, {
      user: { id: session.user.id, role: session.user.role },
      dailyLogId: dailyLog.id,
    });
    return result.toDataStreamResponse({
      getErrorMessage: (error) =>
        error instanceof Error ? error.message : "AI 请求失败",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 请求失败";
    return new Response(JSON.stringify({ error: message }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
