import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/opportunities/funnel";
import type { ProjectCostSummary } from "@/lib/projects/cost-summary";

type Props = {
  summary: ProjectCostSummary;
};

export function CostSummaryCards({ summary }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">人力成本</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatAmount(summary.laborCost)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">发生费用</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatAmount(summary.expenseCost)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">实际成本</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatAmount(summary.actualCost)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">合同金额</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {summary.contractAmount != null ? formatAmount(summary.contractAmount) : "—"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
