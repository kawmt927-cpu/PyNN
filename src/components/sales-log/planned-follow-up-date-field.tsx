"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addLocalDays,
  addLocalDaysWithDefaultTime,
  formatLocalDateInput,
  joinPlannedFollowUpValue,
  PLANNED_FOLLOW_UP_DEFAULT_TIME,
  PLANNED_FOLLOW_UP_QUICK_DAYS,
  splitPlannedFollowUpValue,
} from "@/lib/dates/local-date";
import { cn } from "@/lib/utils";

function openNativePicker(input: HTMLInputElement) {
  try {
    input.showPicker?.();
  } catch {
    // 部分环境不支持或非用户手势时会抛错，忽略即可
  }
}

type QuickButtonsProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function PlannedFollowUpQuickButtons({
  value,
  onChange,
  disabled,
  className,
}: QuickButtonsProps) {
  const { date } = splitPlannedFollowUpValue(value);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {PLANNED_FOLLOW_UP_QUICK_DAYS.map((days) => {
        const optionDate = addLocalDays(days);
        const active = date === optionDate;
        return (
          <Button
            key={days}
            type="button"
            variant={active ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={() => onChange(addLocalDaysWithDefaultTime(days))}
          >
            {days}天后
          </Button>
        );
      })}
    </div>
  );
}

type DateTimeInputsProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  inputClassName?: string;
};

export function PlannedFollowUpDateTimeInputs({
  id,
  value,
  onChange,
  disabled,
  required,
  inputClassName,
}: DateTimeInputsProps) {
  const today = formatLocalDateInput(new Date());
  const { date, time } = splitPlannedFollowUpValue(value);
  const timeId = `${id}-time`;

  function updateDate(nextDate: string) {
    onChange(joinPlannedFollowUpValue(nextDate, time || PLANNED_FOLLOW_UP_DEFAULT_TIME));
  }

  function updateTime(nextTime: string) {
    if (!date) return;
    onChange(joinPlannedFollowUpValue(date, nextTime || PLANNED_FOLLOW_UP_DEFAULT_TIME));
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        id={id}
        type="date"
        min={today}
        value={date}
        disabled={disabled}
        required={required && !disabled}
        onClick={(e) => {
          if (!disabled) openNativePicker(e.currentTarget);
        }}
        onChange={(e) => {
          updateDate(e.target.value);
          e.currentTarget.blur();
        }}
        className={cn(
          "min-w-[11rem] flex-1 basis-[11rem] cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer",
          inputClassName
        )}
      />
      <Input
        id={timeId}
        type="time"
        value={date ? time : PLANNED_FOLLOW_UP_DEFAULT_TIME}
        disabled={disabled || !date}
        onClick={(e) => {
          if (!disabled && date) openNativePicker(e.currentTarget);
        }}
        onChange={(e) => updateTime(e.target.value)}
        className={cn(
          "w-[7.5rem] shrink-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer",
          (disabled || !date) && "cursor-not-allowed",
          inputClassName
        )}
      />
    </div>
  );
}

type Props = {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
};

/** 独立使用：标签 + 快捷按钮 + 日期时间 */
export function PlannedFollowUpDateField({
  id,
  label = "计划时间",
  value,
  onChange,
  disabled,
  className,
  inputClassName,
}: Props) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <PlannedFollowUpQuickButtons value={value} onChange={onChange} disabled={disabled} />
      <PlannedFollowUpDateTimeInputs
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        inputClassName={inputClassName}
      />
    </div>
  );
}
