import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { CONFIG_CATEGORY, labelForConfig, loadCustomerFieldLabelMaps } from "@/lib/config-options";
import { getPendingFollowUps } from "@/lib/follow-ups/unified";
import { format } from "date-fns";
import { withReturnTo } from "@/lib/navigation/return-to";

export default async function FollowUpsPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const now = new Date();
  const listPath = "/follow-ups";

  const [dueFollowUps, upcomingFollowUps, labelMaps] = await Promise.all([
    getPendingFollowUps(session.user.role, session.user.id, "due", now, 100),
    getPendingFollowUps(session.user.role, session.user.id, "upcoming", now, 50),
    loadCustomerFieldLabelMaps(),
  ]);

  const gradeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">待跟进</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-orange-600">
            已到期（{dueFollowUps.length}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dueFollowUps.length === 0 ? (
            <p className="text-muted-foreground">暂无到期跟进任务。</p>
          ) : (
            <FollowUpTable items={dueFollowUps} gradeLabels={gradeLabels} listPath={listPath} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">即将到期（{upcomingFollowUps.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingFollowUps.length === 0 ? (
            <p className="text-muted-foreground">暂无计划中的跟进。</p>
          ) : (
            <FollowUpTable items={upcomingFollowUps} gradeLabels={gradeLabels} listPath={listPath} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type FollowUpTableProps = {
  items: Awaited<ReturnType<typeof getPendingFollowUps>>;
  gradeLabels: Record<string, string>;
  listPath: string;
};

function FollowUpTable({ items, gradeLabels, listPath }: FollowUpTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">客户</th>
            <th className="pb-2 pr-4">关联商机</th>
            <th className="pb-2 pr-4">等级</th>
            <th className="pb-2 pr-4">方式</th>
            <th className="pb-2 pr-4">跟进摘要</th>
            <th className="pb-2 pr-4">负责人</th>
            <th className="pb-2 pr-4">计划时间</th>
            <th className="pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => (
            <tr key={`${f.source}-${f.id}`} className="border-b">
              <td className="py-3 pr-4 font-medium">{f.customer.name}</td>
              <td className="py-3 pr-4">
                {f.opportunity ? (
                  <Link
                    href={withReturnTo(`/opportunities/${f.opportunity.id}`, listPath)}
                    className="text-primary hover:underline"
                  >
                    {f.opportunity.title}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-3 pr-4">
                {labelForConfig(gradeLabels, f.customer.customerGrade)}
              </td>
              <td className="py-3 pr-4">
                {FOLLOW_UP_METHOD_LABELS[f.method]}
                {f.source === "opportunity" && (
                  <span className="ml-1 text-xs text-muted-foreground">(商机)</span>
                )}
              </td>
              <td className="max-w-xs truncate py-3 pr-4">{f.content}</td>
              <td className="py-3 pr-4">{f.user.name}</td>
              <td className="py-3 pr-4">
                {format(f.nextFollowUpAt, "yyyy-MM-dd HH:mm")}
              </td>
              <td className="py-3">
                <Link
                  href={
                    f.opportunity
                      ? withReturnTo(`/opportunities/${f.opportunity.id}/follow-ups`, listPath)
                      : withReturnTo(`/customers/${f.customer.id}/follow-ups`, listPath)
                  }
                  className="text-primary hover:underline"
                >
                  去跟进
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
