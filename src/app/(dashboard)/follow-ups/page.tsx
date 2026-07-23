import { getCustomerGradeLabelMap } from "@/lib/config-options";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowUpPendingTable } from "@/components/follow-ups/follow-up-pending-table";
import { UpcomingWindowFilter } from "@/components/follow-ups/upcoming-window-filter";
import {
  CustomerListPageNumbers,
  CustomerListPagination,
} from "@/components/customers/customer-list-pagination";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import { parseUpcomingWindow } from "@/lib/follow-ups/upcoming-window";
import {
  FOLLOW_UP_LIST_PAGE_SIZE,
  buildFollowUpsHref,
  followUpListPageCount,
  parseFollowUpListPage,
  sliceFollowUpPage,
} from "@/lib/follow-ups/list-pagination";

/** 合并多源后内存分页，取足够大以保证总数准确 */
const FETCH_TAKE = 5_000;

type Props = {
  searchParams: Promise<{ window?: string; duePage?: string; upcomingPage?: string }>;
};

export default async function FollowUpsPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const query = await searchParams;
  const now = new Date();
  const upcomingWindow = parseUpcomingWindow(query.window);
  const pageSize = FOLLOW_UP_LIST_PAGE_SIZE;

  const [dueFollowUps, upcomingFollowUps, gradeLabels] = await Promise.all([
    getPendingFollowUps(session.user.role, session.user.id, "due", now, FETCH_TAKE),
    getPendingFollowUps(session.user.role, session.user.id, "upcoming", now, FETCH_TAKE, {
      withinDays: upcomingWindow.withinDays,
    }),
    getCustomerGradeLabelMap(),
  ]);

  const dueTotal = dueFollowUps.length;
  const upcomingTotal = upcomingFollowUps.length;
  const dueTotalPages = followUpListPageCount(dueTotal, pageSize);
  const upcomingTotalPages = followUpListPageCount(upcomingTotal, pageSize);
  const duePage = Math.min(parseFollowUpListPage(query.duePage), dueTotalPages);
  const upcomingPage = Math.min(parseFollowUpListPage(query.upcomingPage), upcomingTotalPages);

  const duePageItems = sliceFollowUpPage(dueFollowUps, duePage, pageSize);
  const upcomingPageItems = sliceFollowUpPage(upcomingFollowUps, upcomingPage, pageSize);

  const listPath = buildFollowUpsHref({
    window: upcomingWindow.value,
    duePage,
    upcomingPage,
  });

  const dueHref = (page: number) =>
    buildFollowUpsHref({
      window: upcomingWindow.value,
      duePage: page,
      upcomingPage,
    });
  const upcomingHref = (page: number) =>
    buildFollowUpsHref({
      window: upcomingWindow.value,
      duePage,
      upcomingPage: page,
    });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">待跟进</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-orange-600">
            已到期（{dueTotal}）
            {dueTotal > pageSize ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                每页 {pageSize} 条
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {dueTotal === 0 ? (
            <p className="text-muted-foreground">暂无到期跟进任务。</p>
          ) : (
            <>
              <FollowUpPendingTable
                items={duePageItems}
                listPath={listPath}
                gradeLabels={gradeLabels}
                now={now}
              />
              <CustomerListPagination
                page={duePage}
                totalPages={dueTotalPages}
                total={dueTotal}
                pageSize={pageSize}
                hrefForPage={dueHref}
              />
              <CustomerListPageNumbers
                page={duePage}
                totalPages={dueTotalPages}
                hrefForPage={dueHref}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">
            即将到期（{upcomingTotal}）
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {upcomingWindow.label}内
              {upcomingTotal > pageSize ? ` · 每页 ${pageSize} 条` : ""}
            </span>
          </CardTitle>
          <UpcomingWindowFilter active={upcomingWindow.value} duePage={duePage} />
        </CardHeader>
        <CardContent className="space-y-4">
          {upcomingTotal === 0 ? (
            <p className="text-muted-foreground">暂无计划中的跟进。</p>
          ) : (
            <>
              <FollowUpPendingTable
                items={upcomingPageItems}
                listPath={listPath}
                gradeLabels={gradeLabels}
                now={now}
              />
              <CustomerListPagination
                page={upcomingPage}
                totalPages={upcomingTotalPages}
                total={upcomingTotal}
                pageSize={pageSize}
                hrefForPage={upcomingHref}
              />
              <CustomerListPageNumbers
                page={upcomingPage}
                totalPages={upcomingTotalPages}
                hrefForPage={upcomingHref}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
