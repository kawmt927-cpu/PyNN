"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import { CustomerTagSelect } from "@/components/customers/customer-tag-select";
import type { CustomerTagDefinition } from "@/lib/customers/tags";
import { CUSTOMER_CATEGORY_LABELS, HOSPITAL_LEVEL_LABELS } from "@/lib/permissions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import { createCustomer, updateCustomer } from "@/app/(dashboard)/customers/actions";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { ActionResult } from "@/lib/action-result";
import type { CustomerCategory, HospitalLevel } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  applyCustomerKimiEnrich,
  canUseCustomerKimiEnrich,
  fetchCustomerKimiEnrich,
} from "@/lib/customers/kimi-enrich-ui";

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
  tagOptions: CustomerTagDefinition[];
  initialTagValues?: string[];
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

/** 两列网格内统一标签行高，使左右输入框对齐 */
const FORM_GRID_CELL = "grid min-w-0 grid-rows-[2.75rem_auto] gap-2 space-y-0";
const FORM_GRID_LABEL = "self-end leading-snug";
const FORM_FULL_WIDTH = "space-y-2 md:col-span-2";

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
  tagOptions,
  initialTagValues = [],
}: Props) {
  const router = useRouter();
  const isCreate = mode === "create";
  const [category, setCategory] = useState<CustomerCategory>(initial?.category ?? "HOSPITAL");
  const [name, setName] = useState(initial?.name ?? "");
  const [province, setProvince] = useState(initial?.province ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [hospitalLevel, setHospitalLevel] = useState<HospitalLevel | "">(
    initial?.hospitalLevel ?? ""
  );
  const [bedCount, setBedCount] = useState(
    initial?.bedCount != null ? String(initial.bedCount) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [enrichHint, setEnrichHint] = useState<string | null>(null);
  const [nameCorrected, setNameCorrected] = useState(false);
  const [pending, startTransition] = useTransition();
  const [enriching, startEnrichTransition] = useTransition();

  const canEnrich = isCreate && canUseCustomerKimiEnrich(category);

  function handleKimiEnrich() {
    if (!name.trim()) {
      setError("请先填写客户名称");
      return;
    }
    if (!canEnrich) {
      setError("仅医院或公司客户支持 Kimi 检索");
      return;
    }
    setError(null);
    setEnrichHint(null);
    setNameCorrected(false);
    startEnrichTransition(async () => {
      try {
        const data = await fetchCustomerKimiEnrich({
          name,
          category,
          province,
          city,
          district,
        });
        const result = applyCustomerKimiEnrich(data, {
          name,
          category,
          setName,
          setProvince,
          setCity,
          setDistrict,
          setHospitalLevel,
          setBedCount,
        });
        setEnrichHint(result.hints);
        setNameCorrected(result.nameCorrected);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kimi 检索失败，请稍后重试");
      }
    });
  }

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
      {isCreate ? (
        <p className="text-sm text-muted-foreground">
          医院/公司可一键核对官方名称，并自动填充等级、床位数与省市区地址；不会写入备注。
        </p>
      ) : null}
      <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
        {isCreate ? (
          <div className="flex flex-wrap items-end gap-2 md:col-span-2">
            <div className="min-w-[240px] flex-1 space-y-2">
              <Label htmlFor="name">客户名称 *</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            {canEnrich ? (
              <Button
                type="button"
                variant="secondary"
                disabled={enriching || !name.trim()}
                onClick={handleKimiEnrich}
              >
                {enriching ? "Kimi 检索中…" : "Kimi 智能填充"}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className={FORM_FULL_WIDTH}>
            <Label htmlFor="name">客户名称 *</Label>
            <Input id="name" name="name" defaultValue={initial?.name ?? ""} required />
          </div>
        )}

        <div className={FORM_GRID_CELL}>
          <Label htmlFor="category" className={FORM_GRID_LABEL}>
            客户类别 *
          </Label>
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
          label="关系类型 *"
          name="customerType"
          options={withEmptyOption(typeOptions)}
          defaultValue={initial?.customerType ?? ""}
          required
          className={FORM_GRID_CELL}
          labelClassName={FORM_GRID_LABEL}
        />

        <CustomerGradeSelect
          defaultValue={initial?.customerGrade ?? ""}
          options={gradeOptions}
          required
          className={FORM_GRID_CELL}
          labelClassName={FORM_GRID_LABEL}
        />

        <CustomerTagSelect
          options={tagOptions}
          defaultValue={initialTagValues}
          className={FORM_GRID_CELL}
          labelClassName={FORM_GRID_LABEL}
        />

        <SelectField
          id="source"
          label="客户来源"
          name="source"
          options={withEmptyOption(sourceOptions)}
          defaultValue={initial?.source ?? ""}
          className={FORM_GRID_CELL}
          labelClassName={FORM_GRID_LABEL}
        />

        {category === "HOSPITAL" && (
          <>
            {isCreate ? (
              <>
                <SelectField
                  id="hospitalLevel"
                  label="医院等级"
                  name="hospitalLevel"
                  options={hospitalLevelOptions}
                  value={hospitalLevel}
                  onValueChange={(value) => setHospitalLevel(value as HospitalLevel | "")}
                  className={FORM_GRID_CELL}
                  labelClassName={FORM_GRID_LABEL}
                />
                <div className={FORM_GRID_CELL}>
                  <Label htmlFor="bedCount" className={FORM_GRID_LABEL}>
                    床位数
                  </Label>
                  <Input
                    id="bedCount"
                    name="bedCount"
                    type="number"
                    min={1}
                    value={bedCount}
                    onChange={(e) => setBedCount(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <SelectField
                  id="hospitalLevel"
                  label="医院等级"
                  name="hospitalLevel"
                  options={hospitalLevelOptions}
                  defaultValue={initial?.hospitalLevel ?? ""}
                  className={FORM_GRID_CELL}
                  labelClassName={FORM_GRID_LABEL}
                />
                <div className={FORM_GRID_CELL}>
                  <Label htmlFor="bedCount" className={FORM_GRID_LABEL}>
                    床位数
                  </Label>
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
          </>
        )}

        {isCreate ? (
          <>
            <div className={FORM_GRID_CELL}>
              <Label htmlFor="province" className={FORM_GRID_LABEL}>
                省
              </Label>
              <Input
                id="province"
                name="province"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              />
            </div>
            <div className={FORM_GRID_CELL}>
              <Label htmlFor="city" className={FORM_GRID_LABEL}>
                市
              </Label>
              <Input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className={FORM_GRID_CELL}>
              <Label htmlFor="district" className={FORM_GRID_LABEL}>
                区/县
              </Label>
              <Input
                id="district"
                name="district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </div>
          </>
        ) : (
          <>
            <div className={FORM_GRID_CELL}>
              <Label htmlFor="province" className={FORM_GRID_LABEL}>
                省
              </Label>
              <Input id="province" name="province" defaultValue={initial?.province ?? ""} />
            </div>
            <div className={FORM_GRID_CELL}>
              <Label htmlFor="city" className={FORM_GRID_LABEL}>
                市
              </Label>
              <Input id="city" name="city" defaultValue={initial?.city ?? ""} />
            </div>
            <div className={FORM_GRID_CELL}>
              <Label htmlFor="district" className={FORM_GRID_LABEL}>
                区/县
              </Label>
              <Input id="district" name="district" defaultValue={initial?.district ?? ""} />
            </div>
          </>
        )}

        <div className={FORM_FULL_WIDTH}>
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
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
          />
        )}

        <div className={FORM_FULL_WIDTH}>
          <Label htmlFor="notes">备注</Label>
          <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} rows={4} />
        </div>
      </div>

      {enrichHint ? (
        <p
          className={cn(
            "text-sm",
            nameCorrected
              ? "text-amber-700 dark:text-amber-400"
              : "text-green-600 dark:text-green-400"
          )}
        >
          {enrichHint}
        </p>
      ) : null}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
