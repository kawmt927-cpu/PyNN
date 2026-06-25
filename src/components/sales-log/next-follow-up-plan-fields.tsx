"use client";

import { Label } from "@/components/ui/label";
import {
  PlannedFollowUpDateTimeInputs,
  PlannedFollowUpQuickButtons,
} from "@/components/sales-log/planned-follow-up-date-field";
import {
  isNextFollowUpPlanExempt,
  NEXT_FOLLOW_UP_PLAN_HINT_EXEMPT,
  NEXT_FOLLOW_UP_PLAN_HINT_REQUIRED,
} from "@/lib/sales-log/next-follow-up-plan";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import { cn } from "@/lib/utils";

type Props = {
  methodId: string;
  methodValue: string;
  onMethodChange: (value: SalesLogMethod | "") => void;
  dateId: string;
  dateValue: string;
  onDateChange: (value: string) => void;
  suggestedGrade?: string;
  currentCustomerGrade?: string | null;
  disabled?: boolean;
  methodSelectClassName?: string;
  dateInputClassName?: string;
};

export function NextFollowUpPlanFields({
  methodId,
  methodValue,
  onMethodChange,
  dateId,
  dateValue,
  onDateChange,
  suggestedGrade = "",
  currentCustomerGrade,
  disabled,
  methodSelectClassName,
  dateInputClassName,
}: Props) {
  const exempt = isNextFollowUpPlanExempt(suggestedGrade, currentCustomerGrade);
  const required = !exempt;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {exempt ? NEXT_FOLLOW_UP_PLAN_HINT_EXEMPT : NEXT_FOLLOW_UP_PLAN_HINT_REQUIRED}
      </p>
      <PlannedFollowUpQuickButtons
        value={dateValue}
        onChange={onDateChange}
        disabled={disabled}
      />
      <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={methodId}>计划方式{required ? " *" : ""}</Label>
          <select
            id={methodId}
            value={methodValue}
            disabled={disabled}
            required={required && !disabled}
            onChange={(e) => onMethodChange(e.target.value as SalesLogMethod | "")}
            className={cn(
              "flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              disabled ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-background",
              methodSelectClassName
            )}
          >
            <option value="">请选择</option>
            {SALES_LOG_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={dateId}>计划时间{required ? " *" : ""}</Label>
          <PlannedFollowUpDateTimeInputs
            id={dateId}
            value={dateValue}
            onChange={onDateChange}
            disabled={disabled}
            required={required && !disabled}
            inputClassName={dateInputClassName}
          />
        </div>
      </div>
    </div>
  );
}
