"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import { CustomerTagSelect } from "@/components/customers/customer-tag-select";
import { CoverageProvincesField } from "@/components/customers/coverage-provinces-field";
import { AssistantOwnersField } from "@/components/customers/assistant-owners-field";
import type { CustomerTagDefinition } from "@/lib/customers/tags";
import { CUSTOMER_CATEGORY_LABELS, HOSPITAL_LEVEL_LABELS } from "@/lib/permissions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import { createCustomer, updateCustomer } from "@/app/(dashboard)/customers/actions";
import type { ConfigOptionItem } from "@/lib/config-options";
import {
  asUserFacingError,
  toUserFacingActionError,
  type ActionResult,
  type UserFacingActionError,
} from "@/lib/action-result";
import { ActionErrorDisplay } from "@/components/ui/action-error-display";
import type { CustomerCategory, HospitalLevel } from "@prisma/client";
import {
  categoryLocksToDirectCustomer,
  customerTypeRequiresGrade,
  gradeToneForCustomerType,
  isChannelCustomerType,
  resolveDirectCustomerTypeValue,
} from "@/lib/customers/customer-type-grade";
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
  channelKind: string | null;
  /** 全国性渠道才可勾选覆盖省份 */
  nationwideChannel?: boolean;
  coverageProvinces?: string[];
  notes: string | null;
  ownerId: string | null;
  assistantOwnerIds?: string[];
  /** 编辑个人客户时预填：主联系人姓名/电话（转为公司用） */
  primaryContactName?: string | null;
  primaryContactPhone?: string | null;
};

type Props = {
  mode: "create" | "edit";
  customerId?: string;
  submitLabel: string;
  initial?: Partial<CustomerFormValues>;
  showOwnerSelect?: boolean;
  showAssistantOwnersSelect?: boolean;
  salesUsers?: SalesOption[];
  sourceOptions: ConfigOptionItem[];
  typeOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  channelGradeOptions?: ConfigOptionItem[];
  channelKindOptions?: ConfigOptionItem[];
  tagOptions: CustomerTagDefinition[];
  initialTagValues?: string[];
};

const categoryOptions = Object.entries(CUSTOMER_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function categoryOptionsForEdit(initialCategory: CustomerCategory) {
  if (initialCategory === "INDIVIDUAL") {
    return categoryOptions.filter(
      (opt) => opt.value === "INDIVIDUAL" || opt.value === "COMPANY"
    );
  }
  return categoryOptions.filter((opt) => opt.value !== "INDIVIDUAL");
}

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
  showAssistantOwnersSelect = false,
  salesUsers = [],
  sourceOptions,
  typeOptions,
  gradeOptions,
  channelGradeOptions = [],
  channelKindOptions = [],
  tagOptions,
  initialTagValues = [],
}: Props) {
  const router = useRouter();
  const isCreate = mode === "create";
  const initialCategory = initial?.category ?? "HOSPITAL";
  const [category, setCategory] = useState<CustomerCategory>(initialCategory);
  const [customerType, setCustomerType] = useState(initial?.customerType ?? "");
  const [customerGrade, setCustomerGrade] = useState(initial?.customerGrade ?? "");
  const [channelKind, setChannelKind] = useState(initial?.channelKind ?? "");
  const [nationwideChannel, setNationwideChannel] = useState(
    Boolean(initial?.nationwideChannel)
  );
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
  const [convertContactName, setConvertContactName] = useState(
    initial?.primaryContactName?.trim() || initial?.name || ""
  );
  const [convertContactPhone, setConvertContactPhone] = useState(
    initial?.primaryContactPhone ?? ""
  );
  const [error, setError] = useState<UserFacingActionError | null>(null);
  const [enrichHint, setEnrichHint] = useState<string | null>(null);
  const [nameCorrected, setNameCorrected] = useState(false);
  const [pending, startTransition] = useTransition();
  const [enriching, startEnrichTransition] = useTransition();
  const [selectedOwnerId, setSelectedOwnerId] = useState(
    initial?.ownerId === null || initial?.ownerId === undefined
      ? POOL_OWNER_VALUE
      : initial.ownerId
  );

  const convertingToCompany =
    !isCreate && initialCategory === "INDIVIDUAL" && category === "COMPANY";
  const editableCategoryOptions = isCreate
    ? categoryOptions
    : categoryOptionsForEdit(initialCategory);

  const relationTypeLocked = categoryLocksToDirectCustomer(category);
  const directTypeValue = resolveDirectCustomerTypeValue(typeOptions);
  const showGrade = customerTypeRequiresGrade(customerType, typeOptions);
  const showChannelKind = isChannelCustomerType(customerType, typeOptions);
  const activeGradeOptions = isChannelCustomerType(customerType, typeOptions)
    ? channelGradeOptions
    : gradeOptions;
  const gradeTone = gradeToneForCustomerType(customerType, typeOptions);
  const gradeLabel = isChannelCustomerType(customerType, typeOptions)
    ? "渠道等级"
    : "客户等级";

  useEffect(() => {
    if (!relationTypeLocked) return;
    if (customerType === directTypeValue) return;
    setCustomerType(directTypeValue);
    setCustomerGrade("");
  }, [relationTypeLocked, directTypeValue, customerType]);

  const canEnrich = isCreate && canUseCustomerKimiEnrich(category);

  function handleKimiEnrich() {
    if (!name.trim()) {
      setError(asUserFacingError("请先填写客户名称"));
      return;
    }
    if (!canEnrich) {
      setError(asUserFacingError("仅医院或公司客户支持 Kimi 检索"));
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
        setError(toUserFacingActionError(err, "Kimi 检索失败，请稍后重试"));
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
          setError(asUserFacingError(result.error));
          return;
        }
        if (result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (e) {
        setError(toUserFacingActionError(e));
      }
    });
  }

  const effectiveOwnerId = selectedOwnerId === POOL_OWNER_VALUE ? null : selectedOwnerId;

  return (
    <form action={handleSubmit} className="max-w-2xl space-y-6">
      {isCreate ? (
        <p className="text-sm text-muted-foreground">
          医院/公司可一键核对官方名称，并自动填充等级、床位数与省市区地址；不会写入备注。
          「Kimi 智能填充」仅根据当前客户名称检索，不使用表单中已填地址。
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
        ) : convertingToCompany ? (
          <div className={FORM_FULL_WIDTH}>
            <Label htmlFor="name">公司名称 *</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请填写公司全称，勿沿用个人姓名"
              required
            />
          </div>
        ) : (
          <div className={FORM_FULL_WIDTH}>
            <Label htmlFor="name">客户名称 *</Label>
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
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
            onChange={(e) => {
              const next = e.target.value as CustomerCategory;
              const prev = category;
              setCategory(next);
              if (categoryLocksToDirectCustomer(next)) {
                setCustomerType(resolveDirectCustomerTypeValue(typeOptions));
                setCustomerGrade("");
              }
              if (!isCreate && initialCategory === "INDIVIDUAL") {
                if (next === "COMPANY" && prev === "INDIVIDUAL") {
                  setConvertContactName(
                    initial?.primaryContactName?.trim() || initial?.name || ""
                  );
                  setConvertContactPhone(initial?.primaryContactPhone ?? "");
                  setName("");
                } else if (next === "INDIVIDUAL" && prev === "COMPANY") {
                  setName(initial?.name ?? "");
                }
              }
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {editableCategoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {convertingToCompany ? (
          <div className="md:col-span-2 space-y-4 rounded-md border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                转为公司客户
              </p>
              <p className="text-sm text-amber-800/90 dark:text-amber-200/90">
                原个人「{initial?.name}」将作为该公司的主联系人；历史跟进、商机、合同仍归属本条客户记录。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="convertContactName">联系人姓名 *</Label>
                <Input
                  id="convertContactName"
                  name="convertContactName"
                  value={convertContactName}
                  onChange={(e) => setConvertContactName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="convertContactPhone">联系人手机</Label>
                <Input
                  id="convertContactPhone"
                  name="convertContactPhone"
                  value={convertContactPhone}
                  onChange={(e) => setConvertContactPhone(e.target.value)}
                  placeholder="可选"
                />
              </div>
            </div>
          </div>
        ) : null}

        <SelectField
          id="customerType"
          label="关系类型 *"
          name="customerType"
          options={withEmptyOption(typeOptions)}
          value={customerType}
          onValueChange={(value) => {
            if (relationTypeLocked) return;
            setCustomerType(value);
            setCustomerGrade("");
            if (!isChannelCustomerType(value, typeOptions)) {
              setChannelKind("");
              setNationwideChannel(false);
            }
          }}
          required
          disabled={relationTypeLocked}
          description={
            relationTypeLocked ? "医院客户关系类型固定为直接客户" : undefined
          }
          className={FORM_GRID_CELL}
          labelClassName={FORM_GRID_LABEL}
        />

        {showChannelKind ? (
          <SelectField
            id="channelKind"
            label="渠道类型 *"
            name="channelKind"
            options={withEmptyOption(channelKindOptions)}
            value={channelKind}
            onValueChange={setChannelKind}
            required
            description="信息化集成商 / HRP 厂商 / 友商 / 其他（含运营商）"
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
          />
        ) : (
          <input type="hidden" name="channelKind" value="" />
        )}

        {showChannelKind ? (
          <div className={cn(FORM_FULL_WIDTH, "space-y-3")}>
            <label className="flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                name="nationwideChannel"
                value="1"
                checked={nationwideChannel}
                onChange={(e) => setNationwideChannel(e.target.checked)}
                className="mt-0.5 size-3.5 rounded border"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium leading-snug">全国性渠道</span>
                <span className="block text-xs text-muted-foreground">
                  仅全国性渠道可勾选覆盖省份；普通渠道按档案所在省/市统计，无需勾选，避免误操作。
                </span>
              </span>
            </label>
            {nationwideChannel ? (
              <CoverageProvincesField defaultValue={initial?.coverageProvinces ?? []} />
            ) : null}
          </div>
        ) : null}

        {showGrade ? (
          <CustomerGradeSelect
            value={customerGrade}
            onValueChange={setCustomerGrade}
            options={activeGradeOptions}
            required
            label={gradeLabel}
            tone={gradeTone}
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
          />
        ) : (
          <input type="hidden" name="customerGrade" value="" />
        )}

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
            value={selectedOwnerId}
            onValueChange={setSelectedOwnerId}
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
          />
        )}

        {showAssistantOwnersSelect && salesUsers.length > 0 ? (
          <AssistantOwnersField
            salesUsers={salesUsers}
            ownerId={effectiveOwnerId}
            initialIds={initial?.assistantOwnerIds ?? []}
          />
        ) : null}

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
      <ActionErrorDisplay error={error} />

      <div className="sticky bottom-0 z-10 -mx-1 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button type="submit" disabled={pending}>
          {pending
            ? "提交中…"
            : convertingToCompany
              ? "确认转为公司"
              : submitLabel}
        </Button>
      </div>
    </form>
  );
}
