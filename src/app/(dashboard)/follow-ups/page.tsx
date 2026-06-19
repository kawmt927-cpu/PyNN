import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { CONFIG_CATEGORY, labelForConfig, loadCustomerFieldLabelMaps } from "@/lib/config-options";
import { format } from "date-fns";

export default async function FollowUpsPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const now = new Date();

  const customerWhere =
    session.user.role === "SALES" ? { ownerId: session.user.id } : {};

  const [dueFollowUps, upcomingFollowUps, labelMaps] = await Promise.all([
    prisma.followUp.findMany({
      where: {
        nextFollowUpAt: { lte: now },
        customer: customerWhere,
      },
      include: {
        customer: {
          select: { id: true, name: true, customerGrade: true },
        },
        user: { select: { name: true } },
      },
      orderBy: { nextFollowUpAt: "asc" },
      take: 100,
    }),
    prisma.followUp.findMany({
      where: {
        nextFollowUpAt: { gt: now },
        customer: customerWhere,
      },
      include: {
        customer: {
          select: { id: true, name: true, customerGrade: true },
        },
        user: { select: { name: true } },
      },
      orderBy: { nextFollowUpAt: "asc" },
      take: 50,
    }),
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
            <FollowUpTable items={dueFollowUps} gradeLabels={gradeLabels} />
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
            <FollowUpTable items={upcomingFollowUps} gradeLabels={gradeLabels} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type FollowUpRow = {
  id: string;
  method: keyof typeof FOLLOW_UP_METHOD_LABELS;
  content: string;
  nextFollowUpAt: Date | null;
  customer: { id: string; name: string; customerGrade: string | null };
  user: { name: string };
};

function FollowUpTable({
  items,
  gradeLabels,
}: {
  items: FollowUpRow[];
  gradeLabels: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">客户</th>
            <th className="pb-2 pr-4">等级</th>
            <th className="pb-2 pr-4">上次方式</th>
            <th className="pb-2 pr-4">跟进摘要</th>
            <th className="pb-2 pr-4">负责人</th>
            <th className="pb-2 pr-4">计划时间</th>
            <th className="pb-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((f) => (
            <tr key={f.id} className="border-b">
              <td className="py-3 pr-4 font-medium">{f.customer.name}</td>
              <td className="py-3 pr-4">
                {labelForConfig(gradeLabels, f.customer.customerGrade)}
              </td>
              <td className="py-3 pr-4">{FOLLOW_UP_METHOD_LABELS[f.method]}</td>
              <td className="py-3 pr-4 max-w-xs truncate">{f.content}</td>
              <td className="py-3 pr-4">{f.user.name}</td>
              <td className="py-3 pr-4">
                {f.nextFollowUpAt ? format(f.nextFollowUpAt, "yyyy-MM-dd HH:mm") : "—"}
              </td>
              <td className="py-3">
                <Link
                  href={`/customers/${f.customer.id}`}
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
