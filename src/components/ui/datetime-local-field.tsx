"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  joinPlannedFollowUpValue,
  PLANNED_FOLLOW_UP_DEFAULT_TIME,
  splitPlannedFollowUpValue,
} from "@/lib/dates/local-date";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  name: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  required?: boolean;
  className?: string;
};

export function DatetimeLocalField({
  id,
  name,
  label,
  value,
  onValueChange,
  required,
  className,
}: Props) {
  const { date, time } = splitPlannedFollowUpValue(value);
  const timeId = `${id}-time`;

  function updateDate(nextDate: string, target: HTMLInputElement) {
    onValueChange(joinPlannedFollowUpValue(nextDate, time || PLANNED_FOLLOW_UP_DEFAULT_TIME));
    target.blur();
  }

  function updateTime(nextTime: string) {
    if (!date) return;
    onValueChange(joinPlannedFollowUpValue(date, nextTime || PLANNED_FOLLOW_UP_DEFAULT_TIME));
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value} />
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
        <Input
          id={id}
          type="date"
          value={date}
          required={required}
          onChange={(e) => updateDate(e.target.value, e.currentTarget)}
        />
        <Input
          id={timeId}
          type="time"
          value={date ? time : PLANNED_FOLLOW_UP_DEFAULT_TIME}
          disabled={!date}
          required={required && Boolean(date)}
          onChange={(e) => updateTime(e.target.value)}
        />
      </div>
    </div>
  );
}
