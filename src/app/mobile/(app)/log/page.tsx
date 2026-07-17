"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Card, CardContent } from "@/components/ui/card";
import { SALES_LOG_OPENING_MESSAGE } from "@/lib/agent/sales-log-prompt";
import { useWeComSdk, isWeComClient } from "@/hooks/use-wecom-sdk";
import { LocationButton } from "@/components/mobile/location-button";
import { VoiceInputButton } from "@/components/mobile/voice-input-button";
type DailyLogStatus =
  | "IN_PROGRESS"
  | "PENDING_CONFIRM"
  | "SUBMITTED"
  | "RISK_SUBMITTED"
  | null;

const STATUS_LABEL: Record<Exclude<DailyLogStatus, null>, string> = {
  IN_PROGRESS: "对话中",
  PENDING_CONFIRM: "待确认",
  SUBMITTED: "已提交",
  RISK_SUBMITTED: "已提交（带风险）",
};

export default function MobileLogPage() {
  const inWeCom = isWeComClient();
  const { ready: wecomReady, error: wecomError, getLocation, startVoiceRecord, stopVoiceRecord } =
    useWeComSdk(inWeCom);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<{ role: string; content: string }[]>([]);
  const sessionBootstrapped = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [logStatus, setLogStatus] = useState<DailyLogStatus>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [inputActionHint, setInputActionHint] = useState<string | null>(null);

  const syncConversation = useCallback(async (items: { role: string; content: string }[]) => {
    try {
      const res = await fetch("/api/mobile/log/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: items.filter((m) => m.content?.trim()),
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { status?: DailyLogStatus };
      if (data.status) {
        setLogStatus(data.status);
        if (data.status === "SUBMITTED" || data.status === "RISK_SUBMITTED") {
          setSyncHint("今日日报已写入系统");
        }
      }
    } catch {
      // 同步失败不阻断对话
    }
  }, []);

  const { messages, append, isLoading, setMessages, error } = useChat({
    api: "/api/mobile/log/chat",
    credentials: "include",
    onError: (err) => {
      console.error("sales log chat error:", err);
    },
    onFinish: () => {
      void syncConversation(messagesRef.current);
    },
    experimental_prepareRequestBody: ({ messages: chatMessages }) => ({
      messages: chatMessages
        .filter((m) => m.id !== "opening" && m.content?.trim())
        .map(({ role, content }) => ({ role, content })),
    }),
  });

  useEffect(() => {
    messagesRef.current = messages.map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const lastMessageContent = messages[messages.length - 1]?.content ?? "";

  useEffect(() => {
    const behavior = messages.length <= 2 ? "auto" : "smooth";
    const id = requestAnimationFrame(() => scrollToBottom(behavior));
    return () => cancelAnimationFrame(id);
  }, [messages, isLoading, chatError, syncHint, scrollToBottom]);

  // 流式输出时消息内容持续增长，需跟随滚动
  useEffect(() => {
    if (!isLoading) return;
    const id = requestAnimationFrame(() => scrollToBottom("auto"));
    return () => cancelAnimationFrame(id);
  }, [lastMessageContent, isLoading, scrollToBottom]);

  useEffect(() => {
    if (error) {
      setChatError(error.message || "对话请求失败，请稍后重试");
    }
  }, [error]);

  useEffect(() => {
    if (sessionBootstrapped.current) return;

    fetch("/api/mobile/log/sync", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        sessionBootstrapped.current = true;
        const status = data?.log?.status as DailyLogStatus | undefined;
        if (status) setLogStatus(status);

        const saved = (data?.log?.conversation ?? []) as { role: string; content: string }[];
        if (saved.length > 0) {
          setMessages(
            saved.map((m, i) => ({
              id: `restored-${i}`,
              role: m.role as "user" | "assistant" | "system" | "data",
              content: m.content,
            }))
          );
          return;
        }

        if (status === "SUBMITTED" || status === "RISK_SUBMITTED") {
          const report = data?.log?.dailyReport?.trim();
          setMessages([
            {
              id: "submitted",
              role: "assistant",
              content: report
                ? `今日日报已提交。\n\n${report}`
                : "今日日报已提交，如需补充请联系管理员。",
            },
          ]);
          return;
        }

        setMessages([
          {
            id: "opening",
            role: "assistant",
            content: SALES_LOG_OPENING_MESSAGE,
          },
        ]);
      })
      .catch(() => {
        sessionBootstrapped.current = true;
        setMessages([
          {
            id: "opening",
            role: "assistant",
            content: SALES_LOG_OPENING_MESSAGE,
          },
        ]);
      });
  }, [setMessages]);

  const visibleMessages = messages;

  function appendToInput(text: string) {
    setInput((prev) => (prev ? `${prev}\n${text}` : text));
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setChatError(null);
    append({ role: "user", content: text });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b bg-card p-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">今日销售日志</h1>
            <p className="text-xs text-muted-foreground">
              {inWeCom ? "企业微信 · AI 助理" : "口述今日工作 · AI 整理日报"}
              {logStatus ? ` · ${STATUS_LABEL[logStatus]}` : ""}
            </p>
          </div>
        </div>
        {syncHint && (
          <p className="mt-2 rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
            {syncHint}
          </p>
        )}
        {inWeCom && wecomError && (
          <p className="mt-2 text-xs text-orange-600">SDK: {wecomError}</p>
        )}
      </header>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-6"
      >
        {visibleMessages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <Card
              className={`max-w-[85%] ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              <CardContent className="whitespace-pre-wrap p-3 text-sm">{m.content}</CardContent>
            </Card>
          </div>
        ))}
        {isLoading && (
          <p className="text-sm text-muted-foreground">助理正在整理…</p>
        )}
        {chatError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {chatError}
          </p>
        )}
        <div ref={messagesEndRef} aria-hidden className="h-px shrink-0 scroll-mt-4" />
      </div>

      <form onSubmit={handleSend} className="shrink-0 border-t bg-card p-3">
        <div className="mb-2 flex gap-2">
          <LocationButton
            disabled={isLoading}
            wecomReady={wecomReady}
            onGetWeComLocation={getLocation}
            onLocation={appendToInput}
            onStatus={setInputActionHint}
          />
          <VoiceInputButton
            disabled={isLoading}
            wecomReady={wecomReady}
            inWeCom={inWeCom}
            onStartWeComRecord={startVoiceRecord}
            onStopWeComRecord={stopVoiceRecord}
            onTranscript={appendToInput}
            onStatus={setInputActionHint}
          />
          <span className="flex min-w-0 flex-1 items-center text-xs text-muted-foreground">
            {inputActionHint ?? (inWeCom ? "定位 · 按住说话" : "定位 · 点击麦克风说话")}
          </span>
        </div>
        <div className="flex items-end gap-2">
          <AutoResizeTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="口述今日拜访与外勤情况…"
            className="flex-1"
            disabled={isLoading}
            maxRows={8}
          />
          <Button type="submit" disabled={isLoading || !input.trim()} className="shrink-0">
            发送
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          确认后 AI 将结合打卡记录落库并生成日报 · 快捷词：生成日报
        </p>
      </form>
    </div>
  );
}
