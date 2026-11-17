"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { OpportunityStatus } from "@prisma/client";
import type { ConfigOptionItem } from "@/lib/config-options";
import { labelForConfig } from "@/lib/config-options";
import {
  buildOpportunityListHref,
  nextOpportunityListSort,
  type OpportunityListFilters,
  type OpportunityListSort,
  type OpportunityListSortColumn,
} from "@/lib/opportunities/list-filters";
import { sortOpportunitiesWithVisits } from "@/lib/opportunities/list-sort";
import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";
import {
  formatAbsoluteDate,
  formatRelativeDayLabel,
} from "@/lib/opportunities/relative-day";
import { formatAmountInWan } from "@/lib/opportunities/funnel";
import { OPPORTUNITY_STATUS_LABELS } from "@/lib/permissions";
import { withReturnTo } from "@/lib/navigation/return-to";
import { requestWorkspaceSyncHref } from "@/components/workspace/workspace-tabs-context";
import { withEmbedParam } from "@/lib/workspace/tab-keys";
import { OpportunityListFilters as OpportunityListFiltersPanel } from "@/components/opportunities/opportunity-list-filters";
import { OpportunityStatusCheckboxes } from "@/components/opportunities/opportunity-status-checkboxes";
import { OpportunityGradeIcon } from "@/components/opportunities/opportunity-grade-icon";
import { OpportunityRowActions } from "@/components/opportunities/opportunity-row-actions";
import { OpportunitySortableTh } from "@/components/opportunities/opportunity-sortable-th";
import { WorkspaceEntityLink } from "@/components/workspace/workspace-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type OpportunityListRow = {
  id: string;
  title: string;
  status: OpportunityStatus;
  stage: string;
  grade: string | null;
  expectedAmount: number;
  expectedCloseDate: string;
  createdAt: string;
  customer: { id: string; name: string } | null;
  owner: { id: string; name: string };
  canEdit: boolean;
  canFollowUp: boolean;
  canSign: boolean;
  canAbandon: boolean;
  canRestore: boolean;
  canAddQuote: boolean;
  canAssign: boolean;
};

export type OpportunityListVisit = {
  lastVisitAt: string | null;
  lastVisitContent: string | null;
  nextVisitAt: string | null;
  nextVisitContent: string | null;
  nextVisitFromGrade: boolean;
};

type Props = {
  title: string;
  emptyMessage: string;
  filters: OpportunityListFilters;
  initialSort: OpportunityListSort;
  rows: OpportunityListRow[];
  visits: Record<string, OpportunityListVisit>;
  stageOrder: Record<string, number>;
  stageLabels: Record<string, string>;
  gradeLabels: Record<string, string>;
  stageOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  showOwnerFilter: boolean;
  salesUsers: Array<{ id: string; name: string }>;
};

function VisitRelativeCell({
  at,
  detail,
  fromGrade,
}: {
  at: string | null | undefined;
  detail?: string | null;
  fromGrade?: boolean;
}) {
  if (!at) return "—";
  const date = new Date(at);
  const absolute = formatAbsoluteDate(date);
  const parts = [
    fromGrade ? `星级周期 ${absolute}` : absolute,
    detail?.trim() || null,
  ].filter(Boolean);
  return (
    <span className="cursor-default" title={parts.join("\n")}>
      {formatRelativeDayLabel(date)}
    </span>
  );
}

function syncSortUrl(filters: OpportunityListFilters, sort: OpportunityListSort) {
  const href = buildOpportunityListHref(filters, sort);
  try {
    const inEmbed = typeof window !== "undefined" && window.parent !== window;
    const target = inEmbed ? withEmbedParam(href) : href;
    window.history.replaceState(window.history.state ?? null, "", target);
    if (inEmbed) requestWorkspaceSyncHref(href);
  } catch {
    // ignore
  }
}

export function OpportunityListPanel({
  title,
  emptyMessage,
  filters,
  initialSort,
  rows,
  visits,
  stageOrder,
  stageLabels,
  gradeLabels,
  stageOptions,
  gradeOptions,
  showOwnerFilter,
  salesUsers,
}: Props) {
  const [sort, setSort] = useState(initialSort);

  // 筛选变更（服务端刷新）后对齐 URL 上的 sort
  useEffect(() => {
    setSort(initialSort);
  }, [
    initialSort.column,
    initialSort.dir,
    filters.q,
    filters.statuses.join(","),
    filters.stages.join(","),
    filters.grades.join(","),
    filters.ownerIds.join(","),
  ]);

  const visitMap = useMemo(() => {
    const map = new Map<
      string,
      {
        lastVisitAt: Date | null;
        lastVisitContent: string | null;
        nextVisitAt: Date | null;
        nextVisitContent: string | null;
        nextVisitFromGrade: boolean;
      }
    >();
    for (const [id, visit] of Object.entries(visits)) {
      map.set(id, {
        lastVisitAt: visit.lastVisitAt ? new Date(visit.lastVisitAt) : null,
        lastVisitContent: visit.lastVisitContent,
        nextVisitAt: visit.nextVisitAt ? new Date(visit.nextVisitAt) : null,
        nextVisitContent: visit.nextVisitContent,
        nextVisitFromGrade: visit.nextVisitFromGrade,
      });
    }
    return map;
  }, [visits]);

  const sortableRows = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        expectedCloseDate: new Date(row.expectedCloseDate),
        createdAt: new Date(row.createdAt),
      })),
    [rows]
  );

  const opportunities = useMemo(
    () => sortOpportunitiesWithVisits(sortableRows, sort, visitMap, stageOrder),
    [sortableRows, sort, visitMap, stageOrder]
  );

  const listPath = buildOpportunityListHref(filters, sort);

  function handleSort(column: OpportunityListSortColumn) {
    const next = nextOpportunityListSort(sort, column);
    setSort(next);
    syncSortUrl(filters, next);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-lg">
          {title}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            ({opportunities.length})
          </span>
        </CardTitle>
        <OpportunityStatusCheckboxes filters={filters} sort={sort} />
      </CardHeader>
      <CardContent className="space-y-4">
        <OpportunityListFiltersPanel
          filters={filters}
          sort={sort}
          stageOptions={stageOptions}
          gradeOptions={gradeOptions}
          showOwnerFilter={showOwnerFilter}
          salesUsers={salesUsers}
        />

        {opportunities.length === 0 ? (
          <p className="text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">销售对象</th>
                  <OpportunitySortableTh
                    label="录入时间"
                    column="createdAt"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <OpportunitySortableTh
                    label="等级"
                    column="grade"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <OpportunitySortableTh
                    label="预计金额"
                    column="amount"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <OpportunitySortableTh
                    label="阶段"
                    column="stage"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <OpportunitySortableTh
                    label="预计成交"
                    column="expectedClose"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <OpportunitySortableTh
                    label="上次拜访"
                    column="lastVisit"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <OpportunitySortableTh
                    label="下次拜访"
                    column="nextVisit"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <th className="pb-2 pr-4">状态</th>
                  <th className="pb-2 pr-4">负责销售</th>
                  <th className="pb-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opp) => {
                  const visit = visits[opp.id];
                  const customerLabel = opp.customer?.name ?? "未关联客户";
                  return (
                    <tr key={opp.id} className="border-b">
                      <td className="py-3 pr-4 font-medium">
                        <WorkspaceEntityLink
                          kind="opportunity"
                          id={opp.id}
                          href={withReturnTo(`/opportunities/${opp.id}`, listPath)}
                          title={opp.title}
                          className="text-primary hover:underline"
                        >
                          <span title={opp.title}>{customerLabel}</span>
                        </WorkspaceEntityLink>
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                        {format(opp.createdAt, "yyyy-MM-dd")}
                      </td>
                      <td className="py-3 pr-4">
                        <OpportunityGradeIcon
                          grade={opp.grade}
                          size="sm"
                          labelMap={gradeLabels}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        {formatAmountInWan(opp.expectedAmount)}
                      </td>
                      <td className="py-3 pr-4">
                        {labelForConfig(stageLabels, opp.stage)}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">
                        {formatExpectedCloseMonth(opp.expectedCloseDate)}
                      </td>
                      <td className="py-3 pr-4">
                        <VisitRelativeCell
                          at={visit?.lastVisitAt}
                          detail={visit?.lastVisitContent}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <VisitRelativeCell
                          at={visit?.nextVisitAt}
                          detail={visit?.nextVisitContent}
                          fromGrade={visit?.nextVisitFromGrade}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        {OPPORTUNITY_STATUS_LABELS[opp.status]}
                      </td>
                      <td className="py-3 pr-4">{opp.owner.name}</td>
                      <td className={cn("py-3")}>
                        <OpportunityRowActions
                          opportunityId={opp.id}
                          customerId={opp.customer?.id}
                          returnTo={listPath}
                          canEdit={opp.canEdit}
                          canFollowUp={opp.canFollowUp}
                          canSign={opp.canSign}
                          canAbandon={opp.canAbandon}
                          canManageStatus={opp.canRestore}
                          canAddQuote={opp.canAddQuote}
                          canAssign={opp.canAssign}
                          isAbandoned={opp.status === "ABANDONED"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
