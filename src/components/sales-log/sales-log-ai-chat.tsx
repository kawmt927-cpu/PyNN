"use client";

import { useChat, type Message } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { Card, CardContent } from "@/components/ui/card";
import { SALES_LOG_OPENING_MESSAGE } from "@/lib/agent/sales-log-prompt";
import { useWeComSdk, isWeComClient } from "@/hooks/use-wecom-sdk";
import { VoiceInputButton } from "@/components/mobile/voice-input-button";
import {
  captureMobileLocation,
  formatLocationCaptureError,
  isSalesLogDraftConfirmationRequest,
  type CapturedLocation,
} from "@/lib/mobile/capture-location";
import { AUTO_DAILY_LOG_CHECK_IN_NOTES } from "@/lib/sales-log/auto-log-check-in";
import {
  conversationDateBounds,
  formatLogDateParam,
  isSalesLogUserConfirmMessage,
} from "@/lib/sales-log/daily-log";
import { MobileDateNav } from "@/components/mobile/mobile-date-nav";

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

const PENDING_LOCATION_KEY = "mobile-log-pending-location";
const FLUSHED_CHECK_IN_KEY = "mobile-log-checkin-flushed";

type PendingLocation = CapturedLocation;

function loadPendingLocation(): PendingLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_LOCATION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingLocation;
  } catch {
    return null;
  }
}

function savePendingLocation(location: PendingLocation | null) {
  if (typeof window === "undefined") return;
  if (!location) {
    sessionStorage.removeItem(PENDING_LOCATION_KEY);
    return;
  }
  sessionStorage.setItem(PENDING_LOCATION_KEY, JSON.stringify(location));
}

function todayFlushKey() {
  const d = new Date();
  return `${FLUSHED_CHECK_IN_KEY}-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function hasFlushedCheckInToday() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(todayFlushKey()) === "1";
}

function markFlushedCheckInToday() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(todayFlushKey(), "1");
}

async function writePendingLocationCheckIn(location: PendingLocation) {
  const res = await fetch("/api/sales-log/check-ins", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      checkInMode: "without_customer",
      latitude: location.latitude,
      longitude: location.longitude,
      locationText: location.locationText || location.addressLabel,
      addressProvince: location.addressProvince,
      addressCity: location.addressCity,
      addressDistrict: location.addressDistrict,
      addressStreet: location.addressStreet,
      notes: AUTO_DAILY_LOG_CHECK_IN_NOTES,
      completeInteractionNow: false,
    }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "定位打卡写入失败");
  }
}

type Props = {
  /** 拟稿确认时自动定位并在提交后打卡（移动端默认开启） */
  enableLocationAssist?: boolean;
  /** 页面标题 */
  title?: string;
  /** 副标题说明 */
  subtitle?: string;
  className?: string;
};

export function SalesLogAiChat({
  enableLocationAssist = false,
  title = "今日销售日志",
  subtitle,
  className,
}: Props) {
  const inWeCom = isWeComClient();
  const { ready: wecomReady, error: wecomError, getLocation, startVoiceRecord, stopVoiceRecord } =
    useWeComSdk(inWeCom);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<{ role: string; content: string }[]>([]);
  const sessionBootstrapped = useRef(false);
  const loadDayRef = useRef<(date: string) => Promise<void>>(async () => undefined);
  const checkInFlushingRef = useRef(false);
  const autoLocatingRef = useRef(false);
  const locationAttachedForMessageIdRef = useRef<string | null>(null);
  const wecomReadyRef = useRef(wecomReady);
  const getLocationRef = useRef(getLocation);
  const setMessagesRef = useRef<(messages: Message[] | ((messages: Message[]) => Message[])) => void>(
    () => undefined
  );
  const syncConversationRef = useRef<(items: { role: string; content: string }[]) => Promise<void>>(
    async () => undefined
  );
  const selectedDateRef = useRef(formatLogDateParam(new Date()));
  const pendingConfirmCheckRef = useRef(false);

  useEffect(() => {
    wecomReadyRef.current = wecomReady;
    getLocationRef.current = getLocation;
  }, [wecomReady, getLocation]);

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
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null);
  const [locatingForConfirm, setLocatingForConfirm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => formatLogDateParam(new Date()));
  const [dateBounds] = useState(() => conversationDateBounds());
  const todayDateKey = dateBounds.max;
  const [submitGap, setSubmitGap] = useState(false);
  const [ensureSubmitting, setEnsureSubmitting] = useState(false);
  const [readOnlyDay, setReadOnlyDay] = useState(false);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    setPendingLocation(loadPendingLocation());
  }, []);

  const flushPendingCheckInIfNeeded = useCallback(async (status: DailyLogStatus) => {
    if (!enableLocationAssist) return;
    if (status !== "SUBMITTED" && status !== "RISK_SUBMITTED") return;
    // 先占锁，避免 sync 并发各写一条
    if (checkInFlushingRef.current) return;
    if (hasFlushedCheckInToday()) return;
    checkInFlushingRef.current = true;

    try {
      // 以「确认写入日报」当下的 GPS 与请求 IP 比对，不沿用拟稿时的旧定位
      let location: PendingLocation | null = null;
      try {
        if (inWeCom && !wecomReadyRef.current) {
          await new Promise((r) => setTimeout(r, 600));
        }
        location = await captureMobileLocation({
          wecomReady: wecomReadyRef.current,
          getWeComLocation: getLocationRef.current,
        });
        savePendingLocation(location);
        setPendingLocation(location);
      } catch {
        location = loadPendingLocation();
      }
      if (!location) {
        setSyncHint("今日日报已写入系统（提交时未能重新定位，可到「往来打卡」补录）");
        return;
      }

      await writePendingLocationCheckIn(location);
      markFlushedCheckInToday();
      savePendingLocation(null);
      setPendingLocation(null);
      setSyncHint("今日日报已写入系统，定位打卡已一并完成");
    } catch (e) {
      setSyncHint(
        e instanceof Error
          ? `日报已提交，但定位打卡失败：${e.message}`
          : "日报已提交，但定位打卡失败，请到「往来打卡」补录"
      );
    } finally {
      checkInFlushingRef.current = false;
    }
  }, [enableLocationAssist, inWeCom]);

  const syncConversation = useCallback(
    async (items: { role: string; content: string }[]) => {
      try {
        const res = await fetch("/api/mobile/log/sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedDateRef.current,
            messages: items.filter((m) => m.content?.trim()),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status?: DailyLogStatus };
        if (data.status) {
          setLogStatus(data.status);
          if (data.status === "SUBMITTED" || data.status === "RISK_SUBMITTED") {
            setSubmitGap(false);
            setSyncHint((prev) => prev ?? "日报已写入系统");
            void flushPendingCheckInIfNeeded(data.status);
          } else if (pendingConfirmCheckRef.current) {
            pendingConfirmCheckRef.current = false;
            // 用户刚确认，但库里仍未提交 → Agent 可能谎称成功
            setSubmitGap(true);
            setChatError(
              "你已确认，但日报尚未写入系统。请点下方「补交日报」完成写入，或再发一次「确认」。"
            );
          }
        }
      } catch {
        // 同步失败不阻断对话
      }
    },
    [flushPendingCheckInIfNeeded]
  );

  useEffect(() => {
    syncConversationRef.current = syncConversation;
  }, [syncConversation]);

  const attachLocationForDraft = useCallback(
    async (draftMessageId: string) => {
      if (!enableLocationAssist) return;
      if (locationAttachedForMessageIdRef.current === draftMessageId) return;
      if (autoLocatingRef.current) return;
      autoLocatingRef.current = true;
      locationAttachedForMessageIdRef.current = draftMessageId;
      setLocatingForConfirm(true);
      setInputActionHint("确认日志前，正在自动获取定位…");

      const applyLocationMessage = (content: string) => {
        setMessagesRef.current((prev) => {
          if (prev.some((m) => m.id.startsWith("auto-location-"))) {
            return prev.map((m) =>
              m.id.startsWith("auto-location-") ? { ...m, content } : m
            );
          }
          return [
            ...prev,
            {
              id: `auto-location-${Date.now()}`,
              role: "assistant" as const,
              content,
            },
          ];
        });
        window.setTimeout(() => {
          void syncConversationRef.current(messagesRef.current);
        }, 50);
      };

      try {
        if (inWeCom && !wecomReadyRef.current) {
          await new Promise((r) => setTimeout(r, 800));
        }
        const loc = await captureMobileLocation({
          wecomReady: wecomReadyRef.current,
          getWeComLocation: getLocationRef.current,
        });
        savePendingLocation(loc);
        setPendingLocation(loc);
        applyLocationMessage(
          [
            `已自动获取当前位置：${loc.addressLabel}`,
            "请与上方完整日志一并核对。确认没问题后回复「确认」，我会帮你记进系统，并同时完成定位打卡。",
          ].join("\n")
        );
        setInputActionHint("已附上定位，确认日志后将一并打卡");
      } catch (e) {
        locationAttachedForMessageIdRef.current = null;
        const message = formatLocationCaptureError(e);
        setInputActionHint(`自动定位失败：${message}（仍可确认写入日志，稍后补打卡）`);
        applyLocationMessage(
          `未能自动获取定位（${message}）。你仍可确认上方日志内容；写入后如需补定位，请到「往来打卡」补录。`
        );
      } finally {
        autoLocatingRef.current = false;
        setLocatingForConfirm(false);
      }
    },
    [inWeCom, enableLocationAssist]
  );

  const attachLocationForDraftRef = useRef(attachLocationForDraft);
  useEffect(() => {
    attachLocationForDraftRef.current = attachLocationForDraft;
  }, [attachLocationForDraft]);

  const { messages, append, isLoading, setMessages, error } = useChat({
    api: "/api/mobile/log/chat",
    credentials: "include",
    onError: (err) => {
      console.error("sales log chat error:", err);
    },
    onFinish: (message) => {
      void syncConversationRef.current(messagesRef.current);
      if (message.role === "assistant" && isSalesLogDraftConfirmationRequest(message.content)) {
        void attachLocationForDraftRef.current(message.id);
      }
    },
    experimental_prepareRequestBody: ({ messages: chatMessages }) => ({
      date: selectedDateRef.current,
      messages: chatMessages
        .filter((m) => m.id !== "opening" && !m.id.startsWith("auto-location-") && m.content?.trim())
        .map(({ role, content }) => ({ role, content })),
    }),
  });

  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  useEffect(() => {
    messagesRef.current = messages.map((m) => ({ role: m.role, content: m.content }));
  }, [messages]);

  const lastMessageContent = messages[messages.length - 1]?.content ?? "";

  useEffect(() => {
    const behavior = messages.length <= 2 ? "auto" : "smooth";
    const id = requestAnimationFrame(() => scrollToBottom(behavior));
    return () => cancelAnimationFrame(id);
  }, [messages, isLoading, chatError, syncHint, locatingForConfirm, scrollToBottom]);

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
    sessionBootstrapped.current = true;

    async function bootstrap() {
      try {
        await loadDay(selectedDateRef.current);
      } catch {
        setMessages([
          {
            id: "opening",
            role: "assistant",
            content: SALES_LOG_OPENING_MESSAGE,
          },
        ]);
      }
    }

    async function loadDay(date: string) {
      const res = await fetch(
        `/api/mobile/log/sync?date=${encodeURIComponent(date)}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      const status = data?.log?.status as DailyLogStatus | undefined;
      if (status) setLogStatus(status);
      else setLogStatus("IN_PROGRESS");

      const submitted =
        status === "SUBMITTED" || status === "RISK_SUBMITTED";
      // 仅当日可继续对话改写；历史日一律只读
      const isToday = date === todayDateKey;
      setReadOnlyDay(!isToday);
      setSubmitGap(false);
      setChatError(null);
      setSyncHint(
        submitted && isToday
          ? "该日日报已提交，可继续对话改写并再次确认写入"
          : null
      );

      const saved = (data?.log?.conversation ?? []) as { role: string; content: string }[];
      if (saved.length > 0) {
        setMessages(
          saved.map((m, i) => ({
            id: `restored-${date}-${i}`,
            role: m.role as "user" | "assistant" | "system" | "data",
            content: m.content,
          }))
        );
        if (submitted && isToday) {
          void flushPendingCheckInIfNeeded(status ?? null);
        } else if (!submitted) {
          const lastAssistant = [...saved].reverse().find((m) => m.role === "assistant");
          if (lastAssistant && isSalesLogDraftConfirmationRequest(lastAssistant.content)) {
            void attachLocationForDraftRef.current(`restored-draft-${date}`);
          }
        }
        return;
      }

      if (submitted) {
        const report = data?.log?.dailyReport?.trim();
        setMessages([
          {
            id: `submitted-${date}`,
            role: "assistant",
            content: report
              ? isToday
                ? `该日日报已提交。如需改写，请继续对话说明要调整的内容。\n\n${report}`
                : `该日日报已提交（只读）。\n\n${report}`
              : isToday
                ? "该日日报已提交。如需改写，请继续对话。"
                : "该日日报已提交，历史记录只读。",
          },
        ]);
        if (isToday) {
          void flushPendingCheckInIfNeeded(status ?? null);
        }
        return;
      }

      if (!isToday) {
        setMessages([
          {
            id: `readonly-${date}`,
            role: "assistant",
            content: "该日暂无对话记录。历史日期仅可查看，请切回今天继续写日报。",
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
    }

    void bootstrap();
    loadDayRef.current = loadDay;
  }, [setMessages, flushPendingCheckInIfNeeded]);

  async function switchDate(date: string) {
    if (date === selectedDate) return;
    setSelectedDate(date);
    selectedDateRef.current = date;
    setInput("");
    try {
      await loadDayRef.current(date);
    } catch {
      setChatError("加载该日对话失败，请重试");
    }
  }

  async function handleEnsureSubmit() {
    setEnsureSubmitting(true);
    setChatError(null);
    try {
      // 先把当前对话同步上去，便于服务端抽拟稿
      await syncConversation(messagesRef.current);
      const res = await fetch("/api/mobile/log/ensure-submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDateRef.current }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        status?: DailyLogStatus;
        message?: string;
      } | null;
      if (!res.ok) {
        setChatError(data?.error ?? "补交失败，请稍后重试");
        return;
      }
      setSubmitGap(false);
      if (data?.status) setLogStatus(data.status);
      setSyncHint(data?.message ?? "日报已写入系统");
      setReadOnlyDay(true);
      void flushPendingCheckInIfNeeded(data?.status ?? "SUBMITTED");
    } catch {
      setChatError("补交请求失败，请检查网络后重试");
    } finally {
      setEnsureSubmitting(false);
    }
  }

  function appendToInput(text: string) {
    setInput((prev) => (prev ? `${prev}\n${text}` : text));
  }

  /** PC 端回车发送；手机端保留回车换行（仍可用 Shift+回车换行） */
  const enterToSend = !enableLocationAssist;

  function sendCurrentInput() {
    const text = input.trim();
    if (!text || isLoading || readOnlyDay) return;
    setChatError(null);
    if (isSalesLogUserConfirmMessage(text)) {
      pendingConfirmCheckRef.current = true;
    }
    append({ role: "user", content: text });
    setInput("");
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendCurrentInput();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!enterToSend) return;
    if (e.key !== "Enter" || e.shiftKey) return;
    // 中文等输入法组字中勿触发发送
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    sendCurrentInput();
  }

  const resolvedSubtitle =
    subtitle ??
    (enableLocationAssist
      ? inWeCom
        ? "企业微信 · AI 助理"
        : "口述今日工作 · AI 整理日报"
      : "与 AI 助理对话整理今日日报");

  return (
    <div className={`flex h-full flex-col overflow-hidden bg-background ${className ?? ""}`}>
      <header className="shrink-0 border-b bg-card p-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold">{title}</h1>
            <p className="text-xs text-muted-foreground">
              {resolvedSubtitle}
              {logStatus ? ` · ${STATUS_LABEL[logStatus]}` : ""}
              {readOnlyDay ? " · 只读" : ""}
            </p>
          </div>
        </div>
        <MobileDateNav
          value={selectedDate}
          min={dateBounds.min}
          max={dateBounds.max}
          onChange={(date) => void switchDate(date)}
          className="mt-3"
        />
        {syncHint && (
          <p className="mt-2 rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 dark:bg-green-950 dark:text-green-300">
            {syncHint}
          </p>
        )}
        {submitGap ? (
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <p>确认后日报未写入。可一键根据对话拟稿补交，避免口头「已提交」但库里没有。</p>
            <Button
              type="button"
              size="sm"
              className="mt-2 h-8"
              disabled={ensureSubmitting}
              onClick={() => void handleEnsureSubmit()}
            >
              {ensureSubmitting ? "正在补交…" : "补交日报"}
            </Button>
          </div>
        ) : null}
        {enableLocationAssist && locatingForConfirm ? (
          <p className="mt-2 text-xs text-muted-foreground">确认日志前，正在自动获取定位…</p>
        ) : null}
        {enableLocationAssist && pendingLocation && !locatingForConfirm ? (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            已附上定位，确认日志后一并打卡：
            <span className="font-medium">{pendingLocation.addressLabel}</span>
          </div>
        ) : null}
        {enableLocationAssist && inWeCom && wecomError && (
          <p className="mt-2 text-xs text-orange-600">SDK: {wecomError}</p>
        )}
      </header>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-6"
      >
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
        {isLoading && <p className="text-sm text-muted-foreground">助理正在整理…</p>}
        {chatError && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {chatError}
          </p>
        )}
        <div ref={messagesEndRef} aria-hidden className="h-px shrink-0 scroll-mt-4" />
      </div>

      <form
        onSubmit={handleSend}
        className="shrink-0 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {readOnlyDay ? (
          <p className="mb-2 text-center text-xs text-muted-foreground">
            历史日期只读，仅当日可继续对话改写日报。
          </p>
        ) : null}
        {inputActionHint ? (
          <p className="mb-2 text-xs text-muted-foreground">{inputActionHint}</p>
        ) : null}
        <div className="flex items-end gap-2">
          <AutoResizeTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={
              readOnlyDay
                ? "该日已提交，仅可查看"
                : enterToSend
                  ? "口述今日拜访与外勤情况…（回车发送，Shift+回车换行）"
                  : "口述今日拜访与外勤情况…"
            }
            className="min-w-0 flex-1"
            disabled={isLoading || readOnlyDay}
            maxRows={8}
          />
          <Button
            type="submit"
            disabled={isLoading || readOnlyDay || !input.trim()}
            className="h-11 shrink-0"
          >
            发送
          </Button>
        </div>
        <div className="mt-3 flex justify-center">
          <VoiceInputButton
            disabled={isLoading || readOnlyDay}
            wecomReady={wecomReady}
            inWeCom={inWeCom}
            onStartWeComRecord={startVoiceRecord}
            onStopWeComRecord={stopVoiceRecord}
            onTranscript={appendToInput}
            onStatus={setInputActionHint}
            className="w-full"
          />
        </div>
      </form>
    </div>
  );
}
