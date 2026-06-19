import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SALES_LOG_SYSTEM_PROMPT } from "@/lib/agent/sales-log-prompt";

export const maxDuration = 60;

function getLlmModel() {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const provider = createOpenAI({
    apiKey,
    baseURL: process.env.LLM_API_BASE || undefined,
    compatibility: "compatible",
  });

  return provider(process.env.LLM_MODEL || "moonshot-v1-8k");
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const model = getLlmModel();
  if (!model) {
    return new Response(
      JSON.stringify({
        error: "未配置 LLM_API_KEY，请在 .env 中设置大模型 API Key",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages } = await req.json();

  const result = streamText({
    model,
    system: SALES_LOG_SYSTEM_PROMPT,
    messages,
  });

  return result.toDataStreamResponse();
}
