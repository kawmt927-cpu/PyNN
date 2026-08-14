"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ChatMarkdown } from "@/components/manager/chat-markdown";
import { OctopusAvatar } from "@/components/manager/octopus-avatar";
import { MANAGER_ASSISTANT_OPENING_MESSAGE } from "@/lib/agent/manager-prompt";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "本月谁日报迟交或缺交比较多？",
  "有哪些逾期待跟进？",
  "本周团队待办重点是什么？",
  "P0/P1 商机里哪些久未拜访？",
  "哪些合同回款已经逾期？",
  "最近日志里谁提到过预算不足？",
];

export function ManagerAiChat() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, input, setInput, handleSubmit, isLoading, error, append, setMessages } =
    useChat({
      api: "/api/manager/assistant/chat",
      initialMessages: [
        {
          id: "opening",
          role: "assistant",
          content: MANAGER_ASSISTANT_OPENING_MESSAGE,
        },
      ],
    });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((text) => (
          <Button
            key={text}
            type="button"
            size="sm"
            variant="outline"
            disabled={isLoading}
            className="h-auto whitespace-normal px-3 py-1.5 text-left text-xs"
            onClick={() => void append({ role: "user", content: text })}
          >
            {text}
          </Button>
        ))}
      </div>

      <Card className="flex-1">
        <CardContent className="flex max-h-[58vh] flex-col gap-3 overflow-y-auto py-4">
          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={cn(
                  "flex gap-2.5",
                  isUser ? "flex-row-reverse" : "flex-row"
                )}
              >
                {!isUser ? (
                  <OctopusAvatar
                    mood={m.id === "opening" ? "wink" : "idle"}
                    size={36}
                    className="mt-0.5"
                  />
                ) : (
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary"
                    aria-hidden
                  >
                    你
                  </div>
                )}
                <div
                  className={cn(
                    "min-w-0 max-w-[min(100%,36rem)] rounded-lg px-3 py-2 text-sm",
                    isUser
                      ? "bg-primary/10 whitespace-pre-wrap"
                      : "bg-muted/60"
                  )}
                >
                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                    {isUser ? "你" : "触触 · 管理助手"}
                  </div>
                  {m.role === "assistant" ? (
                    <ChatMarkdown content={m.content} />
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            );
          })}
          {isLoading ? (
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <OctopusAvatar mood="thinking" size={32} />
              <span>触触正在查询与分析…</span>
            </div>
          ) : null}
          {error ? (
            <div className="flex items-start gap-2.5 text-sm text-destructive">
              <OctopusAvatar mood="alert" size={32} />
              <p>{error.message || "请求失败，请稍后重试"}</p>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <AutoResizeTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="问触触运营问题，例如：本周该催谁回款？"
          className="min-h-[44px] flex-1"
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isLoading && input.trim()) {
                handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
              }
            }
          }}
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          发送
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isLoading}
          onClick={() =>
            setMessages([
              {
                id: "opening",
                role: "assistant",
                content: MANAGER_ASSISTANT_OPENING_MESSAGE,
              },
            ])
          }
        >
          清空
        </Button>
      </form>
    </div>
  );
}
