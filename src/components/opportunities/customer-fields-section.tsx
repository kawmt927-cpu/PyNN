"use client";

import { CUSTOMER_CATEGORY_LABELS, HOSPITAL_LEVEL_LABELS } from "@/lib/permissions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { CustomerCategory } from "@prisma/client";

type SalesOption = { id: string; name: string };

export type CustomerDraftValues = {
  name: string;
  category: CustomerCategory;
  customerType: string;
  customerGrade: string;
  source: string;
  hospitalLevel: string;
  bedCount: string;
  province: string;
  city: string;
  district: string;
  existingSystem: string;
  ownerId: string;
  notes: string;
};

export const emptyCustomerDraft = (): CustomerDraftValues => ({
  name: "",
  category: "HOSPITAL",
  customerType: "",
  customerGrade: "",
  source: "",
  hospitalLevel: "",
  bedCount: "",
  province: "",
  city: "",
  district: "",
  existingSystem: "",
  ownerId: POOL_OWNER_VALUE,
  notes: "",
});

type Props = {
  values: CustomerDraftValues;
  onChange: (patch: Partial<CustomerDraftValues>) => void;
  sourceOptions: ConfigOptionItem[];
  typeOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  showOwnerSelect?: boolean;
  salesUsers?: SalesOption[];
};

const categoryOptions = Object.entries(CUSTOMER_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const hospitalLevelOptions = [
  { value: "", label: "请选择" },
  ...Object.entries(HOSPITAL_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
];

function withEmptyOption(options: ConfigOptionItem[] | undefined, label = "请选择") {
  return [{ value: "", label }, ...(options ?? [])];
}

export function CustomerFieldsSection({
  values,
  onChange,
  sourceOptions,
  typeOptions,
  gradeOptions,
  showOwnerSelect,
  salesUsers = [],
}: Props) {
  return (
    <div className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-2">
      <p className="text-sm font-medium md:col-span-2">新建客户（销售对象）</p>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="name">客户名称 *</Label>
        <Input
          id="name"
          name="name"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">客户类别 *</Label>
        <select
          id="category"
          name="category"
          required
          value={values.category}
          onChange={(e) => onChange({ category: e.target.value as CustomerCategory })}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
        value={values.customerType}
        onValueChange={(customerType) => onChange({ customerType })}
        required
      />

      <CustomerGradeSelect
        value={values.customerGrade}
        onValueChange={(customerGrade) => onChange({ customerGrade })}
        required
      />

      <SelectField
        id="source"
        label="客户来源"
        name="source"
        options={withEmptyOption(sourceOptions)}
        value={values.source}
        onValueChange={(source) => onChange({ source })}
      />

      {values.category === "HOSPITAL" && (
        <>
          <SelectField
            id="hospitalLevel"
            label="医院等级"
            name="hospitalLevel"
            options={hospitalLevelOptions}
            value={values.hospitalLevel}
            onValueChange={(hospitalLevel) => onChange({ hospitalLevel })}
          />
          <div className="space-y-2">
            <Label htmlFor="bedCount">床位数</Label>
            <Input
              id="bedCount"
              name="bedCount"
              type="number"
              min={1}
              value={values.bedCount}
              onChange={(e) => onChange({ bedCount: e.target.value })}
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="province">省</Label>
        <Input
          id="province"
          name="province"
          value={values.province}
          onChange={(e) => onChange({ province: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="city">市</Label>
        <Input
          id="city"
          name="city"
          value={values.city}
          onChange={(e) => onChange({ city: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="district">区/县</Label>
        <Input
          id="district"
          name="district"
          value={values.district}
          onChange={(e) => onChange({ district: e.target.value })}
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="existingSystem">现有系统</Label>
        <Input
          id="existingSystem"
          name="existingSystem"
          value={values.existingSystem}
          onChange={(e) => onChange({ existingSystem: e.target.value })}
        />
      </div>

      {showOwnerSelect && (
        <SelectField
          id="ownerId"
          label="客户负责人"
          name="ownerId"
          options={[
            { value: POOL_OWNER_VALUE, label: "公海池（未分配）" },
            ...((salesUsers ?? []).map((u) => ({ value: u.id, label: u.name }))),
          ]}
          value={values.ownerId}
          onValueChange={(ownerId) => onChange({ ownerId })}
        />
      )}

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="customerNotes">客户备注</Label>
        <Textarea
          id="customerNotes"
          name="notes"
          rows={3}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}
