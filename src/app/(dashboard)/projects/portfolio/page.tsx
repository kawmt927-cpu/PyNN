import Link from "next/link";
import { requireRole } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PortfolioFiltersBar } from "@/components/projects/portfolio-filters";
import { PortfolioTable } from "@/components/projects/portfolio-table";
import {
  buildPortfolioHref,
  getPortfolioBoard,
  parsePortfolioFilters,
} from "@/lib/projects/portfolio";

type Props = {
  searchParams: Promise<{
    status?: string;
    overdue?: string;
    managerId?: string;
  }>;
};

export default async function ProjectPortfolioPage({ searchParams }: Props) {
  await requireRole(["PROJECT_ADMIN", "ADMIN", "SALES_MANAGER"]);
  const params = await searchParams;
  const filters = parsePortfolioFilters(params);
  const { rows, managers } = await getPortfolioBoard(filters);
  const returnTo = buildPortfolioHref(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">项目组合看板</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            在途项目进度、逾期与资源冲突一览（只读）
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/projects">返回项目列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            在途项目
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({rows.length} 个)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PortfolioFiltersBar filters={filters} managers={managers} />
          {rows.length === 0 ? (
            <p className="text-muted-foreground">暂无符合条件的在途项目。</p>
          ) : (
            <PortfolioTable rows={rows} returnTo={returnTo} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
