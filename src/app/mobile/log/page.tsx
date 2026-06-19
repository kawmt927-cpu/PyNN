"use client";

import { useChat } from "ai/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SALES_LOG_OPENING_MESSAGE } from "@/lib/agent/sales-log-prompt";
import { useWeComSdk, isWeComClient } from "@/hooks/use-wecom-sdk";
import { LocationButton } from "@/components/mobile/location-button";
import { VoiceInputButton } from "@/components/mobile/voice-input-button";
import Link from "next/link";

export default function MobileLogPage() {
  const inWeCom = isWeComClient();
  const { ready: wecomReady, error: wecomError, getLocation, startVoiceRecord, stopVoiceRecord } =
    useWeComSdk(inWeCom);

  const { messages, append, isLoading, setMessages } = useChat({
    api: "/api/mobile/log/chat",
  });
  const initialized = useRef(false);
  const [input, setInput] = useState("");

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
              {inWeCom ? "企业微信 · AI 助理" : "AI 助理对话采集"}
            </p>
          </div>
          {!inWeCom && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">返回</Link>
            </Button>
          )}
        </div>
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
          快捷词：新客户 · 老客户 · 医院 · 渠道 · 跑空 · 生成日报
        </p>
      </form>
    </div>
  );
}
