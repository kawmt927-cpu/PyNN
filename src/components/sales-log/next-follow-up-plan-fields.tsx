"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PlannedFollowUpDateTimeInputs,
  PlannedFollowUpQuickButtons,
} from "@/components/sales-log/planned-follow-up-date-field";
import {
  getNextFollowUpPlanHintExempt,
  getNextFollowUpPlanHintRequired,
  isNextFollowUpPlanExempt,
  resolveNoneGradeLabel,
} from "@/lib/sales-log/next-follow-up-plan";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import type { ConfigOptionItem } from "@/lib/config-options";
import { cn } from "@/lib/utils";

type Props = {
  methodId: string;
  methodValue: string;
  onMethodChange: (value: SalesLogMethod | "") => void;
  dateId: string;
  dateValue: string;
  onDateChange: (value: string) => void;
  contentId: string;
  contentValue: string;
  onContentChange: (value: string) => void;
  suggestedGrade?: string;
  currentCustomerGrade?: string | null;
  gradeOptions?: ConfigOptionItem[];
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
  contentId,
  contentValue,
  onContentChange,
  suggestedGrade = "",
  currentCustomerGrade,
  gradeOptions,
  disabled,
  methodSelectClassName,
  dateInputClassName,
}: Props) {
  const exempt = isNextFollowUpPlanExempt(suggestedGrade, currentCustomerGrade);
  const required = !exempt;
  const noneGradeLabel = resolveNoneGradeLabel(gradeOptions);
  const hint = exempt
    ? getNextFollowUpPlanHintExempt(noneGradeLabel)
    : getNextFollowUpPlanHintRequired(noneGradeLabel);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{hint}</p>
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
      <div className="space-y-2">
        <Label htmlFor={contentId}>目的和内容{required ? " *" : ""}</Label>
        <Textarea
          id={contentId}
          rows={2}
          value={contentValue}
          disabled={disabled}
          required={required && !disabled}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="下次拜访/沟通的目的与要点"
          className={cn(disabled && "cursor-not-allowed bg-muted text-muted-foreground")}
        />
      </div>
    </div>
  );
}
