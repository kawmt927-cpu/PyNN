"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CHINA_PROVINCE_CITIES,
  citiesOfProvince,
  findProvinceForCity,
} from "@/lib/geo/china-province-cities";

type Props = {
  id?: string;
  name: string;
  /** 已选城市短名，如「上海」 */
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  onValueChange?: (city: string) => void;
};

/**
 * 省市级联选择：点开后左侧省、右侧市，选定城市后关闭。
 * 表单提交写入城市短名（与差旅住宿标准匹配一致）。
 */
export function ProvinceCityPicker({
  id,
  name,
  value: valueProp,
  defaultValue = "",
  placeholder = "请选择城市",
  required,
  disabled,
  className,
  onValueChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = valueProp ?? uncontrolled;
  const [activeProvince, setActiveProvince] = useState<string | null>(() =>
    findProvinceForCity(defaultValue || valueProp)
  );

  const cities = useMemo(() => citiesOfProvince(activeProvince), [activeProvince]);

  function commit(city: string) {
    if (valueProp === undefined) setUncontrolled(city);
    onValueChange?.(city);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (next) {
          setActiveProvince(findProvinceForCity(value) ?? CHINA_PROVINCE_CITIES[0]?.province ?? null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            disabled
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "hover:bg-muted/30",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate text-left">{value || placeholder}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 opacity-50 transition-transform", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <input type="hidden" name={name} value={value} required={required && !value} />
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="z-[60] w-[min(22rem,calc(100vw-2rem))] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex h-64">
          <ul
            role="listbox"
            aria-label="省份"
            className="w-[7.5rem] shrink-0 overflow-y-auto overscroll-contain border-r bg-muted/30"
          >
            {CHINA_PROVINCE_CITIES.map((row) => {
              const active = row.province === activeProvince;
              return (
                <li key={row.province}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-1 px-2.5 py-2 text-left text-sm hover:bg-muted",
                      active && "bg-background font-medium"
                    )}
                    onClick={() => setActiveProvince(row.province)}
                  >
                    <span className="truncate">{row.province}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
                  </button>
                </li>
              );
            })}
          </ul>
          <ul
            role="listbox"
            aria-label="城市"
            className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-1"
          >
            {!activeProvince ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">请先选择省份</li>
            ) : (
              cities.map((city) => {
                const selected = city === value;
                return (
                  <li key={city}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={cn(
                        "flex w-full rounded-sm px-2.5 py-2 text-left text-sm hover:bg-muted",
                        selected && "bg-muted/80 font-medium"
                      )}
                      onClick={() => commit(city)}
                    >
                      {city}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
