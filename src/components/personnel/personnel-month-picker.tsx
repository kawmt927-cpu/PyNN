"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { yearMonthKey } from "@/lib/personnel/daily-rate";

type Props = {
  year: number;
  month: number;
  /** 可选月份上限（通常为当前自然月） */
  maxYear: number;
  maxMonth: number;
};

export function PersonnelMonthPicker({ year, month, maxYear, maxMonth }: Props) {
  const router = useRouter();
  const value = yearMonthKey(year, month);
  const max = yearMonthKey(maxYear, maxMonth);

  return (
    <Input
      type="month"
      aria-label="选择月份"
      className="w-[160px]"
      value={value}
      max={max}
      onChange={(e) => {
        const next = e.target.value;
        if (!/^\d{4}-\d{2}$/.test(next)) return;
        const [y, m] = next.split("-").map(Number);
        const selected = y * 12 + m;
        const ceiling = maxYear * 12 + maxMonth;
        const final =
          selected > ceiling
            ? { year: maxYear, month: maxMonth }
            : { year: y, month: m };
        router.push(`/personnel?tab=costs&year=${final.year}&month=${final.month}`);
      }}
    />
  );
}
