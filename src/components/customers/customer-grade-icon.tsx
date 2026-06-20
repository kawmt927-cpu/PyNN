import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_GRADE,
  CUSTOMER_GRADE_OPTIONS,
  getCustomerGradeLabel,
  normalizeCustomerGrade,
} from "@/lib/customers/grade";

type Props = {
  grade: string | null | undefined;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
};

function GradeStars({ count, size }: { count: number; size: "sm" | "md" }) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <Star key={index} className={cn(iconClass, "fill-current")} />
      ))}
    </span>
  );
}

function GradeUnrated({ size }: { size: "sm" | "md" }) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return <Star className={cn(iconClass, "text-muted-foreground")} aria-hidden />;
}

export function CustomerGradeIcon({ grade, size = "md", showLabel = false, className }: Props) {
  const normalized = normalizeCustomerGrade(grade);
  if (!normalized) {
    return showLabel ? <span className={cn("text-muted-foreground", className)}>—</span> : null;
  }

  const label = getCustomerGradeLabel(normalized);
  const option = CUSTOMER_GRADE_OPTIONS.find((item) => item.value === normalized);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={label ?? undefined}
      aria-label={label ?? "客户等级"}
    >
      {normalized === CUSTOMER_GRADE.NONE ? (
        <GradeUnrated size={size} />
      ) : option?.starCount ? (
        <GradeStars count={option.starCount} size={size} />
      ) : null}
      {showLabel && label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
    </span>
  );
}
