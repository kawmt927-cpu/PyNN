"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CUSTOMER_CATEGORY_LABELS, HOSPITAL_LEVEL_LABELS } from "@/lib/permissions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import { createCustomer, updateCustomer } from "@/app/(dashboard)/customers/actions";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { ActionResult } from "@/lib/action-result";
import type { CustomerCategory, HospitalLevel } from "@prisma/client";

type SalesOption = { id: string; name: string };

type CustomerFormValues = {
  name: string;
  category: CustomerCategory;
  hospitalLevel: HospitalLevel | null;
  province: string | null;
  city: string | null;
  district: string | null;
  bedCount: number | null;
  existingSystem: string | null;
  source: string | null;
  customerType: string | null;
  customerGrade: string | null;
  notes: string | null;
  ownerId: string | null;
};

type Props = {
  mode: "create" | "edit";
  customerId?: string;
  submitLabel: string;
  initial?: Partial<CustomerFormValues>;
  showOwnerSelect?: boolean;
  salesUsers?: SalesOption[];
  sourceOptions: ConfigOptionItem[];
  typeOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
};

const categoryOptions = Object.entries(CUSTOMER_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const hospitalLevelOptions = [
  { value: "", label: "请选择" },
  ...Object.entries(HOSPITAL_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
];

function withEmptyOption(options: ConfigOptionItem[], label = "请选择") {
  return [{ value: "", label }, ...options];
}

export function CustomerForm({
  mode,
  customerId,
  submitLabel,
  initial,
  showOwnerSelect,
  salesUsers = [],
  sourceOptions,
  typeOptions,
  gradeOptions,
}: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<CustomerCategory>(initial?.category ?? "HOSPITAL");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      try {
        const result: ActionResult =
          mode === "create"
            ? await createCustomer(formData)
            : await updateCustomer(customerId!, formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (message.includes("was not found on the server")) {
          setError("页面已过期，请刷新后重试");
          return;
        }
        setError(message || "提交失败，请重试");
      }
    });
  }

  const defaultOwner =
    initial?.ownerId === null || initial?.ownerId === undefined
      ? POOL_OWNER_VALUE
      : initial.ownerId;

  return (
    <form action={handleSubmit} className="max-w-2xl space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name">客户名称 *</Label>
          <Input id="name" name="name" defaultValue={initial?.name ?? ""} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">客户类别 *</Label>
          <select
            id="category"
            name="category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as CustomerCategory)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <SelectField
          id="customerType"
          label="客户类型"
          name="customerType"
          options={withEmptyOption(typeOptions)}
          defaultValue={initial?.customerType ?? ""}
        />

        <SelectField
          id="customerGrade"
          label="客户等级"
          name="customerGrade"
          options={withEmptyOption(gradeOptions)}
          defaultValue={initial?.customerGrade ?? ""}
        />

        <SelectField
          id="source"
          label="客户来源"
          name="source"
          options={withEmptyOption(sourceOptions)}
          defaultValue={initial?.source ?? ""}
        />

        {category === "HOSPITAL" && (
          <>
            <SelectField
              id="hospitalLevel"
              label="医院等级"
              name="hospitalLevel"
              options={hospitalLevelOptions}
              defaultValue={initial?.hospitalLevel ?? ""}
            />
            <div className="space-y-2">
              <Label htmlFor="bedCount">床位数</Label>
              <Input
                id="bedCount"
                name="bedCount"
                type="number"
                min={1}
                defaultValue={initial?.bedCount ?? ""}
              />
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="province">省</Label>
          <Input id="province" name="province" defaultValue={initial?.province ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">市</Label>
          <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="district">区/县</Label>
          <Input id="district" name="district" defaultValue={initial?.district ?? ""} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="existingSystem">现有系统</Label>
          <Input
            id="existingSystem"
            name="existingSystem"
            defaultValue={initial?.existingSystem ?? ""}
          />
        </div>

        {showOwnerSelect && (
          <SelectField
            id="ownerId"
            label="负责人"
            name="ownerId"
            options={[
              { value: POOL_OWNER_VALUE, label: "公海池（未分配）" },
              ...salesUsers.map((u) => ({ value: u.id, label: u.name })),
            ]}
            defaultValue={defaultOwner}
          />
        )}

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">备注</Label>
          <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} rows={4} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
