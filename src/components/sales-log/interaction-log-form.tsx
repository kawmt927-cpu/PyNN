"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import { OpportunitySearchSelect } from "@/components/opportunities/opportunity-search-select";
import { ContactSelectField } from "@/components/sales-log/contact-select-field";
import { QuickOpportunityDialog } from "@/components/sales-log/quick-opportunity-dialog";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import { createManualLogAction } from "@/app/(dashboard)/sales-log/actions";
import type { ConfigOptionItem } from "@/lib/config-options";

function toLocalDatetimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type InteractionFormOptions = {
  stageOptions: ConfigOptionItem[];
};

export function InteractionLogForm({ formOptions }: { formOptions: InteractionFormOptions }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [contactId, setContactId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [opportunityLabel, setOpportunityLabel] = useState("");
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [method, setMethod] = useState<SalesLogMethod>("PHONE");
  const [followUpAt, setFollowUpAt] = useState(toLocalDatetimeValue());
  const [suggestedGrade, setSuggestedGrade] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [nextFollowUpMethod, setNextFollowUpMethod] = useState<SalesLogMethod | "">("");

  function resetForm() {
    setCustomerId("");
    setCustomerLabel("");
    setContactId("");
    setOpportunityId("");
    setOpportunityLabel("");
    setMethod("PHONE");
    setFollowUpAt(toLocalDatetimeValue());
    setSuggestedGrade("");
    setNextFollowUpAt("");
    setNextFollowUpMethod("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("customerId", customerId);
    formData.set("contactId", contactId);
    formData.set("method", method);
    formData.set("followUpAt", followUpAt);
    formData.set("suggestedGrade", suggestedGrade);
    formData.set("opportunityId", opportunityId);
    formData.set("nextFollowUpAt", nextFollowUpAt);
    formData.set("nextFollowUpMethod", nextFollowUpMethod);

    startTransition(async () => {
      const result = await createManualLogAction(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <CustomerSearchSelect
            id="interactionCustomer"
            name="customerId"
            label="客户 *"
            required
            value={customerId}
            selectedLabel={customerLabel}
            onValueChange={(id, option) => {
              setCustomerId(id);
              setCustomerLabel(option?.label ?? "");
              setContactId("");
              setOpportunityId("");
              setOpportunityLabel("");
            }}
          />
        </div>

        <ContactSelectField
          customerId={customerId}
          value={contactId}
          onChange={setContactId}
          required
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>关联商机</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!customerId}
              onClick={() => setOpportunityDialogOpen(true)}
            >
              新建商机
            </Button>
          </div>
          {customerId ? (
            <OpportunitySearchSelect
              id="interactionOpportunity"
              name="opportunityId"
              label=""
              customerId={customerId}
              value={opportunityId}
              selectedLabel={opportunityLabel}
              onValueChange={(id, option) => {
                setOpportunityId(id);
                setOpportunityLabel(option?.label ?? "");
              }}
              placeholder="无关联商机"
            />
          ) : (
            <select disabled className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
              <option>请先选择客户</option>
            </select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="interactionMethod">往来方式 *</Label>
          <select
            id="interactionMethod"
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
          <Label htmlFor="interactionAt">开始时间 *</Label>
          <Input
            id="interactionAt"
            type="datetime-local"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            required
          />
        </div>

        <CustomerGradeSelect
          id="interactionGrade"
          label="客户等级（可选，选择后将更新客户等级）"
          value={suggestedGrade}
          onValueChange={setSuggestedGrade}
        />

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="interactionContent">往来内容 *</Label>
          <Textarea id="interactionContent" name="content" rows={3} required placeholder="沟通要点、客户反馈…" />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="interactionResult">结果/意向（可选）</Label>
          <Input id="interactionResult" name="result" placeholder="如意向等级、下一步计划" />
        </div>

        <div className="space-y-4 rounded-md border bg-muted/20 p-4 md:col-span-2">
          <p className="text-sm font-medium">下次往来计划</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nextMethod">计划方式</Label>
              <select
                id="nextMethod"
                value={nextFollowUpMethod}
                onChange={(e) => setNextFollowUpMethod(e.target.value as SalesLogMethod | "")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">请选择</option>
                {SALES_LOG_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextAt">计划时间</Label>
              <Input
                id="nextAt"
                type="datetime-local"
                value={nextFollowUpAt}
                onChange={(e) => setNextFollowUpAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        {method === "FACE_VISIT" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="interactionLocation">面访地点</Label>
              <Input id="interactionLocation" name="location" placeholder="医院/公司地址" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interactionDetail">面访纪要</Label>
              <Textarea id="interactionDetail" name="detailedNotes" rows={2} />
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}
        <div className="md:col-span-2">
          <Button type="submit" disabled={pending || !customerId || !contactId}>
            {pending ? "保存中…" : "保存往来记录"}
          </Button>
        </div>
      </form>

      <QuickOpportunityDialog
        open={opportunityDialogOpen}
        onOpenChange={setOpportunityDialogOpen}
        customerId={customerId}
        customerName={customerLabel}
        stageOptions={formOptions.stageOptions}
        onCreated={(opp) => {
          setOpportunityId(opp.id);
          setOpportunityLabel(opp.title);
        }}
      />
    </>
  );
}
