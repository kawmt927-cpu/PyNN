"use client";

import { COVERAGE_PROVINCE_OPTIONS } from "@/lib/geo/china-centroids";
import { cn } from "@/lib/utils";

type Props = {
  defaultValue?: string[];
  className?: string;
  /** form field name，默认 coverageProvinces */
  name?: string;
  label?: string;
  description?: string;
};

export function CoverageProvincesField({
  defaultValue = [],
  className,
  name = "coverageProvinces",
  label = "覆盖省份",
  description = "勾选适用的省区。",
}: Props) {
  const selected = new Set(defaultValue);

  return (
    <div className={cn("space-y-2 md:col-span-2", className)}>
      <p className="text-sm font-medium leading-snug">{label}</p>
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="grid grid-cols-3 gap-2 rounded-md border p-3 sm:grid-cols-4 md:grid-cols-6">
        {COVERAGE_PROVINCE_OPTIONS.map((province) => (
          <label
            key={province}
            className="inline-flex items-center gap-1.5 text-sm"
          >
            <input
              type="checkbox"
              name={name}
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
