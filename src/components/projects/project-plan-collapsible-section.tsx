"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function ProjectPlanCollapsibleSection({
  title,
  description,
  open,
  onOpenChange,
  actions,
  children,
  className,
  bodyClassName,
}: Props) {
  return (
    <section className={cn("overflow-hidden rounded-md border", className)}>
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => onOpenChange(!open)}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-medium">{title}</span>
          {description ? (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              · {description}
            </span>
          ) : null}
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {open ? <div className={cn("p-3", bodyClassName)}>{children}</div> : null}
    </section>
  );
}
