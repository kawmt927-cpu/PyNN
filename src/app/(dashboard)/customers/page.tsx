import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  customerListWhere,
  customerListTabs,
  resolveCustomerListView,
} from "@/lib/customers/access";
import {
  CONFIG_CATEGORY,
  labelForConfig,
  loadCustomerFieldLabelMaps,
} from "@/lib/config-options";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  searchParams: Promise<{ view?: string }>;
};

export default async function CustomersPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const { view: rawView } = await searchParams;

  const view = resolveCustomerListView(rawView, session.user.role);
  const tabs = customerListTabs(session.user.role);
  const where = customerListWhere(session.user.role, session.user.id, view);

  const [customers, labelMaps] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { owner: { select: { name: true } } },
      take: 100,
    }),
    loadCustomerFieldLabelMaps(),
  ]);

  const sourceLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_SOURCE] ?? {};
  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const gradeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">客户管理</h1>
        <Button asChild>
          <Link href="/customers/new">新增客户</Link>
        </Button>
      </div>

      <div className="flex gap-2 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              view === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {view === "pool" ? "公海池" : view === "all" ? "全部客户" : "我的客户"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({customers.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="text-muted-foreground">
              {view === "pool" ? "公海池暂无客户。" : "暂无客户，点击「新增客户」开始录入。"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">客户名称</th>
                    <th className="pb-2 pr-4">类别</th>
                    <th className="pb-2 pr-4">类型</th>
                    <th className="pb-2 pr-4">等级</th>
                    <th className="pb-2 pr-4">来源</th>
                    <th className="pb-2 pr-4">负责人</th>
                    <th className="pb-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="py-3 pr-4 font-medium">{c.name}</td>
                      <td className="py-3 pr-4">{CUSTOMER_CATEGORY_LABELS[c.category]}</td>
                      <td className="py-3 pr-4">{labelForConfig(typeLabels, c.customerType)}</td>
                      <td className="py-3 pr-4">{labelForConfig(gradeLabels, c.customerGrade)}</td>
                      <td className="py-3 pr-4">{labelForConfig(sourceLabels, c.source)}</td>
                      <td className="py-3 pr-4">{c.owner?.name ?? "公海池"}</td>
                      <td className="py-3">
                        <Link
                          href={`/customers/${c.id}`}
                          className="text-primary hover:underline"
                        >
                          详情
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
