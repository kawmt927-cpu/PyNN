"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
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
  showOwnerSelect?: boolean;
  salesUsers?: SalesOption[];
  onCreated: (customer: { id: string; name: string }) => void;
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
  showOwnerSelect,
  salesUsers = [],
  onCreated,
}: Props) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<CustomerCategory>("HOSPITAL");
  const [hospitalLevel, setHospitalLevel] = useState<HospitalLevel | "">("");
  const [bedCount, setBedCount] = useState("");
  const [province, setProvince] = useState(initialProvince);
  const [city, setCity] = useState(initialCity);
  const [district, setDistrict] = useState(initialDistrict);
  const [existingSystem, setExistingSystem] = useState("");
  const [source, setSource] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [customerGrade, setCustomerGrade] = useState("");
  const [ownerId, setOwnerId] = useState(POOL_OWNER_VALUE);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enrichHint, setEnrichHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [enriching, startEnrichTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setProvince(initialProvince);
    setCity(initialCity);
    setDistrict(initialDistrict);
    setCategory("HOSPITAL");
    setHospitalLevel("");
    setBedCount("");
    setExistingSystem("");
    setSource("");
    setCustomerType("");
    setCustomerGrade("");
    setOwnerId(POOL_OWNER_VALUE);
    setNotes("");
    setError(null);
    setEnrichHint(null);
  }, [open, initialName, initialProvince, initialCity, initialDistrict]);

  const canEnrich = category === "HOSPITAL" || category === "COMPANY";

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
    startEnrichTransition(async () => {
      try {
        const res = await fetch("/api/customers/enrich", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, category, province, city, district }),
        });
        const data = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) {
          setError(data.error || "Kimi 检索失败");
          return;
        }
        if (typeof data.province === "string" && data.province) setProvince(data.province);
        if (typeof data.city === "string" && data.city) setCity(data.city);
        if (typeof data.district === "string" && data.district) setDistrict(data.district);
        if (typeof data.hospitalLevel === "string" && data.hospitalLevel) {
          setHospitalLevel(data.hospitalLevel as HospitalLevel);
        }
        if (data.bedCount != null && data.bedCount !== "") {
          setBedCount(String(data.bedCount));
        }
        if (typeof data.existingSystem === "string" && data.existingSystem) {
          setExistingSystem(data.existingSystem);
        }
        if (typeof data.notes === "string" && data.notes) {
          setNotes((prev) => (prev ? `${prev}\n${data.notes}` : (data.notes as string)));
        }
        const summary = typeof data.summary === "string" ? data.summary : null;
        setEnrichHint(summary ? `Kimi 已填充：${summary}` : "Kimi 已填充相关字段，请核对后保存");
      } catch {
        setError("Kimi 检索失败，请稍后重试");
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
            customerType: customerType || null,
            customerGrade: customerGrade || null,
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
            字段与 CRM 客户档案一致。医院/公司可一键用 Kimi 检索公开信息；保存后回到往来打卡。
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
                onChange={(e) => setCategory(e.target.value as CustomerCategory)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              >
                {categoryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <SelectField
              id="quickCustomerType"
              label="客户类型"
              name="customerType"
              options={withEmptyOption(typeOptions)}
              value={customerType}
              onValueChange={setCustomerType}
            />

            <SelectField
              id="quickCustomerGrade"
              label="客户等级"
              name="customerGrade"
              options={withEmptyOption(gradeOptions)}
              value={customerGrade}
              onValueChange={setCustomerGrade}
            />

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

          {enrichHint ? <p className="text-sm text-green-600">{enrichHint}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "创建中…" : "创建并返回"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
