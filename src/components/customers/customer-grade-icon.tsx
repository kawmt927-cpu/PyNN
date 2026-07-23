import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CUSTOMER_GRADE,
  CUSTOMER_GRADE_OPTIONS,
  getCustomerGradeLabel,
  normalizeCustomerGrade,
} from "@/lib/customers/grade";
import type { CustomerGradeTone } from "@/lib/customers/customer-type-grade";

type Props = {
  grade: string | null | undefined;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
  /** 系统配置中的文字描述；未传时使用内置默认 */
  description?: string | null;
  /** 批量传入配置描述，便于列表页 */
  labelMap?: Record<string, string>;
  /** 直接客户琥珀星 / 渠道蓝星 */
  tone?: CustomerGradeTone;
};

const TONE_STAR_CLASS: Record<CustomerGradeTone, string> = {
  amber: "text-amber-500",
  blue: "text-blue-500",
};

export function GradeStars({
  count,
  size,
  tone = "amber",
}: {
  count: number;
  size: "sm" | "md";
  tone?: CustomerGradeTone;
}) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span className={cn("inline-flex items-center gap-0.5", TONE_STAR_CLASS[tone])} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <Star key={index} className={cn(iconClass, "fill-current")} />
      ))}
    </span>
  );
}

export function GradeUnrated({
  size,
  tone = "amber",
}: {
  size: "sm" | "md";
  tone?: CustomerGradeTone;
}) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const emptyClass = tone === "blue" ? "text-blue-300" : "text-muted-foreground";

  return <Star className={cn(iconClass, emptyClass)} aria-hidden />;
}

/** 仅星级图形，不含文字标签 */
export function CustomerGradeVisual({
  grade,
  size = "md",
  className,
  tone = "amber",
}: {
  grade: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
  tone?: CustomerGradeTone;
}) {
  const normalized = normalizeCustomerGrade(grade);
  if (!normalized) return null;

  const option = CUSTOMER_GRADE_OPTIONS.find((item) => item.value === normalized);

  return (
    <span className={cn("inline-flex items-center", className)}>
      {normalized === CUSTOMER_GRADE.NONE ? (
        <GradeUnrated size={size} tone={tone} />
      ) : option?.starCount ? (
        <GradeStars count={option.starCount} size={size} tone={tone} />
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
  tone = "amber",
}: {
  grade: string | null | undefined;
  description?: string | null;
  labelMap?: Record<string, string>;
  size?: "sm" | "md";
  className?: string;
  tone?: CustomerGradeTone;
}) {
  const normalized = normalizeCustomerGrade(grade);
  if (!normalized) return null;

  const text = resolveGradeDescription(normalized, description, labelMap);

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <CustomerGradeVisual grade={normalized} size={size} tone={tone} />
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
  tone = "amber",
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
      <CustomerGradeVisual grade={normalized} size={size} tone={tone} />
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
