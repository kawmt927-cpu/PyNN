import Link from "next/link";
import { requireRole } from "@/lib/session";
import { formatAmount } from "@/lib/opportunities/funnel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CostLedgerPeriodToolbar } from "@/components/admin/cost-ledger-period-toolbar";
import {
  getCostLedger,
  opsRecentYears,
  periodQuery,
  type CostLedgerBucketKey,
  type CostLedgerDetailRow,
} from "@/lib/admin/cost-ledger";

type Props = {
  searchParams: Promise<{
    year?: string;
    preset?: string;
    from?: string;
    to?: string;
    bucket?: string;
  }>;
};

const BUCKET_LABELS: Record<CostLedgerBucketKey, string> = {
  external: "外部/合同成本",
  confirmed_labor: "已确认人力",
  paid_expenses: "已打款报销",
  sales: "销售费用",
};

function isBucketKey(v: string | undefined): v is CostLedgerBucketKey {
  return (
    v === "external" ||
    v === "confirmed_labor" ||
    v === "paid_expenses" ||
    v === "sales"
  );
}

export default async function CostLedgerPage({ searchParams }: Props) {
  await requireRole(["ADMIN", "SALES_MANAGER", "HR"]);
  const params = await searchParams;
  const years = opsRecentYears();
  const data = await getCostLedger({
    year: params.year,
    preset: params.preset,
    from: params.from,
    to: params.to,
  });
  const { period } = data;
  const activeBucket = isBucketKey(params.bucket) ? params.bucket : null;
  const qs = periodQuery(period);
  const exportHref = qs
    ? `/admin/cost-ledger/export?${qs}`
    : "/admin/cost-ledger/export";

  const details: CostLedgerDetailRow[] = activeBucket
    ? data.details.filter((d) => d.bucket === activeBucket)
    : data.details;

  function bucketHref(key: CostLedgerBucketKey) {
    const p = new URLSearchParams(qs);
    if (activeBucket === key) {
      // toggle off
    } else {
      p.set("bucket", key);
    }
    const next = p.toString();
    return next ? `/admin/cost-ledger?${next}` : "/admin/cost-ledger";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">成本台账</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按期间汇总外部合同、已确认人力、已打款报销与销售费用
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/ops">运营看板</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={exportHref}>导出 CSV</a>
          </Button>
        </div>
      </div>

      <CostLedgerPeriodToolbar
        preset={period.preset}
        selectedYear={period.year}
        years={years}
        fromMonth={period.fromMonth}
        toMonth={period.toMonth}
        label={period.label}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {period.label} 合计
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatAmount(data.totalAmount)}</p>
          </CardContent>
        </Card>
        {data.buckets.map((bucket) => (
          <Card
            key={bucket.key}
            className={
              activeBucket === bucket.key ? "border-primary ring-1 ring-primary" : undefined
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {bucket.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-semibold">{formatAmount(bucket.amount)}</p>
              <p className="text-xs text-muted-foreground">{bucket.hint}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild size="sm" variant="secondary">
                  <Link href={bucketHref(bucket.key)}>
                    {activeBucket === bucket.key ? "取消筛选" : `明细 (${bucket.detailCount})`}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={bucket.href}>打开模块</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {activeBucket ? BUCKET_LABELS[activeBucket] : "期间明细"}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({details.length} 条)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {details.length === 0 ? (
            <p className="text-muted-foreground">该期间暂无明细。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {!activeBucket ? <th className="pb-2 pr-4">分桶</th> : null}
                    <th className="pb-2 pr-4">日期</th>
                    <th className="pb-2 pr-4">标题</th>
                    <th className="pb-2 pr-4">说明</th>
                    <th className="pb-2 pr-4 text-right">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((row) => (
                    <tr key={`${row.bucket}-${row.id}`} className="border-b">
                      {!activeBucket ? (
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {BUCKET_LABELS[row.bucket]}
                        </td>
                      ) : null}
                      <td className="py-2 pr-4 whitespace-nowrap">{row.date || "—"}</td>
                      <td className="py-2 pr-4">
                        {row.href ? (
                          <Link href={row.href} className="font-medium hover:underline">
                            {row.title}
                          </Link>
                        ) : (
                          row.title
                        )}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{row.subtitle || "—"}</td>
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        {formatAmount(row.amount)}
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
