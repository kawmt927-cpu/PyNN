"use client";

import { useRouter, usePathname } from "next/navigation";
import { MobileDateNav } from "@/components/mobile/mobile-date-nav";

type Props = {
  selectedDate: string;
  extraQuery?: Record<string, string | undefined | null>;
  className?: string;
};

/** 工作日志页：通过 URL ?date= 切换日期 */
export function MobileActivityDateNav({
  selectedDate,
  extraQuery,
  className,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function go(date: string) {
    if (date === selectedDate) return;
    const params = new URLSearchParams();
    params.set("date", date);
    if (extraQuery) {
      for (const [key, value] of Object.entries(extraQuery)) {
        if (value) params.set(key, value);
      }
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <MobileDateNav
      value={selectedDate}
      onChange={go}
      className={className}
    />
  );
}
