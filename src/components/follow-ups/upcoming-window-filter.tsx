import Link from "next/link";
import {
  DEFAULT_UPCOMING_WINDOW_VALUE,
  UPCOMING_WINDOW_OPTIONS,
  type UpcomingWindowValue,
} from "@/lib/follow-ups/upcoming-window";
import { buildFollowUpsHref } from "@/lib/follow-ups/list-pagination";
import { cn } from "@/lib/utils";

type Props = {
  active: UpcomingWindowValue;
  /** 切换窗口时保留已到期页码，即将到期回到第 1 页 */
  duePage?: number;
};

export function UpcomingWindowFilter({ active, duePage = 1 }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">筛选</span>
      {UPCOMING_WINDOW_OPTIONS.map((option) => {
        const href = buildFollowUpsHref({
          window: option.value === DEFAULT_UPCOMING_WINDOW_VALUE ? undefined : option.value,
          duePage,
        });
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
