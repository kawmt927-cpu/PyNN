import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import {
  buildCustomerListWhere,
  parseCustomerListFilters,
  normalizeCustomerListTagFilters,
} from "@/lib/customers/list-filters";
import { resolveCustomerListView } from "@/lib/customers/access";
import { getCustomerTagDefinitions } from "@/lib/customers/tags";
import {
  CONFIG_CATEGORY,
  loadCustomerFieldLabelMaps,
  labelForConfig,
} from "@/lib/config-options";
import { CustomerGradeIcon } from "@/components/customers/customer-grade-icon";
import { rankByNameMatch } from "@/lib/search/fuzzy-text";
import { MobileSearchForm } from "@/components/mobile/mobile-search-form";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function MobileCustomersPage({ searchParams }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const tagDefinitions = await getCustomerTagDefinitions();
  const allowedTagValues = new Set(tagDefinitions.map((item) => item.value));
  const view = resolveCustomerListView("mine", session.user.role);
  const parsed = parseCustomerListFilters({ q: q || undefined });
  const filters = {
    ...parsed,
    tags: normalizeCustomerListTagFilters(parsed.tags, allowedTagValues),
  };
  const where = buildCustomerListWhere(session.user.role, session.user.id, view, filters);

  const [rawCustomers, labelMaps] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: q ? { name: "asc" } : { updatedAt: "desc" },
      include: {
        owner: { select: { name: true } },
      },
      take: q ? 80 : 40,
    }),
    loadCustomerFieldLabelMaps(),
  ]);

  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const gradeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};

  const customers = q ? rankByNameMatch(q, rawCustomers).slice(0, 40) : rawCustomers;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 space-y-2 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">客户</h1>
          <Link href="/mobile/more" className="text-xs text-primary">
            返回
          </Link>
        </div>
        <MobileSearchForm action="/mobile/customers" placeholder="搜索客户名称" defaultValue={q} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8">
        {customers.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {q ? "未找到匹配客户" : "暂无客户"}
          </p>
        ) : (
          <ul className="space-y-2">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/mobile/customers/${c.id}`}
                  className="block rounded-xl border bg-card p-3 shadow-sm active:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <CustomerGradeIcon grade={c.customerGrade} size="sm" labelMap={gradeLabels} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {labelForConfig(typeLabels, c.customerType) || "未分类"}
                    {c.owner?.name ? ` · ${c.owner.name}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">仅查阅；新建请用电脑端</p>
      </div>
    </div>
  );
}
