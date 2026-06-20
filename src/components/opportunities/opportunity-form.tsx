"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import {
  CustomerFieldsSection,
  emptyCustomerDraft,
  type CustomerDraftValues,
} from "@/components/opportunities/customer-fields-section";
import { createOpportunity, updateOpportunity } from "@/app/(dashboard)/opportunities/actions";
import { toExpectedCloseMonthInput } from "@/lib/opportunities/expected-close-date";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { ActionResult } from "@/lib/action-result";
import type { OpportunityStatus } from "@prisma/client";

type SalesOption = { id: string; name: string };

export type OpportunityFormValues = {
  title: string;
  customerId: string;
  expectedAmount: number;
  expectedCloseDate: string;
  stage: string;
  requirementDesc: string | null;
  winProbability: number | null;
  competitor: string | null;
  notes: string | null;
  ownerId: string;
  status?: OpportunityStatus;
  amountLocked?: boolean;
};

type Props = {
  mode: "create" | "edit";
  opportunityId?: string;
  submitLabel: string;
  /** 用于编辑时展示已选客户名称 */
  initialCustomerName?: string;
  stageOptions: ConfigOptionItem[];
  sourceOptions: ConfigOptionItem[];
  typeOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  currentUser: { id: string; name: string };
  /** 普通销售只读展示；不传则使用 currentUser */
  readOnlyOwner?: { id: string; name: string };
  showOwnerSelect?: boolean;
  salesUsers?: SalesOption[];
  initial?: Partial<OpportunityFormValues>;
};

function withEmptyOption(options: ConfigOptionItem[] | undefined, label = "请选择") {
  return [{ value: "", label }, ...(options ?? [])];
}

function buildInitialState(
  currentUserId: string,
  initial?: Partial<OpportunityFormValues>
) {
  return {
    title: initial?.title ?? "",
    customerId: initial?.customerId ?? "",
    expectedAmount:
      initial?.expectedAmount != null ? String(initial.expectedAmount) : "",
    expectedCloseDate: initial?.expectedCloseDate
      ? toExpectedCloseMonthInput(initial.expectedCloseDate)
      : "",
    stage: initial?.stage ?? "",
    requirementDesc: initial?.requirementDesc ?? "",
    winProbability:
      initial?.winProbability != null ? String(initial.winProbability) : "",
    competitor: initial?.competitor ?? "",
    notes: initial?.notes ?? "",
    ownerId: initial?.ownerId ?? currentUserId,
  };
}

function appendCustomerDraft(formData: FormData, customer: CustomerDraftValues) {
  formData.set("name", customer.name);
  formData.set("category", customer.category);
  formData.set("customerType", customer.customerType);
  formData.set("customerGrade", customer.customerGrade);
  formData.set("source", customer.source);
  formData.set("hospitalLevel", customer.hospitalLevel);
  formData.set("bedCount", customer.bedCount);
  formData.set("province", customer.province);
  formData.set("city", customer.city);
  formData.set("district", customer.district);
  formData.set("existingSystem", customer.existingSystem);
  formData.set("ownerId", customer.ownerId);
  formData.set("notes", customer.notes);
}

export function OpportunityForm({
  mode,
  opportunityId,
  submitLabel,
  initialCustomerName,
  stageOptions = [],
  sourceOptions = [],
  typeOptions = [],
  gradeOptions = [],
  currentUser,
  readOnlyOwner,
  showOwnerSelect,
  salesUsers = [],
  initial,
}: Props) {
  const router = useRouter();
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [form, setForm] = useState(() => buildInitialState(currentUser.id, initial));
  const [customerLabel, setCustomerLabel] = useState(initialCustomerName ?? "");
  const [customerDraft, setCustomerDraft] = useState<CustomerDraftValues>(emptyCustomerDraft());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountLocked = initial?.amountLocked ?? false;
  const fixedOwner = readOnlyOwner ?? currentUser;

  function patchForm(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("customerMode", customerMode);
    formData.set("title", form.title);
    formData.set("expectedAmount", form.expectedAmount);
    formData.set("expectedCloseDate", form.expectedCloseDate);
    formData.set("stage", form.stage);
    formData.set("requirementDesc", form.requirementDesc);
    formData.set("winProbability", form.winProbability);
    formData.set("competitor", form.competitor);
    formData.set("notes", form.notes);
    formData.set("ownerId", showOwnerSelect ? form.ownerId : fixedOwner.id);

    if (mode === "create" && customerMode === "existing") {
      formData.set("customerId", form.customerId);
    } else if (mode === "create" && customerMode === "new") {
      appendCustomerDraft(formData, customerDraft);
    } else if (mode === "edit" && initial?.customerId) {
      formData.set("customerMode", "existing");
      formData.set("customerId", initial.customerId);
    }

    startTransition(async () => {
      setError(null);
      try {
        const result: ActionResult =
          mode === "create"
            ? await createOpportunity(formData)
            : await updateOpportunity(opportunityId!, formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "提交失败，请重试");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      {mode === "create" && (
        <div className="space-y-3">
          <Label>销售对象</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="customerModeRadio"
                checked={customerMode === "existing"}
                onChange={() => setCustomerMode("existing")}
              />
              选择已有客户
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="customerModeRadio"
                checked={customerMode === "new"}
                onChange={() => setCustomerMode("new")}
              />
              新建客户
            </label>
          </div>
          {customerMode === "existing" ? (
            <CustomerSearchSelect
              id="customerId"
              name="customerId"
              label="客户 *"
              required
              value={form.customerId}
              selectedLabel={customerLabel}
              onValueChange={(customerId, option) => {
                patchForm({ customerId });
                setCustomerLabel(option?.label ?? "");
              }}
            />
          ) : (
            <CustomerFieldsSection
              values={customerDraft}
              onChange={(patch) => setCustomerDraft((prev) => ({ ...prev, ...patch }))}
              sourceOptions={sourceOptions}
              typeOptions={typeOptions}
              gradeOptions={gradeOptions}
              showOwnerSelect={showOwnerSelect}
              salesUsers={salesUsers}
            />
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="title">商机名称 *</Label>
          <Input
            id="title"
            name="title"
            value={form.title}
            onChange={(e) => patchForm({ title: e.target.value })}
            required
          />
        </div>

        {showOwnerSelect ? (
          <SelectField
            id="ownerId"
            label="负责销售 *"
            name="ownerId"
            options={(salesUsers ?? []).map((u) => ({ value: u.id, label: u.name }))}
            value={form.ownerId}
            onValueChange={(ownerId) => patchForm({ ownerId })}
          />
        ) : (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ownerDisplay">负责销售</Label>
            <Input
              id="ownerDisplay"
              value={fixedOwner.name}
              readOnly
              className="bg-muted"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="expectedAmount">预计金额 *</Label>
          <Input
            id="expectedAmount"
            name="expectedAmount"
            type="number"
            min={0}
            step="0.01"
            value={form.expectedAmount}
            onChange={(e) => patchForm({ expectedAmount: e.target.value })}
            required
            readOnly={amountLocked}
            className={amountLocked ? "bg-muted" : undefined}
          />
          {amountLocked && (
            <p className="text-xs text-muted-foreground">赢单后预计金额不可修改</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="expectedCloseDate">预计签约月份 *</Label>
          <Input
            id="expectedCloseDate"
            name="expectedCloseDate"
            type="month"
            value={form.expectedCloseDate}
            onChange={(e) => patchForm({ expectedCloseDate: e.target.value })}
            required
          />
        </div>

        <SelectField
          id="stage"
          label="商机阶段 *"
          name="stage"
          options={withEmptyOption(stageOptions)}
          value={form.stage}
          onValueChange={(stage) => patchForm({ stage })}
        />

        <div className="space-y-2">
          <Label htmlFor="winProbability">赢单概率 (%)</Label>
          <Input
            id="winProbability"
            name="winProbability"
            type="number"
            min={0}
            max={100}
            value={form.winProbability}
            onChange={(e) => patchForm({ winProbability: e.target.value })}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="requirementDesc">需求描述</Label>
          <Textarea
            id="requirementDesc"
            name="requirementDesc"
            rows={4}
            value={form.requirementDesc}
            onChange={(e) => patchForm({ requirementDesc: e.target.value })}
            placeholder="描述客户需求、痛点与期望"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="competitor">竞争对手</Label>
          <Input
            id="competitor"
            name="competitor"
            value={form.competitor}
            onChange={(e) => patchForm({ competitor: e.target.value })}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">备注</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => patchForm({ notes: e.target.value })}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
