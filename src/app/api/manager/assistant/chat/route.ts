import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { createManagerAgentStream, isAiAgentAvailable } from "@/lib/agent/runtime";

export const maxDuration = 90;

const MANAGER_ROLES: UserRole[] = ["SALES_MANAGER", "ADMIN"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!MANAGER_ROLES.includes(session.user.role)) {
    return new Response(JSON.stringify({ error: "仅销售管理与管理员可使用管理助手" }), {
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

  const body = await req.json();
  const messages = body.messages;

  try {
    const result = await createManagerAgentStream(messages, {
      user: {
        id: session.user.id,
        role: session.user.role,
        name: session.user.name,
      },
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
