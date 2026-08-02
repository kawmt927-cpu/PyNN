import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import {
  getDailyLogForUser,
  listRecentDailyLogsWithConversation,
  listRecentLogDateOptions,
  parseLogDateParam,
  syncDailyLogConversation,
  type ConversationMessage,
} from "@/lib/sales-log/daily-log";

const SYNC_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!SYNC_ROLES.includes(session.user.role)) {
    return new Response(JSON.stringify({ error: "无权访问" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const wantList = url.searchParams.get("list") === "1";
  if (wantList) {
    const recent = await listRecentDailyLogsWithConversation(session.user.id);
    return Response.json({
      dates: listRecentLogDateOptions(),
      recent,
    });
  }

  const logDate = parseLogDateParam(url.searchParams.get("date"));
  const log = await getDailyLogForUser(session.user.id, logDate);
  return Response.json({
    log,
    date: url.searchParams.get("date") || undefined,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!SYNC_ROLES.includes(session.user.role)) {
    return new Response(JSON.stringify({ error: "无权访问" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const messages = (body.messages ?? []) as ConversationMessage[];
  const logDate = parseLogDateParam(
    typeof body.date === "string" ? body.date : undefined
  );
  const sanitized = messages
    .filter((m) => m.content?.trim() && m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  const log = await syncDailyLogConversation(
    session.user.id,
    sanitized,
    logDate
  );
  // 再读一次，拿到 Agent 可能刚写入的 status
  const fresh = await getDailyLogForUser(session.user.id, logDate);
  return Response.json({
    dailyLogId: log.id,
    status: fresh?.status ?? log.status,
    submittedAt: fresh?.submittedAt ?? null,
    date: body.date ?? null,
  });
}
