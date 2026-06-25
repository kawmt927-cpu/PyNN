import Link from "next/link";
import { DEFAULT_UPCOMING_WINDOW_VALUE, UPCOMING_WINDOW_OPTIONS, type UpcomingWindowValue } from "@/lib/follow-ups/upcoming-window";
import { cn } from "@/lib/utils";

type Props = {
  active: UpcomingWindowValue;
};

export function UpcomingWindowFilter({ active }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">筛选</span>
      {UPCOMING_WINDOW_OPTIONS.map((option) => {
        const href =
          option.value === DEFAULT_UPCOMING_WINDOW_VALUE
            ? "/follow-ups"
            : `/follow-ups?window=${option.value}`;
        const isActive = active === option.value;
        return (
          <Link
            key={option.value}
            href={href}
            className={cn(
              "rounded-md border px-3 py-1 text-sm transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-foreground hover:bg-muted"
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
