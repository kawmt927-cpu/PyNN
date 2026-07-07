"use client";

import { useEffect, useState } from "react";
import type { CustomerListView } from "@/lib/customers/access";
import { Label } from "@/components/ui/label";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type RegionOptions = {
  provinces: string[];
  cities: string[];
  districts: string[];
};

type Props = {
  view: CustomerListView;
  province: string;
  city: string;
  district: string;
  onChange: (patch: { province?: string; city?: string; district?: string }) => void;
};

function RegionSelect({
  id,
  label,
  value,
  placeholder,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={selectClassName}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CustomerRegionFilter({ view, province, city, district, onChange }: Props) {
  const [options, setOptions] = useState<RegionOptions>({
    provinces: [],
    cities: [],
    districts: [],
  });

  useEffect(() => {
    const params = new URLSearchParams({ view });
    if (province) params.set("province", province);
    if (city) params.set("city", city);

    let cancelled = false;
    void fetch(`/api/customers/region-options?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : { provinces: [], cities: [], districts: [] }))
      .then((data: RegionOptions) => {
        if (!cancelled) setOptions(data);
      })
      .catch(() => {
        if (!cancelled) setOptions({ provinces: [], cities: [], districts: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [view, province, city]);

  return (
    <>
      <RegionSelect
        id="customer-province"
        label="省份"
        value={province}
        placeholder="全国"
        options={options.provinces}
        onChange={(nextProvince) =>
          onChange({ province: nextProvince, city: "", district: "" })
        }
      />
      <RegionSelect
        id="customer-city"
        label="城市"
        value={city}
        placeholder="全部"
        options={options.cities}
        disabled={!province}
        onChange={(nextCity) => onChange({ city: nextCity, district: "" })}
      />
      <RegionSelect
        id="customer-district"
        label="区/县"
        value={district}
        placeholder="全部"
        options={options.districts}
        disabled={!province || !city}
        onChange={(nextDistrict) => onChange({ district: nextDistrict })}
      />
    </>
  );
}
