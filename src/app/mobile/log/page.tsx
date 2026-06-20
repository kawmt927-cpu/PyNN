"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SALES_LOG_OPENING_MESSAGE } from "@/lib/agent/sales-log-prompt";
import { useWeComSdk, isWeComClient } from "@/hooks/use-wecom-sdk";
import { LocationButton } from "@/components/mobile/location-button";
import { VoiceInputButton } from "@/components/mobile/voice-input-button";
import Link from "next/link";

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
  const messagesRef = useRef<{ role: string; content: string }[]>([]);
  const initialized = useRef(false);

  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [logStatus, setLogStatus] = useState<DailyLogStatus>(null);
  const [syncHint, setSyncHint] = useState<string | null>(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading, chatError, syncHint]);

  useEffect(() => {
    if (error) {
      setChatError(error.message || "对话请求失败，请稍后重试");
    }
  }, [error]);

  useEffect(() => {
    fetch("/api/mobile/log/sync", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.log?.status) setLogStatus(data.log.status);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialized.current && messages.length === 0) {
      initialized.current = true;
      setMessages([
        {
          id: "opening",
          role: "assistant",
          content: SALES_LOG_OPENING_MESSAGE,
        },
      ]);
    }
  }, [messages.length, setMessages]);

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
    <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-card p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">今日销售日志</h1>
            <p className="text-xs text-muted-foreground">
              {inWeCom ? "企业微信 · AI 助理" : "AI 完善外勤记录"}
              {logStatus ? ` · ${STATUS_LABEL[logStatus]}` : ""}
            </p>
          </div>
          {!inWeCom && (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/sales-log">外勤日志</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">返回</Link>
              </Button>
            </div>
          )}
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

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((m) => (
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
        {isLoading && <p className="text-sm text-muted-foreground">助理正在思考…</p>}
        {chatError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {chatError}
          </p>
        )}
        <div ref={messagesEndRef} aria-hidden className="h-px shrink-0" />
      </div>

      <form
        onSubmit={handleSend}
        className="sticky bottom-0 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-2 flex gap-2">
          <LocationButton
            disabled={isLoading}
            wecomReady={wecomReady}
            onGetWeComLocation={getLocation}
            onLocation={appendToInput}
          />
          <VoiceInputButton
            disabled={isLoading}
            wecomReady={wecomReady}
            inWeCom={inWeCom}
            onStartWeComRecord={startVoiceRecord}
            onStopWeComRecord={stopVoiceRecord}
            onTranscript={appendToInput}
          />
          <span className="flex items-center text-xs text-muted-foreground">
            定位 · 按住说话
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="描述今日工作，或回答助理提问…"
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            发送
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          确认后 AI 将自动写入客户、跟进与日报 · 快捷词：新客户 · 老客户 · 生成日报
        </p>
      </form>
    </div>
  );
}
