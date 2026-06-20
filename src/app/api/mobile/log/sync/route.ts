import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import {
  getTodayDailyLogForUser,
  syncDailyLogConversation,
  type ConversationMessage,
} from "@/lib/sales-log/daily-log";

const SYNC_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function GET() {
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

  const log = await getTodayDailyLogForUser(session.user.id);
  return Response.json({ log });
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
  const sanitized = messages
    .filter((m) => m.content?.trim() && m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content.trim() }));

  const log = await syncDailyLogConversation(session.user.id, sanitized);
  return Response.json({
    dailyLogId: log.id,
    status: log.status,
  });
}
