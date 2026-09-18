import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { monthlyAssessmentMemberWhere } from "@/lib/sales/team-performance";
import {
  getSalesWorkReview,
  resolveWorkReviewRange,
} from "@/lib/admin/work-review";
import { WorkReviewFilters } from "@/components/admin/work-review-filters";
import { WorkReviewReport } from "@/components/admin/work-review-report";
import { resolveMonthlyUserId } from "@/lib/plans-tasks/metrics-scope";

type Props = {
  searchParams: Promise<{
    userId?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function WorkReviewPage({ searchParams }: Props) {
  const session = await requireRole(["ADMIN", "SALES_MANAGER"]);
  const query = await searchParams;
  const range = resolveWorkReviewRange(query);

  const users = await prisma.user.findMany({
    where: monthlyAssessmentMemberWhere(),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const userIds = users.map((u) => u.id);
  const userId = resolveMonthlyUserId(
    { monthlyUserId: query.userId },
    userIds,
    session.user.id
  );

  const report =
    userIds.length > 0 ? await getSalesWorkReview(userId, range) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/stats" className="hover:underline">
            统计管理
          </Link>
          <span className="mx-1.5">/</span>
          销售工作回顾
        </p>
        <h1 className="mt-1 text-2xl font-bold">销售工作回顾</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按人选与起止日期自动汇总打卡、往来、客户覆盖、商机与日报合规。销售本人暂不可见，仅管理员与销售管理可查。
        </p>
      </div>

      {users.length === 0 ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          暂无参与月度考核的销售人员，请先在销售人员档案中开启「参与月度考核」。
        </p>
      ) : (
        <>
          <WorkReviewFilters users={users} userId={userId} from={range.fromParam} to={range.toParam} />
          {report ? (
            <WorkReviewReport
              report={report}
              allowProjectDevSettlement={
                session.user.role === "ADMIN" || session.user.role === "SALES_MANAGER"
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">未找到该销售人员。</p>
          )}
        </>
      )}
    </div>
  );
}
