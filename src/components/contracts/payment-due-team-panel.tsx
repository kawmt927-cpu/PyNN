import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  listOpenPaymentCollectionAssignmentTitles,
  listTeamPaymentDueByFilter,
  parsePaymentDueFilter,
} from "@/lib/contracts/payment-due";
import { withReturnTo } from "@/lib/navigation/return-to";
import { canManageContractApproval } from "@/lib/contracts/access";
import { listSalesUsersForSelect } from "@/lib/sales/selectable-users";
import { PaymentDueTeamPanelClient } from "@/components/contracts/payment-due-team-panel-client";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  userId: string;
  returnPath: string;
  filterParam?: string;
  /** 保留其它今日工作查询参数 */
  baseSearchParams?: Record<string, string | undefined>;
};

export async function PaymentDueTeamPanel({
  role,
  userId,
  returnPath,
  filterParam,
  baseSearchParams = {},
}: Props) {
  if (!canManageContractApproval(role)) return null;

  const filter = parsePaymentDueFilter(filterParam);
  const [{ items, byOwner, windowCounts }, salesUsers, assignedTitles] = await Promise.all([
    listTeamPaymentDueByFilter(filter),
    listSalesUsersForSelect({
      viewer: { id: userId, role },
      roles: ["SALES", "SALES_MANAGER", "ADMIN"],
    }),
    listOpenPaymentCollectionAssignmentTitles(),
  ]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-lg">团队回款催收</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            按 1/3/6 个月窗口与逾期筛选；逾期同一合同多期合并展示。也可向销售指派催收任务。
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={withReturnTo("/contracts?collect=ready&settlement=open", returnPath)}>
              可催款合同
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={withReturnTo("/contracts", returnPath)}>合同列表</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <PaymentDueTeamPanelClient
          filter={filter}
          items={items}
          byOwner={byOwner}
          windowCounts={windowCounts}
          returnPath={returnPath}
          salesUsers={salesUsers}
          baseSearchParams={baseSearchParams}
          assignedTitles={assignedTitles}
        />
      </CardContent>
    </Card>
  );
}
