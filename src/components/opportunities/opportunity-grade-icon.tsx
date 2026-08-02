import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getOpportunityGradeLabel,
  getOpportunityGradeStarCount,
  normalizeOpportunityGrade,
  OPPORTUNITY_GRADE,
  OPPORTUNITY_GRADE_OPTIONS,
} from "@/lib/opportunities/grade";

type Props = {
  grade: string | null | undefined;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
  description?: string | null;
  labelMap?: Record<string, string>;
};

const PINK_FILLED = "text-pink-500";
const PINK_OUTLINE = "text-pink-300";

export function OpportunityGradeStars({
  count,
  size,
}: {
  count: number;
  size: "sm" | "md";
}) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span className={cn("inline-flex items-center gap-0.5", PINK_FILLED)} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <Star key={index} className={cn(iconClass, "fill-current")} />
      ))}
    </span>
  );
}

export function OpportunityGradeUnrated({ size }: { size: "sm" | "md" }) {
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return <Star className={cn(iconClass, PINK_OUTLINE)} aria-hidden />;
}

export function OpportunityGradeVisual({
  grade,
  size = "md",
  className,
}: {
  grade: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const normalized = normalizeOpportunityGrade(grade) ?? OPPORTUNITY_GRADE.P3;
  const starCount = getOpportunityGradeStarCount(normalized);

  return (
    <span className={cn("inline-flex items-center", className)}>
      {starCount > 0 ? (
        <OpportunityGradeStars count={starCount} size={size} />
      ) : (
        <OpportunityGradeUnrated size={size} />
      )}
    </span>
  );
}

function resolveGradeDescription(
  grade: string | null | undefined,
  description?: string | null,
  labelMap?: Record<string, string>
) {
  if (description) return description;
  return getOpportunityGradeLabel(grade, labelMap);
}

export function OpportunityGradeDisplay({
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
  const normalized = normalizeOpportunityGrade(grade) ?? OPPORTUNITY_GRADE.P3;

  const text = resolveGradeDescription(normalized, description, labelMap);
  const fallbackLabel =
    OPPORTUNITY_GRADE_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <OpportunityGradeVisual grade={normalized} size={size} />
      {text ? <span className="truncate text-sm text-muted-foreground">{text}</span> : (
        <span className="truncate text-sm text-muted-foreground">{fallbackLabel}</span>
      )}
    </span>
  );
}

export function OpportunityGradeIcon({
  grade,
  size = "md",
  showLabel = false,
  className,
  description,
  labelMap,
}: Props) {
  const normalized = normalizeOpportunityGrade(grade) ?? OPPORTUNITY_GRADE.P3;
  const text = resolveGradeDescription(normalized, description, labelMap);

  return (
    <span
      className={cn("group/grade relative inline-flex items-center gap-1.5", className)}
      aria-label={text ?? "商机等级"}
    >
      <OpportunityGradeVisual grade={normalized} size={size} />
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
