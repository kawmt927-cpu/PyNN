"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import type { TeamWorkActivityItem } from "@/lib/today-work/team-work-activity";
import { kindLabel } from "@/lib/today-work/team-work-activity";
import {
  activityOpenMatches,
  parseActivityOpenParam,
  type ActivityOpenTarget,
} from "@/lib/today-work/activity-open";
import { formatPendingFollowUpRelativeLabel } from "@/lib/follow-ups/remaining-days";
import {
  dailyReportNeedsDetailDialog,
  dailyReportPlainPreview,
} from "@/lib/sales-log/daily-report-format";
import { DailyReportPreviewWithDialog } from "@/components/daily-reports/daily-report-preview-with-dialog";
import { DailyReportBody } from "@/components/daily-reports/daily-report-body";
import { DailyLogMakeupDialog } from "@/components/sales-log/daily-log-makeup-dialog";
import { cn } from "@/lib/utils";

const LEGACY_CRM_PREFIX = "【旧CRM】";
const LEGACY_CRM_PREFIX_RE = /^【旧CRM】\s*/;

/** 可序列化传给客户端组件（Date 为 ISO 字符串） */
export type TeamWorkActivityListItem = Omit<
  TeamWorkActivityItem,
  "at" | "nextFollowUpAt"
> & {
  at: Date | string;
  nextFollowUpAt?: Date | string | null;
};

function kindBadgeClass(kind: TeamWorkActivityItem["kind"]) {
  if (kind === "check_in") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  }
  if (kind === "follow_up") {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  }
  return "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200";
}

function formatFollowUpDetail(detail: string) {
  let text = detail.trim();
  let isLegacy = false;
  if (LEGACY_CRM_PREFIX_RE.test(text)) {
    text = text.replace(LEGACY_CRM_PREFIX_RE, "").trim();
    isLegacy = true;
  }
  if (text.endsWith(LEGACY_CRM_PREFIX)) {
    text = text.slice(0, -LEGACY_CRM_PREFIX.length).trim();
    isLegacy = true;
  }
  if (!isLegacy) return detail.trim();
  return text ? `${text} ${LEGACY_CRM_PREFIX}` : LEGACY_CRM_PREFIX;
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function ActivityJournalCard({
  item,
  customerBasePath = "/customers",
  open,
  forceExpandContent,
  currentUserId,
}: {
  item: TeamWorkActivityListItem;
  customerBasePath?: string;
  open: ActivityOpenTarget | null;
  forceExpandContent?: boolean;
  currentUserId?: string | null;
}) {
  const at = asDate(item.at);
  const isOpen = activityOpenMatches(item, open);
  const [expanded, setExpanded] = useState(Boolean(forceExpandContent || isOpen));
  const [makeupOpen, setMakeupOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setExpanded(true);
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const rawDetail =
    item.kind === "follow_up" && item.detail
      ? formatFollowUpDetail(item.detail)
      : item.detail;

  const customerName = item.customerName ?? (item.customerId ? item.title : null);
  const customerHref = item.customerId
    ? `${customerBasePath.replace(/\/$/, "")}/${item.customerId}`
    : null;

  const isDailyLog = item.kind === "daily_log";
  const isFollowUp = item.kind === "follow_up";
  const isCheckIn = item.kind === "check_in";
  const mergedWithCheckIn = isFollowUp && Boolean(item.checkInId);
  const pendingMakeup = Boolean(isDailyLog && item.logPendingMakeup);
  const canMakeup = pendingMakeup && Boolean(currentUserId && currentUserId === item.userId);
  // 未提交占位的 detail 是提示文案，不能当日报正文渲染
  const dailyContent =
    isDailyLog && !pendingMakeup ? rawDetail?.trim() ?? "" : "";
  const showDailyDialog = isDailyLog && dailyReportNeedsDetailDialog(dailyContent);

  const nextAt = item.nextFollowUpAt ? asDate(item.nextFollowUpAt) : null;
  const nextRelative = nextAt ? formatPendingFollowUpRelativeLabel(nextAt) : null;

  const headerParts: string[] = [];
  if (isFollowUp) {
    if (item.contactNames && item.contactNames.length > 0) {
      headerParts.push(item.contactNames.join("、"));
    }
    if (item.methodLabel) headerParts.push(item.methodLabel);
    headerParts.push(item.userName);
  } else if (isCheckIn) {
    if (item.contactNames?.[0] || item.subtitle?.startsWith("联系人")) {
      headerParts.push(item.contactNames?.[0] ?? item.subtitle.replace(/^联系人：/, ""));
    }
    headerParts.push(item.userName);
  } else {
    headerParts.push(item.userName);
    if (item.title) headerParts.push(item.title);
  }

  const content = rawDetail?.trim() ?? "";
  const longContent = content.length > 160;
  const showClamped = isFollowUp && longContent && !expanded;

  return (
    <li
      ref={ref}
      id={`activity-${item.kind}-${item.id}`}
      className={cn(
        "rounded-lg border bg-card p-4 text-sm shadow-sm transition-shadow",
        isOpen && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        pendingMakeup &&
          "border-orange-200 bg-orange-50/40 dark:border-orange-900 dark:bg-orange-950/20"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {mergedWithCheckIn ? (
              <>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass("follow_up")}`}>
                  往来
                </span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass("check_in")}`}>
                  打卡
                </span>
              </>
            ) : (
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass(item.kind)}`}>
                {kindLabel(item.kind)}
              </span>
            )}
            {isDailyLog && item.logLate ? (
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-950 dark:text-orange-200">
                迟交
              </span>
            ) : null}
            {isDailyLog && item.logPendingMakeup ? (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
                未提交
              </span>
            ) : null}
            {customerName ? (
              customerHref ? (
                <Link href={customerHref} className="font-medium text-primary hover:underline">
                  {customerName}
                </Link>
              ) : (
                <span className="font-medium">{customerName}</span>
              )
            ) : null}
          </div>
          <p className="font-medium text-foreground">{headerParts.filter(Boolean).join(" · ")}</p>
        </div>
        <time
          dateTime={at.toISOString()}
          className="shrink-0 text-sm tabular-nums text-muted-foreground"
        >
          {format(at, "yyyy-MM-dd HH:mm")}
        </time>
      </div>

      {pendingMakeup ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {item.detail ??
              "超时未交，系统已生成本条。点下方按钮打开补录对话框；补录后显示迟交，不改变统计。"}
          </p>
          {canMakeup ? (
            <>
              <button
                type="button"
                onClick={() => setMakeupOpen(true)}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground active:opacity-90"
              >
                补录日报
              </button>
              <DailyLogMakeupDialog
                open={makeupOpen}
                onOpenChange={setMakeupOpen}
                dailyLogId={item.id}
                date={item.dayKey}
                dayLabel={format(new Date(`${item.dayKey}T12:00:00`), "M月d日")}
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">仅本人可补录该日报。</p>
          )}
        </div>
      ) : isDailyLog && dailyContent ? (
        <div className="mt-3">
          {showDailyDialog ? (
            <DailyReportPreviewWithDialog
              userName={item.userName}
              title={item.title}
              subtitle={item.subtitle}
              meta={item.meta}
              content={dailyContent}
              preview={dailyReportPlainPreview(dailyContent)}
              defaultOpen={isOpen}
            />
          ) : (
            <DailyReportBody content={dailyContent} />
          )}
        </div>
      ) : content ? (
        <div className="mt-3">
          <p
            className={cn(
              "whitespace-pre-wrap text-sm leading-relaxed text-foreground",
              showClamped && "line-clamp-4"
            )}
          >
            {content}
          </p>
          {longContent && isFollowUp ? (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-primary"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "收起" : "展开全文"}
            </button>
          ) : null}
        </div>
      ) : null}

      {isFollowUp && item.result ? (
        <p className="mt-2 text-sm text-muted-foreground">结果：{item.result}</p>
      ) : null}

      {mergedWithCheckIn && item.checkInLocation ? (
        <p className="mt-2 text-sm text-muted-foreground">
          打卡地点：{item.checkInLocation}
          {item.checkInStatusLabel ? ` · ${item.checkInStatusLabel}` : ""}
        </p>
      ) : null}

      {isCheckIn && item.meta ? (
        <p className="mt-2 text-xs text-muted-foreground">{item.meta}</p>
      ) : null}

      {item.meta && !isCheckIn && !mergedWithCheckIn && !item.logPendingMakeup ? (
        <p className="mt-2 text-xs text-muted-foreground">{item.meta}</p>
      ) : null}

      {item.meta && mergedWithCheckIn ? (
        <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
      ) : null}

      {isFollowUp && nextAt && nextRelative ? (
        <div className="mt-3 rounded-md bg-orange-50 px-3 py-2 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
          <p className="text-sm font-medium">
            {[
              "下次跟进",
              nextRelative.label,
              item.nextFollowUpMethodLabel,
              format(nextAt, "yyyy-MM-dd HH:mm"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {item.nextFollowUpContent ? (
            <p className="mt-1 text-sm leading-relaxed opacity-90">{item.nextFollowUpContent}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function TeamWorkActivityFlatList({
  items,
  customerBasePath = "/customers",
  openParam,
  open,
  currentUserId,
}: {
  items: TeamWorkActivityListItem[];
  customerBasePath?: string;
  /** 原始 ?open= 字符串；与 open 二选一 */
  openParam?: string | null;
  open?: ActivityOpenTarget | null;
  currentUserId?: string | null;
}) {
  const resolvedOpen = open ?? parseActivityOpenParam(openParam ?? null);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">该时段暂无工作记录。</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <ActivityJournalCard
          key={`${item.kind}-${item.id}`}
          item={item}
          customerBasePath={customerBasePath}
          open={resolvedOpen}
          currentUserId={currentUserId}
        />
      ))}
    </ul>
  );
}

export function TeamWorkActivityGroupedList({
  groups,
  customerBasePath = "/customers",
  openParam,
  open,
  currentUserId,
}: {
  groups: {
    dayKey: string;
    dayLabel: string;
    stats: { checkIns: number; followUps: number; logsSubmitted: number };
    items: TeamWorkActivityListItem[];
  }[];
  customerBasePath?: string;
  openParam?: string | null;
  open?: ActivityOpenTarget | null;
  currentUserId?: string | null;
}) {
  const resolvedOpen = open ?? parseActivityOpenParam(openParam ?? null);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">该时段暂无工作记录。</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.dayKey} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <h3 className="text-sm font-semibold">{group.dayLabel}</h3>
            <p className="text-xs text-muted-foreground">
              打卡 {group.stats.checkIns} · 往来 {group.stats.followUps} · 日报{" "}
              {group.stats.logsSubmitted}
            </p>
          </div>
          {group.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">当日无记录</p>
          ) : (
            <ul className="space-y-3">
              {group.items.map((item) => (
                <ActivityJournalCard
                  key={`${group.dayKey}-${item.kind}-${item.id}`}
                  item={item}
                  customerBasePath={customerBasePath}
                  open={resolvedOpen}
                  currentUserId={currentUserId}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

const PREVIEW_COUNT = 5;

export function MobileExpandableActivityFeed({
  items,
  customerBasePath = "/mobile/customers",
  previewCount = PREVIEW_COUNT,
  openParam,
  currentUserId,
}: {
  items: TeamWorkActivityListItem[];
  customerBasePath?: string;
  previewCount?: number;
  openParam?: string | null;
  currentUserId?: string | null;
}) {
  const open = useMemo(() => parseActivityOpenParam(openParam ?? null), [openParam]);
  const openIndex = useMemo(() => {
    if (!open) return -1;
    return items.findIndex((item) => activityOpenMatches(item, open));
  }, [items, open]);

  const [expanded, setExpanded] = useState(openIndex >= previewCount);

  useEffect(() => {
    if (openIndex >= previewCount) setExpanded(true);
  }, [openIndex, previewCount]);

  const needsMore = items.length > previewCount;
  const visible = expanded || !needsMore ? items : items.slice(0, previewCount);

  return (
    <div className="space-y-3">
      <TeamWorkActivityFlatList
        items={visible}
        customerBasePath={customerBasePath}
        open={open}
        currentUserId={currentUserId}
      />
      {needsMore && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center rounded-xl border border-dashed bg-card px-4 py-3 text-sm font-medium text-primary active:bg-muted/60"
        >
          更多（还有 {items.length - previewCount} 条，展开后可滚动查看）
        </button>
      ) : null}
      {expanded && needsMore ? (
        <p className="text-center text-xs text-muted-foreground">已全部展开，可继续滑动浏览</p>
      ) : null}
    </div>
  );
}
