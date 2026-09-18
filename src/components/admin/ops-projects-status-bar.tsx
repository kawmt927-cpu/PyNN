import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/opportunities/funnel";
import { withReturnTo } from "@/lib/navigation/return-to";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";
import type { ProjectStatus } from "@prisma/client";

export type OpsProjectStatusBucketView = {
  status: string;
  count: number;
  contractAmount: number;
};

type Props = {
  activeCount: number;
  contractAmount: number;
  byStatus: OpsProjectStatusBucketView[];
  returnTo: string;
};

function statusLabel(status: string) {
  return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status;
}

export function OpsProjectsStatusBar({
  activeCount,
  contractAmount,
  byStatus,
  returnTo,
}: Props) {
  const maxAmount = Math.max(...byStatus.map((b) => b.contractAmount), 1);
  const projectsHref = withReturnTo("/projects", returnTo);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-lg">在施项目</CardTitle>
          <p className="text-sm text-muted-foreground">
            共 {activeCount} 个 · 关联合同额 {formatAmount(contractAmount)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {byStatus.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无在施项目。</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {byStatus.map((bucket) => (
              <Link
                key={bucket.status}
                href={projectsHref}
                className="rounded-md border px-3 py-2.5 hover:bg-muted/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{statusLabel(bucket.status)}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">{bucket.count}</p>
                </div>
                <p className="mt-1 text-base font-semibold tabular-nums">
                  {formatAmount(bucket.contractAmount)}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{
                      width: `${Math.max(8, (bucket.contractAmount / maxAmount) * 100)}%`,
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
