import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canManageCustomerOwner,
  customerListTabs,
  resolveCustomerListView,
} from "@/lib/customers/access";
import {
  buildCustomerListHref,
  buildCustomerListWhere,
  hasActiveCustomerListFilters,
  normalizeCustomerListTagFilters,
  parseCustomerListFilters,
} from "@/lib/customers/list-filters";
import {
  CONFIG_CATEGORY,
  getConfigOptions,
  labelForConfig,
  loadCustomerFieldLabelMaps,
} from "@/lib/config-options";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerListFilters } from "@/components/customers/customer-list-filters";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { CustomerTagList } from "@/components/customers/customer-tag-badge";
import { getCustomerTagDefinitions } from "@/lib/customers/tags";
import { cn } from "@/lib/utils";
import { rankByNameMatch } from "@/lib/search/fuzzy-text";
import { withReturnTo } from "@/lib/navigation/return-to";

type Props = {
  searchParams: Promise<{
    view?: string;
    q?: string;
    category?: string;
    type?: string;
    grade?: string;
    ownerId?: string;
    tags?: string;
  }>;
};

export default async function CustomersPage({ searchParams }: Props) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const params = await searchParams;

  const view = resolveCustomerListView(params.view, session.user.role);
  const tagDefinitions = await getCustomerTagDefinitions();
  const allowedTagValues = new Set(tagDefinitions.map((item) => item.value));
  const parsedFilters = parseCustomerListFilters(params);
  const filters = {
    ...parsedFilters,
    tags: normalizeCustomerListTagFilters(parsedFilters.tags, allowedTagValues),
  };
  const tabs = customerListTabs(session.user.role);
  const listPath = buildCustomerListHref(view, filters);
  const where = buildCustomerListWhere(session.user.role, session.user.id, view, filters);
  const showOwnerFilter = canManageCustomerOwner(session.user.role) && view === "all";
  const filtersActive = hasActiveCustomerListFilters(filters);

  const [rawCustomers, labelMaps, typeOptions, salesUsers] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: filters.q ? { name: "asc" } : { updatedAt: "desc" },
        include: {
          owner: { select: { name: true } },
          tags: { select: { tagValue: true } },
        },
        take: filters.q ? 200 : 100,
      }),
      loadCustomerFieldLabelMaps(),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
      showOwnerFilter
        ? prisma.user.findMany({
            where: { role: { in: ["SALES", "SALES_MANAGER"] } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
    ]);

  const customers = filters.q
    ? rankByNameMatch(filters.q, rawCustomers).slice(0, 100)
    : rawCustomers;

  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};

  const viewTitle =
    view === "pool" ? "公海池" : view === "all" ? "全部客户" : "我的客户";

  const emptyMessage = filtersActive
    ? "没有符合条件的客户，请调整搜索或筛选条件。"
    : view === "pool"
      ? "公海池暂无客户。"
      : "暂无客户，点击「新增客户」开始录入。";

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
            {viewTitle}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({customers.length}
              {filtersActive ? " 条匹配" : ""})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CustomerListFilters
            view={view}
            filters={filters}
            typeOptions={typeOptions}
            tagOptions={tagDefinitions}
            showOwnerFilter={showOwnerFilter}
            salesUsers={salesUsers}
          />

          {customers.length === 0 ? (
            <p className="text-muted-foreground">{emptyMessage}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">客户名称</th>
                    <th className="pb-2 pr-4">类别</th>
                    <th className="pb-2 pr-4">关系类型</th>
                    <th className="pb-2 pr-4">等级</th>
                    <th className="pb-2 pr-4">标签</th>
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
                      <td className="py-3 pr-4">
                        <CustomerGradeIcon grade={c.customerGrade} />
                      </td>
                      <td className="py-3 pr-4">
                        <CustomerTagList
                          tags={c.tags.map((item) => item.tagValue)}
                          definitions={tagDefinitions}
                        />
                      </td>
                      <td className="py-3 pr-4">{c.owner?.name ?? "公海池"}</td>
                      <td className="py-3">
                        <Link
                          href={withReturnTo(`/customers/${c.id}`, listPath)}
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
