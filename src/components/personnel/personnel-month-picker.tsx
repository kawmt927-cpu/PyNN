"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { yearMonthKey } from "@/lib/personnel/daily-rate";

type Props = {
  year: number;
  month: number;
};

export function PersonnelMonthPicker({ year, month }: Props) {
  const router = useRouter();
  const value = yearMonthKey(year, month);

  return (
    <Input
      type="month"
      aria-label="选择月份"
      className="w-[160px]"
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        if (!/^\d{4}-\d{2}$/.test(next)) return;
        const [y, m] = next.split("-").map(Number);
        router.push(`/personnel?tab=costs&year=${y}&month=${m}`);
      }}
    />
  );
}
