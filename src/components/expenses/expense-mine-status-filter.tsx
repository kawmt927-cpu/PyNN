import Link from "next/link";
import {
  EXPENSE_MINE_CHIPS,
  type ExpenseMineChip,
} from "@/lib/expenses/labels";
import { cn } from "@/lib/utils";

type Props = {
  counts: Record<ExpenseMineChip, number>;
  active: ExpenseMineChip;
  basePath?: string;
};

export function ExpenseMineStatusFilter({
  counts,
  active,
  basePath = "/expenses",
}: Props) {
  function hrefFor(chip: ExpenseMineChip) {
    if (chip === "all") return basePath;
    return `${basePath}?status=${chip}`;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {EXPENSE_MINE_CHIPS.map((chip) => {
        const selected = active === chip.key;
        const count = counts[chip.key] ?? 0;
        return (
          <Link
            key={chip.key}
            href={hrefFor(chip.key)}
            scroll={false}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            <span>{chip.label}</span>
            <span
              className={cn(
                "tabular-nums",
                selected ? "opacity-90" : "text-foreground/70"
              )}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
