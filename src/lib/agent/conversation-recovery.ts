type ChatMessageLike = {
  role: string;
  content: string;
};

function normalizeAssistantText(text: string) {
  return text.replace(/\s+/g, "").slice(0, 160);
}

/** 是否像在反复追问「下次往来方式」 */
export function looksLikeNextFollowUpMethodPrompt(text: string) {
  const t = text.replace(/\s+/g, "");
  return (
    (t.includes("下次往来") || t.includes("下次跟进")) &&
    (t.includes("方式") || t.includes("电话") || t.includes("面访") || t.includes("当面"))
  );
}

export function areNearDuplicateAssistantReplies(a: string, b: string) {
  const na = normalizeAssistantText(a);
  const nb = normalizeAssistantText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (looksLikeNextFollowUpMethodPrompt(a) && looksLikeNextFollowUpMethodPrompt(b)) {
    return true;
  }
  const len = Math.min(na.length, nb.length, 72);
  return len >= 48 && na.slice(0, len) === nb.slice(0, len);
}

/**
 * 压缩连续重复的助手回复，避免历史循环把模型再次带进死胡同。
 */
export function sanitizeSalesLogMessagesForAgent(messages: ChatMessageLike[]): {
  messages: ChatMessageLike[];
  loopDetected: boolean;
  collapsedCount: number;
} {
  const out: ChatMessageLike[] = [];
  let collapsedCount = 0;
  let loopDetected = false;

  for (const msg of messages) {
    const role = msg.role;
    const content = msg.content?.trim() ?? "";
    if (!content) continue;

    const prev = out[out.length - 1];
    if (
      role === "assistant" &&
      prev?.role === "assistant" &&
      areNearDuplicateAssistantReplies(prev.content, content)
    ) {
      collapsedCount += 1;
      loopDetected = true;
      out[out.length - 1] = { role, content };
      continue;
    }
    out.push({ role, content });
  }

  const assistants = out.filter((m) => m.role === "assistant");
  if (assistants.length >= 2) {
    const lastTwo = assistants.slice(-2);
    if (areNearDuplicateAssistantReplies(lastTwo[0].content, lastTwo[1].content)) {
      loopDetected = true;
    }
  }

  // 隔一条用户消息仍在追问同一「下次往来方式」也算循环
  for (let i = 0; i < out.length - 2; i++) {
    const a = out[i];
    const mid = out[i + 1];
    const b = out[i + 2];
    if (
      a.role === "assistant" &&
      mid.role === "user" &&
      b.role === "assistant" &&
      looksLikeNextFollowUpMethodPrompt(a.content) &&
      looksLikeNextFollowUpMethodPrompt(b.content)
    ) {
      loopDetected = true;
      break;
    }
  }

  return { messages: out, loopDetected, collapsedCount };
}

export function buildSalesLogLoopRecoveryContext(messages: ChatMessageLike[]): string {
  const recentUser = [...messages]
    .reverse()
    .find((m) => m.role === "user" && m.content.trim())?.content.trim();

  const lines = [
    "【对话恢复指令 · 优先于上文重复追问】",
    "检测到近期助手在重复追问同一问题（常见于「下次往来方式」）。",
    "你必须立刻停止重复提问，不要再道歉式复述同一句。",
    "请根据销售已给出的回答，直接调用 createFollowUp 或 completeCheckIn 写入系统。",
    "写入时务必带齐：nextFollowUpAt、nextFollowUpMethod（当面拜访/面访→FACE_VISIT；电话→PHONE；微信→WECHAT）、nextFollowUpContent。",
    "只有真正缺失、且销售尚未回答过的字段，才允许再问，且一次只问一个。",
  ];
  if (recentUser) {
    lines.push(`销售最近一条回复：「${recentUser.slice(0, 200)}」。请优先采纳，不要再问一遍。`);
  }
  return lines.join("\n");
}

export function toAgentChatMessages(
  messages: ChatMessageLike[]
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}
