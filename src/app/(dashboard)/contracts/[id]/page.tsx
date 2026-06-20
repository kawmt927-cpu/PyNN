import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getContractForUser } from "@/lib/opportunities/access";
import {
  CONTRACT_STATUS_LABELS,
  SIGNING_TYPE_LABELS,
} from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { BackLink } from "@/components/navigation/back-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveBackNavigation, selfReturnPath, withReturnTo } from "@/lib/navigation/return-to";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export default async function ContractDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireRole(["SALES", "SALES_MANAGER", "PROJECT_MANAGER", "ADMIN"]);
  const contract = await getContractForUser(id, session.user.role, session.user.id);
  if (!contract) notFound();

  const { backHref, backLabel } = resolveBackNavigation(query, "/contracts");
  const selfPath = selfReturnPath(`/contracts/${id}`, query);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{contract.title}</h1>
        <BackLink href={backHref} label={backLabel} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">合同信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">合同金额：</span>
            {formatAmount(contract.totalAmount)}
          </p>
          <p>
            <span className="text-muted-foreground">签约类型：</span>
            {SIGNING_TYPE_LABELS[contract.signingType]}
          </p>
          <p>
            <span className="text-muted-foreground">状态：</span>
            {CONTRACT_STATUS_LABELS[contract.status]}
          </p>
          <p>
            <span className="text-muted-foreground">签约客户：</span>
            <Link
              href={withReturnTo(`/customers/${contract.signCustomer.id}`, selfPath)}
              className="text-primary hover:underline"
            >
              {contract.signCustomer.name}
            </Link>
          </p>
          <p>
            <span className="text-muted-foreground">终用户：</span>
            <Link
              href={withReturnTo(`/customers/${contract.endUserCustomer.id}`, selfPath)}
              className="text-primary hover:underline"
            >
              {contract.endUserCustomer.name}
            </Link>
          </p>
          <p>
            <span className="text-muted-foreground">负责销售：</span>
            {contract.owner.name}
          </p>
          {contract.opportunity && (
            <p>
              <span className="text-muted-foreground">关联商机：</span>
              <Link
                href={withReturnTo(`/opportunities/${contract.opportunity.id}`, selfPath)}
                className="text-primary hover:underline"
              >
                {contract.opportunity.title}
              </Link>
              <span className="ml-2 text-muted-foreground">
                （商机预计 {formatAmount(contract.opportunity.expectedAmount)}）
              </span>
            </p>
          )}
          {contract.signedAt && (
            <p>
              <span className="text-muted-foreground">签约日期：</span>
              {contract.signedAt.toISOString().slice(0, 10)}
            </p>
          )}
          {contract.project && (
            <p>
              <span className="text-muted-foreground">关联项目：</span>
              <Link href={`/projects`} className="text-primary hover:underline">
                {contract.project.name}
              </Link>
            </p>
          )}
          {contract.notes && (
            <div>
              <p className="text-muted-foreground">备注</p>
              <p className="mt-1 whitespace-pre-wrap">{contract.notes}</p>
            </div>
          )}
          <p className="pt-2 text-xs text-muted-foreground">
            产品明细与分期回款将在后续版本完善。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
