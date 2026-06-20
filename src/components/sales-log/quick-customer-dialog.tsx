"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import { CustomerTagSelect } from "@/components/customers/customer-tag-select";
import type { CustomerTagDefinition } from "@/lib/customers/tags";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CUSTOMER_CATEGORY_LABELS, HOSPITAL_LEVEL_LABELS } from "@/lib/permissions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { CustomerCategory, HospitalLevel } from "@prisma/client";
import { cn } from "@/lib/utils";
import {
  applyCustomerKimiEnrich,
  canUseCustomerKimiEnrich,
  fetchCustomerKimiEnrich,
} from "@/lib/customers/kimi-enrich-ui";

type SalesOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialProvince?: string;
  initialCity?: string;
  initialDistrict?: string;
  sourceOptions: ConfigOptionItem[];
  typeOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  tagOptions: CustomerTagDefinition[];
  showOwnerSelect?: boolean;
  salesUsers?: SalesOption[];
  onCreated: (customer: { id: string; name: string }) => void;
};

const categoryOptions = [
  { value: "", label: "请选择" },
  ...Object.entries(CUSTOMER_CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const hospitalLevelOptions = [
  { value: "", label: "请选择" },
  ...Object.entries(HOSPITAL_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
];

function withEmptyOption(options: ConfigOptionItem[], label = "请选择") {
  return [{ value: "", label }, ...options];
}

export function QuickCustomerDialog({
  open,
  onOpenChange,
  initialName = "",
  initialProvince = "",
  initialCity = "",
  initialDistrict = "",
  sourceOptions,
  typeOptions,
  gradeOptions,
  tagOptions,
  showOwnerSelect,
  salesUsers = [],
  onCreated,
}: Props) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<CustomerCategory | "">("");
  const [hospitalLevel, setHospitalLevel] = useState<HospitalLevel | "">("");
  const [bedCount, setBedCount] = useState("");
  const [province, setProvince] = useState(initialProvince);
  const [city, setCity] = useState(initialCity);
  const [district, setDistrict] = useState(initialDistrict);
  const [existingSystem, setExistingSystem] = useState("");
  const [source, setSource] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [customerGrade, setCustomerGrade] = useState("");
  const [tagValues, setTagValues] = useState<string[]>([]);
  const [ownerId, setOwnerId] = useState(POOL_OWNER_VALUE);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enrichHint, setEnrichHint] = useState<string | null>(null);
  const [nameCorrected, setNameCorrected] = useState(false);
  const [pending, startTransition] = useTransition();
  const [enriching, startEnrichTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setProvince(initialProvince);
    setCity(initialCity);
    setDistrict(initialDistrict);
    setCategory("");
    setHospitalLevel("");
    setBedCount("");
    setExistingSystem("");
    setSource("");
    setCustomerType("");
    setCustomerGrade("");
    setTagValues([]);
    setOwnerId(POOL_OWNER_VALUE);
    setNotes("");
    setError(null);
    setEnrichHint(null);
    setNameCorrected(false);
  }, [open, initialName, initialProvince, initialCity, initialDistrict]);

  const canEnrich = category !== "" && canUseCustomerKimiEnrich(category);

  function handleKimiEnrich() {
    if (!name.trim()) {
      setError("请先填写客户名称");
      return;
    }
    if (!canEnrich || !category) {
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
      } catch (error) {
        setError(error instanceof Error ? error.message : "Kimi 检索失败，请稍后重试");
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!category) {
      setError("请选择客户类别");
      return;
    }
    if (!customerType.trim()) {
      setError("请选择关系类型");
      return;
    }
    if (!customerGrade.trim()) {
      setError("请选择客户等级");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/customers/quick-create", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            category,
            hospitalLevel: category === "HOSPITAL" && hospitalLevel ? hospitalLevel : null,
            province: province || undefined,
            city: city || undefined,
            district: district || undefined,
            bedCount: category === "HOSPITAL" && bedCount ? Number(bedCount) : null,
            existingSystem: existingSystem || undefined,
            source: source || null,
            customerType: customerType || undefined,
            customerGrade: customerGrade || undefined,
            tagValues,
            ownerId: showOwnerSelect ? ownerId : null,
            notes: notes || undefined,
          }),
        });
        const data = (await res.json()) as { id?: string; name?: string; error?: string };
        if (!res.ok || !data.id || !data.name) {
          setError(data.error || "创建客户失败");
          return;
        }
        onCreated({ id: data.id, name: data.name });
        onOpenChange(false);
      } catch {
        setError("创建客户失败，请稍后重试");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增客户</DialogTitle>
          <DialogDescription>
            医院/公司可一键核对官方名称，并自动填充等级、床位数与省市区地址；不会写入备注。保存后回到往来打卡。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1 space-y-2">
              <Label htmlFor="quickCustomerName">客户名称 *</Label>
              <Input
                id="quickCustomerName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickCustomerCategory">客户类别 *</Label>
              <select
                id="quickCustomerCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value as CustomerCategory | "")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {categoryOptions.map((opt) => (
                  <option key={opt.value || "empty"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <SelectField
              id="quickCustomerType"
              label="关系类型 *"
              name="customerType"
              options={withEmptyOption(typeOptions)}
              value={customerType}
              onValueChange={setCustomerType}
              required
            />

            <CustomerGradeSelect value={customerGrade} onValueChange={setCustomerGrade} required />

            <CustomerTagSelect options={tagOptions} value={tagValues} onValueChange={setTagValues} />

            <SelectField
              id="quickCustomerSource"
              label="客户来源"
              name="source"
              options={withEmptyOption(sourceOptions)}
              value={source}
              onValueChange={setSource}
            />

            {category === "HOSPITAL" && (
              <>
                <SelectField
                  id="quickHospitalLevel"
                  label="医院等级"
                  name="hospitalLevel"
                  options={hospitalLevelOptions}
                  value={hospitalLevel}
                  onValueChange={(v) => setHospitalLevel(v as HospitalLevel | "")}
                />
                <div className="space-y-2">
                  <Label htmlFor="quickBedCount">床位数</Label>
                  <Input
                    id="quickBedCount"
                    type="number"
                    min={1}
                    value={bedCount}
                    onChange={(e) => setBedCount(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="quickCustomerProvince">省</Label>
              <Input id="quickCustomerProvince" value={province} onChange={(e) => setProvince(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickCustomerCity">市</Label>
              <Input id="quickCustomerCity" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickCustomerDistrict">区/县</Label>
              <Input id="quickCustomerDistrict" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="quickExistingSystem">现有系统</Label>
              <Input
                id="quickExistingSystem"
                value={existingSystem}
                onChange={(e) => setExistingSystem(e.target.value)}
              />
            </div>

            {showOwnerSelect && (
              <SelectField
                id="quickOwnerId"
                label="负责人"
                name="ownerId"
                options={[
                  { value: POOL_OWNER_VALUE, label: "公海池（未分配）" },
                  ...salesUsers.map((u) => ({ value: u.id, label: u.name })),
                ]}
                value={ownerId}
                onValueChange={setOwnerId}
              />
            )}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="quickCustomerNotes">备注</Label>
              <Textarea
                id="quickCustomerNotes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="submit"
              disabled={
                pending ||
                !name.trim() ||
                !category ||
                !customerType.trim() ||
                !customerGrade.trim()
              }
            >
              {pending ? "创建中…" : "创建并返回"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
