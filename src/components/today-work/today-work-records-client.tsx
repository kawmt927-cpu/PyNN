"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  activityOpenMatches,
  parseActivityOpenParam,
  type ActivityOpenTarget,
} from "@/lib/today-work/activity-open";
import { formatPendingFollowUpRelativeLabel } from "@/lib/follow-ups/remaining-days";
import { cn } from "@/lib/utils";

export type TodayWorkRecordCard = {
  kind: "check_in" | "follow_up" | "daily_log";
  id: string;
  at: string;
  contactName: string | null;
  contactNames?: string[];
  customerId: string | null;
  customerName: string | null;
  summary: string;
  title?: string | null;
  methodLabel?: string | null;
  statusLabel?: string | null;
  needsAction?: boolean;
  opportunityTitle?: string | null;
  nextFollowUpAt?: string | null;
  nextFollowUpMethodLabel?: string | null;
  nextFollowUpContent?: string | null;
  /** 打卡合并往来时的往来正文 */
  followUpSummary?: string | null;
  followUpId?: string | null;
  followUpMethodLabel?: string | null;
  logSubmitted?: boolean;
  logLate?: boolean;
  logPendingMakeup?: boolean;
  makeupHref?: string | null;
  detail?: string | null;
};

function RecordCard({
  row,
  open,
}: {
  row: TodayWorkRecordCard;
  open: ActivityOpenTarget | null;
}) {
  const isCheckIn = row.kind === "check_in";
  const isDailyLog = row.kind === "daily_log";
  const merged = Boolean(row.followUpSummary);
  const openTarget =
    merged && row.followUpId
      ? ({ kind: "follow_up" as const, id: row.followUpId })
      : ({ kind: row.kind, id: row.id } as ActivityOpenTarget);
  const isOpen =
    activityOpenMatches({ kind: row.kind, id: row.id }, open) ||
    (merged && row.followUpId
      ? activityOpenMatches({ kind: "follow_up", id: row.followUpId }, open)
      : false);

  const [expanded, setExpanded] = useState(isOpen);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setExpanded(true);
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const contacts =
    row.contactNames && row.contactNames.length > 0
      ? row.contactNames
      : row.contactName
        ? [row.contactName]
        : [];
  const content = isDailyLog
    ? row.detail?.trim() || row.summary
    : merged
      ? row.followUpSummary!
      : row.summary;
  const longContent = content.length > 160;
  const nextAt = row.nextFollowUpAt ? new Date(row.nextFollowUpAt) : null;
  const nextRelative = nextAt ? formatPendingFollowUpRelativeLabel(nextAt) : null;

  return (
    <li
      ref={ref}
      id={`activity-${openTarget.kind}-${openTarget.id}`}
      className={cn(
        "rounded-lg border p-4 text-sm shadow-sm",
        isOpen && "ring-2 ring-primary ring-offset-2",
        isDailyLog && row.logPendingMakeup && "border-orange-200 bg-orange-50/40"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {isDailyLog ? (
              <>
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">
                  日报
                </span>
                {row.logLate ? (
                  <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-800">
                    迟交
                  </span>
                ) : null}
                {row.logPendingMakeup ? (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
                    未提交
                  </span>
                ) : null}
              </>
            ) : merged ? (
              <>
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                  往来
                </span>
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800">
                  打卡
                </span>
              </>
            ) : (
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  isCheckIn
                    ? "bg-blue-100 text-blue-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isCheckIn ? "打卡" : "往来"}
              </span>
            )}
            {isDailyLog ? (
              <span className="font-medium">{row.title ?? "今日日报"}</span>
            ) : row.customerName && row.customerId ? (
              <Link
                href={`/customers/${row.customerId}`}
                className="font-medium text-primary hover:underline"
              >
                {row.customerName}
              </Link>
            ) : (
              <span className="text-muted-foreground">{row.customerName ?? "无客户"}</span>
            )}
          </div>
          {!isDailyLog ? (
            <p className="font-medium">
              {[
                contacts.length > 0 ? contacts.join("、") : null,
                merged ? row.followUpMethodLabel : row.methodLabel,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : (
            <p className="font-medium text-muted-foreground">{row.summary}</p>
          )}
        </div>
        <time className="text-sm tabular-nums text-muted-foreground">
          {format(new Date(row.at), "yyyy-MM-dd HH:mm")}
        </time>
      </div>

      {isDailyLog && row.logPendingMakeup ? (
        <div className="mt-3 space-y-2">
          <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{content}</p>
          <Link
            href={row.makeupHref || "/today-work/daily-log"}
            className="inline-flex text-sm font-medium text-primary hover:underline"
          >
            点击补录日报 →
          </Link>
        </div>
      ) : (
        <>
          <p
            className={cn(
              "mt-3 whitespace-pre-wrap leading-relaxed",
              longContent && !expanded && "line-clamp-4"
            )}
          >
            {content}
          </p>
          {longContent ? (
            <button
              type="button"
              className="mt-1 text-xs font-medium text-primary"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "收起" : "展开全文"}
            </button>
          ) : null}
        </>
      )}

      {merged ? (
        <p className="mt-2 text-sm text-muted-foreground">打卡地点：{row.summary}</p>
      ) : null}

      {isCheckIn && row.statusLabel ? (
        <p className={`mt-1 text-xs ${row.needsAction ? "text-orange-600" : "text-green-600"}`}>
          {row.statusLabel}
        </p>
      ) : null}

      {row.opportunityTitle ? (
        <p className="mt-1 text-xs text-muted-foreground">商机：{row.opportunityTitle}</p>
      ) : null}

      {nextAt && nextRelative ? (
        <div className="mt-3 rounded-md bg-orange-50 px-3 py-2 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
          <p className="text-sm font-medium">
            {[
              "下次跟进",
              nextRelative.label,
              row.nextFollowUpMethodLabel,
              format(nextAt, "yyyy-MM-dd HH:mm"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {row.nextFollowUpContent ? (
            <p className="mt-1 text-sm opacity-90">{row.nextFollowUpContent}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function TodayWorkRecordsList({
  records,
  openParam,
}: {
  records: TodayWorkRecordCard[];
  openParam?: string | null;
}) {
  const open = parseActivityOpenParam(openParam ?? null);

  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">今日暂无工作记录。</p>;
  }

  return (
    <ul className="space-y-3">
      {records.map((row) => (
        <RecordCard key={`${row.kind}-${row.id}`} row={row} open={open} />
      ))}
    </ul>
  );
}

export function TodayWorkRecordsPanelClient({
  records,
  openParam,
}: {
  records: TodayWorkRecordCard[];
  openParam?: string | null;
}) {
  return (
    <Card id="today-work-records">
      <CardHeader>
        <CardTitle className="text-lg">今日工作记录</CardTitle>
        <p className="text-sm text-muted-foreground">今日打卡、往来与日报，按时间倒序</p>
      </CardHeader>
      <CardContent>
        <TodayWorkRecordsList records={records} openParam={openParam} />
      </CardContent>
    </Card>
  );
}
