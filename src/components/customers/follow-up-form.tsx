"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import { OpportunityLinkPicker } from "@/components/sales-log/opportunity-link-picker";
import {
  defaultOpportunitySelection,
  useCustomerNotSignedOpportunities,
} from "@/components/sales-log/use-customer-not-signed-opportunities";
import { ContactSelectField } from "@/components/sales-log/contact-select-field";
import { QuickOpportunityDialog } from "@/components/sales-log/quick-opportunity-dialog";
import { NextFollowUpPlanFields } from "@/components/sales-log/next-follow-up-plan-fields";
import { CustomerPendingFollowPlansPanel } from "@/components/customers/customer-pending-follow-plans-panel";
import {
  CompletePendingFollowUpDialog,
  planSelectionKey,
} from "@/components/customers/complete-pending-follow-up-dialog";
import { validateNextFollowUpPlan } from "@/lib/sales-log/next-follow-up-plan";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import { createFollowUp } from "@/app/(dashboard)/customers/actions";
import {
  customerGradeFormValue,
  customerGradeSubmitValue,
} from "@/lib/customers/grade";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { SerializedCustomerPendingFollowPlan } from "@/lib/follow-ups/unified";

type Props = {
  customerId: string;
  customerName: string;
  currentCustomerGrade?: string | null;
  stageOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  pendingPlans?: SerializedCustomerPendingFollowPlan[];
};

function todayLocalDatetime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function FollowUpForm({
  customerId,
  customerName,
  currentCustomerGrade,
  stageOptions,
  gradeOptions,
  pendingPlans = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<SalesLogMethod>("PHONE");
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [opportunityIds, setOpportunityIds] = useState<string[]>([]);
  const { options: opportunityOptions } = useCustomerNotSignedOpportunities(customerId);
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedPendingKeys, setSelectedPendingKeys] = useState<string[]>([]);
  const [pendingForm, setPendingForm] = useState<HTMLFormElement | null>(null);
  const [suggestedGrade, setSuggestedGrade] = useState(() =>
    customerGradeFormValue(currentCustomerGrade)
  );
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [nextFollowUpMethod, setNextFollowUpMethod] = useState<SalesLogMethod | "">("");
  const [nextFollowUpContent, setNextFollowUpContent] = useState("");

  const hasPendingPlans = pendingPlans.length > 0;

  useEffect(() => {
    setOpportunityIds(defaultOpportunitySelection(opportunityOptions));
  }, [customerId, opportunityOptions]);

  function buildFormData(form: HTMLFormElement) {
    const formData = new FormData(form);
    formData.set("customerId", customerId);
    formData.delete("contactIds");
    for (const id of contactIds) {
      formData.append("contactIds", id);
    }
    formData.set("method", method);
    formData.set("suggestedGrade", customerGradeSubmitValue(suggestedGrade, currentCustomerGrade) ?? "");
    formData.set("opportunityId", opportunityIds[0] ?? "");
    formData.set("opportunityIdsJson", JSON.stringify(opportunityIds));
    formData.set("nextFollowUpAt", nextFollowUpAt);
    formData.set("nextFollowUpMethod", nextFollowUpMethod);
    formData.set("nextFollowUpContent", nextFollowUpContent);
    return formData;
  }

  function applyPendingSelection(formData: FormData, keys: string[]) {
    formData.delete("completedPendingKeys");
    for (const key of keys) {
      formData.append("completedPendingKeys", key);
    }
  }

  function resetFormState(form: HTMLFormElement) {
    form.reset();
    setContactIds([]);
    setMethod("PHONE");
    setSuggestedGrade(customerGradeFormValue(currentCustomerGrade));
    setNextFollowUpAt("");
    setNextFollowUpMethod("");
    setNextFollowUpContent("");
    setOpportunityIds([]);
    setSelectedPendingKeys([]);
  }

  function submitFollowUp(form: HTMLFormElement, completedKeys?: string[]) {
    const formData = buildFormData(form);
    if (completedKeys && completedKeys.length > 0) {
      applyPendingSelection(formData, completedKeys);
    }

    startTransition(async () => {
      const result = await createFollowUp(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCompleteDialogOpen(false);
      if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
        return;
      }
      resetFormState(form);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;

    if (opportunityIds.length > 0 && !nextFollowUpAt.trim()) {
      setError("已关联商机时须填写下次拜访时间");
      return;
    }

    const planError = validateNextFollowUpPlan(
      suggestedGrade,
      nextFollowUpAt,
      nextFollowUpMethod,
      currentCustomerGrade,
      nextFollowUpContent
    );
    if (planError) {
      setError(planError);
      return;
    }

    if (hasPendingPlans) {
      setPendingForm(form);
      setCompleteDialogOpen(true);
      return;
    }

    submitFollowUp(form);
  }

  function handleConfirmComplete() {
    if (!pendingForm || selectedPendingKeys.length === 0) return;
    submitFollowUp(pendingForm, selectedPendingKeys);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <CustomerPendingFollowPlansPanel items={pendingPlans} />

          <ContactSelectField
            customerId={customerId}
            multiple
            value={contactIds}
            onChange={setContactIds}
            required
            className="md:col-span-2"
          />

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>关联商机</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpportunityDialogOpen(true)}
              >
                新建商机
              </Button>
            </div>
            <OpportunityLinkPicker
              options={opportunityOptions}
              value={opportunityIds}
              onChange={setOpportunityIds}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="method">跟进方式 *</Label>
            <select
              id="method"
              name="method"
              required
              value={method}
              onChange={(e) => setMethod(e.target.value as SalesLogMethod)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SALES_LOG_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="followUpAt">跟进时间 *</Label>
            <Input
              id="followUpAt"
              name="followUpAt"
              type="datetime-local"
              defaultValue={todayLocalDatetime()}
              required
            />
          </div>

          <CustomerGradeSelect
            id="suggestedGradeDisplay"
            label="客户等级（可选，选择后将更新客户等级）"
            value={suggestedGrade}
            onValueChange={setSuggestedGrade}
            options={gradeOptions}
            className="md:col-span-2"
          />
          <p className="text-xs text-muted-foreground md:col-span-2">
            选择后会同步更新客户档案中的等级；不选择则只记录跟进。
          </p>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="content">跟进内容 *</Label>
            <Textarea id="content" name="content" required rows={3} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="result">跟进结果</Label>
            <Textarea id="result" name="result" rows={2} />
          </div>

          <div className="space-y-3 rounded-md border bg-muted/20 p-4 md:col-span-2">
            <p className="text-sm font-medium">下次往来计划</p>
            <NextFollowUpPlanFields
              methodId="nextMethod"
              methodValue={nextFollowUpMethod}
              onMethodChange={setNextFollowUpMethod}
              dateId="nextFollowUpAt"
              dateValue={nextFollowUpAt}
              onDateChange={setNextFollowUpAt}
              contentId="nextFollowUpContent"
              contentValue={nextFollowUpContent}
              onContentChange={setNextFollowUpContent}
              suggestedGrade={suggestedGrade}
              currentCustomerGrade={currentCustomerGrade}
              gradeOptions={gradeOptions}
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending || contactIds.length === 0}>
          {pending ? "保存中…" : "保存跟进"}
        </Button>
      </form>

      <CompletePendingFollowUpDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        items={pendingPlans}
        selectedKeys={selectedPendingKeys}
        onSelectedKeysChange={setSelectedPendingKeys}
        onConfirm={handleConfirmComplete}
        pending={pending}
      />

      <QuickOpportunityDialog
        open={opportunityDialogOpen}
        onOpenChange={setOpportunityDialogOpen}
        customerId={customerId}
        customerName={customerName}
        stageOptions={stageOptions}
        onCreated={(opp) => {
          setOpportunityIds((prev) => [...new Set([...prev, opp.id])]);
        }}
      />
    </>
  );
}
