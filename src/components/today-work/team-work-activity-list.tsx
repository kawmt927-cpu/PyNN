import Link from "next/link";
import { format } from "date-fns";
import type { TeamWorkActivityItem, TeamWorkDayGroup } from "@/lib/today-work/team-work-activity";
import { kindLabel } from "@/lib/today-work/team-work-activity";
import {
  dailyReportNeedsDetailDialog,
  dailyReportPlainPreview,
} from "@/lib/sales-log/daily-report-format";
import { DailyReportPreviewWithDialog } from "@/components/daily-reports/daily-report-preview-with-dialog";
import { DailyReportBody } from "@/components/daily-reports/daily-report-body";

const LEGACY_CRM_PREFIX = "【旧CRM】";
const LEGACY_CRM_PREFIX_RE = /^【旧CRM】\s*/;

/** 可序列化传给客户端组件（at 为 ISO 字符串） */
export type TeamWorkActivityListItem = Omit<TeamWorkActivityItem, "at"> & {
  at: Date | string;
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

/** 旧 CRM 标记放到文末展示 */
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

function ActivityRow({
  item,
  customerBasePath = "/customers",
}: {
  item: TeamWorkActivityListItem;
  customerBasePath?: string;
}) {
  const at = asDate(item.at);
  const rawDetail =
    item.kind === "follow_up" && item.detail
      ? formatFollowUpDetail(item.detail)
      : item.detail;

  const customerName = item.customerName ?? (item.customerId ? item.title : null);
  const showCustomerInHeader = Boolean(customerName);
  const customerHref = item.customerId
    ? `${customerBasePath.replace(/\/$/, "")}/${item.customerId}`
    : null;

  const isDailyLog = item.kind === "daily_log";
  const dailyContent = isDailyLog ? rawDetail?.trim() ?? "" : "";
  const showDailyDialog = isDailyLog && dailyReportNeedsDetailDialog(dailyContent);

  return (
    <li className="rounded-md border bg-card p-3 text-sm shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${kindBadgeClass(item.kind)}`}>
              {kindLabel(item.kind)}
            </span>
            <span className="font-medium text-foreground">{item.userName}</span>
            {showCustomerInHeader ? (
              <>
                <span className="text-muted-foreground">·</span>
                {customerHref ? (
                  <Link href={customerHref} className="font-medium text-primary hover:underline">
                    {customerName}
                  </Link>
                ) : (
                  <span className="font-medium">{customerName}</span>
                )}
              </>
            ) : isDailyLog ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{item.title}</span>
              </>
            ) : null}
          </div>

          {item.subtitle ? (
            <p className="text-sm text-muted-foreground">{item.subtitle}</p>
          ) : null}

          {isDailyLog && dailyContent ? (
            showDailyDialog ? (
              <DailyReportPreviewWithDialog
                userName={item.userName}
                title={item.title}
                subtitle={item.subtitle}
                meta={item.meta}
                content={dailyContent}
                preview={dailyReportPlainPreview(dailyContent)}
              />
            ) : (
              <DailyReportBody content={dailyContent} />
            )
          ) : rawDetail ? (
            <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {rawDetail}
            </p>
          ) : null}

          {item.meta ? <p className="text-sm text-muted-foreground">{item.meta}</p> : null}
        </div>
        <time
          dateTime={at.toISOString()}
          className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-foreground"
        >
          {format(at, isDailyLog ? "MM-dd HH:mm" : "HH:mm")}
        </time>
      </div>
    </li>
  );
}

export function TeamWorkActivityFlatList({
  items,
  customerBasePath = "/customers",
}: {
  items: TeamWorkActivityListItem[];
  customerBasePath?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">该时段暂无工作记录。</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <ActivityRow
          key={`${item.kind}-${item.id}`}
          item={item}
          customerBasePath={customerBasePath}
        />
      ))}
    </ul>
  );
}

export function TeamWorkActivityGroupedList({
  groups,
  customerBasePath = "/customers",
}: {
  groups: TeamWorkDayGroup[];
  customerBasePath?: string;
}) {
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
                <ActivityRow
                  key={`${group.dayKey}-${item.kind}-${item.id}`}
                  item={item}
                  customerBasePath={customerBasePath}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
