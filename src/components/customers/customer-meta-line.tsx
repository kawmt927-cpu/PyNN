import { CustomerGradeVisual } from "@/components/customers/customer-grade-icon";
import { CustomerGradeFollowUpRemaining } from "@/components/customers/customer-grade-follow-up-remaining";
import type { CustomerGradeFollowUpSchedule } from "@/lib/customers/grade-expiry";
import { labelForConfig } from "@/lib/config-options";
import { getCustomerGradeLabel, normalizeCustomerGrade } from "@/lib/customers/grade";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { CustomerCategory } from "@prisma/client";
import { Fragment, type ReactNode } from "react";

function MetaSeparator() {
  return (
    <span className="select-none px-0.5 text-muted-foreground/35" aria-hidden>
      ·
    </span>
  );
}

function GradeMetaBadge({
  grade,
  labelMap,
}: {
  grade: string;
  labelMap?: Record<string, string>;
}) {
  const normalized = normalizeCustomerGrade(grade);
  if (!normalized) return null;

  const text = getCustomerGradeLabel(normalized, labelMap);

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 text-sm font-normal">
      <CustomerGradeVisual grade={normalized} size="sm" />
      {text ? <span className="text-foreground/80">{text}</span> : null}
    </span>
  );
}

/** 标题行内展示的客户等级（星级 + 描述） */
export function CustomerGradeMetaBadge({
  grade,
  labelMap,
  className,
}: {
  grade: string | null | undefined;
  labelMap?: Record<string, string>;
  className?: string;
}) {
  if (!grade || !normalizeCustomerGrade(grade)) return null;
  return (
    <span className={className}>
      <GradeMetaBadge grade={grade} labelMap={labelMap} />
    </span>
  );
}

type Props = {
  category: CustomerCategory;
  customerType?: string | null;
  typeLabels?: Record<string, string>;
  gradeFollowUpSchedule?: CustomerGradeFollowUpSchedule | null;
  className?: string;
};

/** 客户详情/跟进页标题下的分类、类型、拜访剩余等元信息 */
export function CustomerMetaLine({
  category,
  customerType,
  typeLabels,
  gradeFollowUpSchedule,
  className,
}: Props) {
  const items: ReactNode[] = [];

  const categoryLabel = CUSTOMER_CATEGORY_LABELS[category];
  if (categoryLabel) {
    items.push(
      <span key="category" className="text-muted-foreground">
        {categoryLabel}
      </span>
    );
  }

  const typeLabel =
    customerType && typeLabels ? labelForConfig(typeLabels, customerType) : null;
  if (typeLabel) {
    items.push(
      <span key="type" className="text-muted-foreground">
        {typeLabel}
      </span>
    );
  }

  if (gradeFollowUpSchedule) {
    items.push(
      <CustomerGradeFollowUpRemaining
        key="remaining"
        schedule={gradeFollowUpSchedule}
        compact
      />
    );
  }

  if (items.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-y-1 text-sm", className)}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 ? <MetaSeparator /> : null}
          {item}
        </Fragment>
      ))}
    </div>
  );
}
