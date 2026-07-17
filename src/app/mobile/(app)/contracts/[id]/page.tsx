import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { SALES_MOBILE_ROLES } from "@/lib/mobile/sales-roles";
import { getContractForUser } from "@/lib/opportunities/access";
import { CONTRACT_STATUS_LABELS, SIGNING_TYPE_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function MobileContractDetailPage({ params }: Props) {
  const session = await requireRole(SALES_MOBILE_ROLES);
  const { id } = await params;

  const contract = await getContractForUser(id, session.user.role, session.user.id);
  if (!contract) notFound();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link href="/mobile/contracts" className="text-xs text-primary">
          ← 合同列表
        </Link>
        <h1 className="mt-1 text-lg font-bold">{contract.title}</h1>
        <p className="text-xs text-muted-foreground">
          {CONTRACT_STATUS_LABELS[contract.status]}
          {contract.contractNo ? ` · ${contract.contractNo}` : ""}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-8">
        <dl className="space-y-3 rounded-xl border bg-card p-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">签约客户</dt>
            <dd>
              <Link
                href={`/mobile/customers/${contract.signCustomer.id}`}
                className="font-medium text-primary"
              >
                {contract.signCustomer.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">终用户</dt>
            <dd>
              <Link
                href={`/mobile/customers/${contract.endUserCustomer.id}`}
                className="font-medium text-primary"
              >
                {contract.endUserCustomer.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">合同金额</dt>
            <dd className="font-medium">{formatAmount(contract.totalAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">签约类型</dt>
            <dd>{SIGNING_TYPE_LABELS[contract.signingType]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">负责销售</dt>
            <dd>{contract.owner.name}</dd>
          </div>
          {contract.opportunity ? (
            <div>
              <dt className="text-xs text-muted-foreground">关联商机</dt>
              <dd>
                <Link
                  href={`/mobile/opportunities/${contract.opportunity.id}`}
                  className="text-primary"
                >
                  {contract.opportunity.title}
                </Link>
              </dd>
            </div>
          ) : null}
          {contract.signedAt ? (
            <div>
              <dt className="text-xs text-muted-foreground">签署日期</dt>
              <dd>{format(contract.signedAt, "yyyy-MM-dd")}</dd>
            </div>
          ) : null}
          {contract.notes ? (
            <div>
              <dt className="text-xs text-muted-foreground">备注</dt>
              <dd className="whitespace-pre-wrap text-muted-foreground">{contract.notes}</dd>
            </div>
          ) : null}
        </dl>

        <p className="text-xs text-muted-foreground">
          分期回款、审批与编辑请在电脑端合同详情操作。
        </p>
      </div>
    </div>
  );
}
