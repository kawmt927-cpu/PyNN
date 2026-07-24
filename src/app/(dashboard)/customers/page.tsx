import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  canManageCustomerOwner,
  customerListTabs,
  listCustomerAssignableUsers,
  resolveCustomerListView,
} from "@/lib/customers/access";
import {
  buildCustomerListHref,
  buildCustomerListWhere,
  CUSTOMER_LIST_PAGE_SIZE,
  customerListPageCount,
  hasActiveCustomerListFilters,
  normalizeCustomerListTagFilters,
  parseCustomerListFilters,
  parseCustomerListPage,
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
import {
  CustomerListPageNumbers,
  CustomerListPagination,
} from "@/components/customers/customer-list-pagination";
import { TruncatedTextPopover } from "@/components/ui/truncated-text-popover";
import { getCustomerTagDefinitions } from "@/lib/customers/tags";
import { isChannelCustomerType } from "@/lib/customers/customer-type-grade";
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
    hospitalLevel?: string;
    ownerId?: string;
    tags?: string;
    province?: string;
    city?: string;
    district?: string;
    page?: string;
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
  const where = buildCustomerListWhere(session.user.role, session.user.id, view, filters);
  const showOwnerFilter = canManageCustomerOwner(session.user.role) && view === "all";
  const filtersActive = hasActiveCustomerListFilters(filters);
  const pageSize = CUSTOMER_LIST_PAGE_SIZE;
  const requestedPage = parseCustomerListPage(params.page);

  const [total, labelMaps, typeOptions, gradeOptions, channelGradeOptions, salesUsers] =
    await Promise.all([
      prisma.customer.count({ where }),
      loadCustomerFieldLabelMaps(),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_TYPE),
      getConfigOptions(CONFIG_CATEGORY.CUSTOMER_GRADE),
      getConfigOptions(CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE),
      showOwnerFilter ? listCustomerAssignableUsers() : Promise.resolve([]),
    ]);

  const totalPages = customerListPageCount(total, pageSize);
  const page = Math.min(requestedPage, totalPages);
  const listPath = buildCustomerListHref(view, filters, page);

  const customerInclude = {
    owner: { select: { name: true } },
    tags: { select: { tagValue: true } },
  } as const;

  let customers: Awaited<
    ReturnType<
      typeof prisma.customer.findMany<{
        include: typeof customerInclude;
      }>
    >
  >;

  if (filters.q) {
    // 搜索需先按相关度排序，再切片分页（匹配集通常远小于全库）
    const rawCustomers = await prisma.customer.findMany({
      where,
      orderBy: { name: "asc" },
      include: customerInclude,
      take: 500,
    });
    const ranked = rankByNameMatch(filters.q, rawCustomers);
    customers = ranked.slice((page - 1) * pageSize, page * pageSize);
  } else {
    customers = await prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: customerInclude,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const gradeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};
  const channelGradeLabels = labelMaps[CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE] ?? {};

  const latestContacts = customers.length
    ? await prisma.followUp.findMany({
        where: {
          customerId: { in: customers.map((c) => c.id) },
          weeklyAssignment: null,
        },
        orderBy: { followUpAt: "desc" },
        distinct: ["customerId"],
        select: {
          customerId: true,
          followUpAt: true,
          content: true,
        },
      })
    : [];
  const latestContactByCustomerId = new Map(
    latestContacts.map((row) => [
      row.customerId,
      {
        at: row.followUpAt,
        content: row.content.trim(),
      },
    ])
  );

  const viewTitle =
    view === "pool" ? "公海池" : view === "all" ? "全部客户" : "我的客户";

  const emptyMessage = filtersActive
    ? "没有符合条件的客户，请调整搜索或筛选条件。"
    : view === "pool"
      ? "公海池暂无客户。"
      : "暂无客户，点击「新增客户」开始录入。";

  const hrefForPage = (p: number) => buildCustomerListHref(view, filters, p);

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
              （共 {total} 条{filtersActive ? "匹配" : ""}，每页 {pageSize} 条）
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CustomerListFilters
            view={view}
            filters={filters}
            typeOptions={typeOptions}
            gradeOptions={gradeOptions}
            tagOptions={tagDefinitions}
            showOwnerFilter={showOwnerFilter}
            salesUsers={salesUsers}
          />

          {customers.length === 0 ? (
            <p className="text-muted-foreground">{emptyMessage}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="whitespace-nowrap pb-2 pr-4">客户名称</th>
                      <th className="whitespace-nowrap pb-2 pr-4">类别</th>
                      <th className="whitespace-nowrap pb-2 pr-4">关系类型</th>
                      <th className="whitespace-nowrap pb-2 pr-4">等级</th>
                      <th className="whitespace-nowrap pb-2 pr-4">标签</th>
                      <th className="whitespace-nowrap pb-2 pr-4">负责人</th>
                      <th className="whitespace-nowrap pb-2 pr-4">最近联系</th>
                      <th className="whitespace-nowrap pb-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => {
                      const latest = latestContactByCustomerId.get(c.id);
                      const latestAt = latest
                        ? latest.at.toLocaleDateString("zh-CN", {
                            timeZone: "Asia/Shanghai",
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : null;
                      return (
                      <tr key={c.id} className="border-b">
                        <td className="max-w-[14rem] truncate whitespace-nowrap py-3 pr-4 font-medium" title={c.name}>
                          {c.name}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4">{CUSTOMER_CATEGORY_LABELS[c.category]}</td>
                        <td className="whitespace-nowrap py-3 pr-4">{labelForConfig(typeLabels, c.customerType)}</td>
                        <td className="whitespace-nowrap py-3 pr-4">
                          <CustomerGradeIcon
                            grade={c.customerGrade}
                            labelMap={
                              isChannelCustomerType(c.customerType, typeLabels)
                                ? channelGradeLabels
                                : gradeLabels
                            }
                            tone={
                              isChannelCustomerType(c.customerType, typeLabels)
                                ? "blue"
                                : "amber"
                            }
                          />
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4">
                          <CustomerTagList
                            tags={c.tags.map((item) => item.tagValue)}
                            definitions={tagDefinitions}
                          />
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4">{c.owner?.name ?? "公海池"}</td>
                        <td className="whitespace-nowrap py-3 pr-4">
                          <TruncatedTextPopover
                            label={latestAt}
                            text={latest?.content}
                          />
                        </td>
                        <td className="whitespace-nowrap py-3">
                          <Link
                            href={withReturnTo(`/customers/${c.id}`, listPath)}
                            className="text-primary hover:underline"
                          >
                            详情
                          </Link>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <CustomerListPagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                hrefForPage={hrefForPage}
              />
              <CustomerListPageNumbers
                page={page}
                totalPages={totalPages}
                hrefForPage={hrefForPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
