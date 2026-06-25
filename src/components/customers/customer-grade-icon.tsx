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
  /** 系统配置中的文字描述；未传时使用内置默认 */
  description?: string | null;
  /** 批量传入配置描述，便于列表页 */
  labelMap?: Record<string, string>;
};

export function GradeStars({ count, size }: { count: number; size: "sm" | "md" }) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <Star key={index} className={cn(iconClass, "fill-current")} />
      ))}
    </span>
  );
}

export function GradeUnrated({ size }: { size: "sm" | "md" }) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return <Star className={cn(iconClass, "text-muted-foreground")} aria-hidden />;
}

/** 仅星级图形，不含文字标签 */
export function CustomerGradeVisual({
  grade,
  size = "md",
  className,
}: {
  grade: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const normalized = normalizeCustomerGrade(grade);
  if (!normalized) return null;

  const option = CUSTOMER_GRADE_OPTIONS.find((item) => item.value === normalized);

  return (
    <span className={cn("inline-flex items-center", className)}>
      {normalized === CUSTOMER_GRADE.NONE ? (
        <GradeUnrated size={size} />
      ) : option?.starCount ? (
        <GradeStars count={option.starCount} size={size} />
      ) : null}
    </span>
  );
}

function resolveGradeDescription(
  grade: string | null | undefined,
  description?: string | null,
  labelMap?: Record<string, string>
) {
  if (description) return description;
  return getCustomerGradeLabel(grade, labelMap);
}

/** 星级 + 可选文字描述（用于下拉选项等） */
export function CustomerGradeDisplay({
  grade,
  description,
  labelMap,
  size = "md",
  className,
}: {
  grade: string | null | undefined;
  description?: string | null;
  labelMap?: Record<string, string>;
  size?: "sm" | "md";
  className?: string;
}) {
  const normalized = normalizeCustomerGrade(grade);
  if (!normalized) return null;

  const text = resolveGradeDescription(normalized, description, labelMap);

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <CustomerGradeVisual grade={normalized} size={size} />
      {text ? <span className="truncate text-sm text-muted-foreground">{text}</span> : null}
    </span>
  );
}

export function CustomerGradeIcon({
  grade,
  size = "md",
  showLabel = false,
  className,
  description,
  labelMap,
}: Props) {
  const normalized = normalizeCustomerGrade(grade);
  if (!normalized) {
    return showLabel ? <span className={cn("text-muted-foreground", className)}>—</span> : null;
  }

  const text = resolveGradeDescription(normalized, description, labelMap);

  return (
    <span
      className={cn("group/grade relative inline-flex items-center gap-1.5", className)}
      aria-label={text ?? "客户等级"}
    >
      <CustomerGradeVisual grade={normalized} size={size} />
      {showLabel && text ? (
        <span className="text-sm text-muted-foreground">{text}</span>
      ) : text ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-xs font-normal text-foreground shadow-lg group-hover/grade:block"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
