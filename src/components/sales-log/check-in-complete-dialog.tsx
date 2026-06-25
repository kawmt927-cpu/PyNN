"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import { OpportunitySearchSelect } from "@/components/opportunities/opportunity-search-select";
import { ContactSelectField } from "@/components/sales-log/contact-select-field";
import { QuickOpportunityDialog } from "@/components/sales-log/quick-opportunity-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NextFollowUpPlanFields } from "@/components/sales-log/next-follow-up-plan-fields";
import { validateNextFollowUpPlan } from "@/lib/sales-log/next-follow-up-plan";
import {
  customerGradeFormValue,
  customerGradeSubmitValue,
} from "@/lib/customers/grade";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import type { ConfigOptionItem } from "@/lib/config-options";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkInId: string;
  customerId: string;
  customerName: string;
  currentCustomerGrade?: string | null;
  defaultContactId?: string;
  defaultLocation?: string;
  stageOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
};

export function CheckInCompleteDialog({
  open,
  onOpenChange,
  checkInId,
  customerId,
  customerName,
  currentCustomerGrade,
  defaultContactId = "",
  defaultLocation = "",
  stageOptions,
  gradeOptions,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contactId, setContactId] = useState(defaultContactId);
  const [opportunityId, setOpportunityId] = useState("");
  const [opportunityLabel, setOpportunityLabel] = useState("");
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [method, setMethod] = useState<SalesLogMethod>("FACE_VISIT");
  const [content, setContent] = useState("");
  const [result, setResult] = useState("");
  const [suggestedGrade, setSuggestedGrade] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [nextFollowUpMethod, setNextFollowUpMethod] = useState<SalesLogMethod | "">("");
  const [detailedNotes, setDetailedNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setContactId(defaultContactId);
    setOpportunityId("");
    setOpportunityLabel("");
    setMethod("FACE_VISIT");
    setContent("");
    setResult("");
    setSuggestedGrade(customerGradeFormValue(currentCustomerGrade));
    setNextFollowUpAt("");
    setNextFollowUpMethod("");
    setDetailedNotes("");
    setError(null);
  }, [open, checkInId, defaultContactId, currentCustomerGrade]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const planError = validateNextFollowUpPlan(
      suggestedGrade,
      nextFollowUpAt,
      nextFollowUpMethod,
      currentCustomerGrade
    );
    if (planError) {
      setError(planError);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/sales-log/check-ins/${encodeURIComponent(checkInId)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId,
            method,
            content: content.trim(),
            result: result.trim() || null,
            suggestedGrade: customerGradeSubmitValue(suggestedGrade, currentCustomerGrade),
            opportunityId: opportunityId || null,
            nextFollowUpAt: nextFollowUpAt || null,
            nextFollowUpMethod: nextFollowUpMethod || null,
            location: method === "FACE_VISIT" ? defaultLocation || null : null,
            detailedNotes: method === "FACE_VISIT" ? detailedNotes.trim() || null : null,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          setError(data.error || "完善失败");
          return;
        }
        onOpenChange(false);
        router.refresh();
      } catch {
        setError("完善失败，请稍后重试");
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>完善打卡往来</DialogTitle>
            <DialogDescription>
              客户「{customerName}」· 补录往来内容并可选更新等级、关联商机与下次计划。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <ContactSelectField
                customerId={customerId}
                value={contactId}
                onChange={setContactId}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>关联商机</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setOpportunityDialogOpen(true)}>
                  新建商机
                </Button>
              </div>
              <OpportunitySearchSelect
                id="completeOpportunity"
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="completeMethod">往来方式 *</Label>
              <select
                id="completeMethod"
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

            <CustomerGradeSelect
              id="completeGrade"
              label="客户等级（可选，选择后将更新客户等级）"
              value={suggestedGrade}
              onValueChange={setSuggestedGrade}
              options={gradeOptions}
            />

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="completeContent">往来内容 *</Label>
              <Textarea
                id="completeContent"
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="沟通要点、客户反馈…"
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="completeResult">结果/意向（可选）</Label>
              <Input id="completeResult" value={result} onChange={(e) => setResult(e.target.value)} />
            </div>

            <div className="space-y-3 rounded-md border bg-muted/20 p-4 md:col-span-2">
              <p className="text-sm font-medium">下次往来计划</p>
              <NextFollowUpPlanFields
                methodId="completeNextMethod"
                methodValue={nextFollowUpMethod}
                onMethodChange={setNextFollowUpMethod}
                dateId="completeNextAt"
                dateValue={nextFollowUpAt}
                onDateChange={setNextFollowUpAt}
                suggestedGrade={suggestedGrade}
                currentCustomerGrade={currentCustomerGrade}
              />
            </div>

            {method === "FACE_VISIT" && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="completeDetail">面访纪要（可选）</Label>
                <Textarea
                  id="completeDetail"
                  rows={2}
                  value={detailedNotes}
                  onChange={(e) => setDetailedNotes(e.target.value)}
                />
                {defaultLocation ? (
                  <p className="text-xs text-muted-foreground">面访地点：{defaultLocation}</p>
                ) : null}
              </div>
            )}

            {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
            <div className="flex justify-end gap-2 md:col-span-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={pending || !contactId || !content.trim()}>
                {pending ? "提交中…" : "确认完善"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <QuickOpportunityDialog
        open={opportunityDialogOpen}
        onOpenChange={setOpportunityDialogOpen}
        customerId={customerId}
        customerName={customerName}
        stageOptions={stageOptions}
        onCreated={(opp) => {
          setOpportunityId(opp.id);
          setOpportunityLabel(opp.title);
        }}
      />
    </>
  );
}
