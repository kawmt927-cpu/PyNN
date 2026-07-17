import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { contractListWhere } from "@/lib/opportunities/access";
import { CONTRACT_STATUS_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { MobileSearchForm } from "@/components/mobile/mobile-search-form";
import { scoreNameMatch } from "@/lib/search/fuzzy-text";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function MobileContractsPage({ searchParams }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const where: Prisma.ContractWhereInput = contractListWhere(session.user.role, session.user.id);

  const raw = await prisma.contract.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      signCustomer: { select: { name: true } },
      endUserCustomer: { select: { name: true } },
      owner: { select: { name: true } },
    },
    take: q ? 120 : 50,
  });

  const contracts = q
    ? raw
        .map((c) => ({
          c,
          score: Math.max(
            scoreNameMatch(q, c.title),
            scoreNameMatch(q, c.contractNo ?? ""),
            scoreNameMatch(q, c.signCustomer.name),
            scoreNameMatch(q, c.endUserCustomer.name)
          ),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40)
        .map((item) => item.c)
    : raw;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 space-y-2 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">合同</h1>
          <Link href="/mobile/more" className="text-xs text-primary">
            返回
          </Link>
        </div>
        <MobileSearchForm
          action="/mobile/contracts"
          placeholder="搜索合同 / 客户"
          defaultValue={q}
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8">
        {contracts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {q ? "未找到匹配合同" : "暂无合同"}
          </p>
        ) : (
          <ul className="space-y-2">
            {contracts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/mobile/contracts/${c.id}`}
                  className="block rounded-xl border bg-card p-3 shadow-sm active:bg-muted/50"
                >
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.signCustomer.name}
                    {c.endUserCustomer.name !== c.signCustomer.name
                      ? ` → ${c.endUserCustomer.name}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {CONTRACT_STATUS_LABELS[c.status]}
                    {` · ${formatAmount(c.totalAmount)}`}
                    {c.owner?.name ? ` · ${c.owner.name}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          新建 / 编辑合同请在电脑端操作
        </p>
      </div>
    </div>
  );
}
