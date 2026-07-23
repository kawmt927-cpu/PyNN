import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  hrefForPage: (page: number) => string;
};

export function CustomerListPagination({
  page,
  totalPages,
  total,
  pageSize,
  hrefForPage,
}: Props) {
  if (total <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
      <p className="text-muted-foreground">
        第 {from}–{to} 条，共 {total} 条
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={hrefForPage(page - 1)}
            className="rounded-md border px-3 py-1.5 hover:bg-muted"
          >
            上一页
          </Link>
        ) : (
          <span className="rounded-md border px-3 py-1.5 text-muted-foreground opacity-50">
            上一页
          </span>
        )}
        <span className="tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={hrefForPage(page + 1)}
            className="rounded-md border px-3 py-1.5 hover:bg-muted"
          >
            下一页
          </Link>
        ) : (
          <span className="rounded-md border px-3 py-1.5 text-muted-foreground opacity-50">
            下一页
          </span>
        )}
      </div>
    </div>
  );
}

/** 页码快捷入口（页数不多时） */
export function CustomerListPageNumbers({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  if (totalPages <= 1 || totalPages > 12) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <Link
          key={n}
          href={hrefForPage(n)}
          className={cn(
            "min-w-8 rounded-md px-2 py-1 text-center text-sm tabular-nums",
            n === page ? "bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          {n}
        </Link>
      ))}
    </div>
  );
}
