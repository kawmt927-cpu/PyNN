"use client";

import { COVERAGE_PROVINCE_OPTIONS } from "@/lib/geo/china-centroids";
import { cn } from "@/lib/utils";

type Props = {
  defaultValue?: string[];
  className?: string;
};

export function CoverageProvincesField({ defaultValue = [], className }: Props) {
  const selected = new Set(defaultValue);

  return (
    <div className={cn("space-y-2 md:col-span-2", className)}>
      <p className="text-sm font-medium leading-snug">覆盖省份</p>
      <p className="text-xs text-muted-foreground">
        总公司可只录一家；勾选实际覆盖的省区，用于按省统计渠道数量（地图不打渠道锚点）。
      </p>
      <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-4 md:grid-cols-6">
        {COVERAGE_PROVINCE_OPTIONS.map((province) => (
          <label
            key={province}
            className="inline-flex items-center gap-1.5 text-sm"
          >
            <input
              type="checkbox"
              name="coverageProvinces"
              value={province}
              defaultChecked={selected.has(province)}
              className="size-3.5 rounded border"
            />
            {province}
          </label>
        ))}
      </div>
    </div>
  );
}
