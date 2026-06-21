"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import { OpportunitySearchSelect } from "@/components/opportunities/opportunity-search-select";
import { ContactSelectField } from "@/components/sales-log/contact-select-field";
import { QuickOpportunityDialog } from "@/components/sales-log/quick-opportunity-dialog";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import { createFollowUp } from "@/app/(dashboard)/customers/actions";
import type { ConfigOptionItem } from "@/lib/config-options";

type Props = {
  customerId: string;
  customerName: string;
  stageOptions: ConfigOptionItem[];
};

function todayLocalDatetime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function FollowUpForm({ customerId, customerName, stageOptions }: Props) {
  const [method, setMethod] = useState<SalesLogMethod>("PHONE");
  const [contactId, setContactId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [opportunityLabel, setOpportunityLabel] = useState("");
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [suggestedGrade, setSuggestedGrade] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [nextFollowUpMethod, setNextFollowUpMethod] = useState<SalesLogMethod | "">("");

  const isFaceVisit = method === "FACE_VISIT";

  return (
    <>
      <form action={createFollowUp} className="space-y-4">
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="contactId" value={contactId} />
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <input type="hidden" name="suggestedGrade" value={suggestedGrade} />
        <input type="hidden" name="nextFollowUpAt" value={nextFollowUpAt} />
        <input type="hidden" name="nextFollowUpMethod" value={nextFollowUpMethod} />

        <div className="grid gap-4 md:grid-cols-2">
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
                onClick={() => setOpportunityDialogOpen(true)}
              >
                新建商机
              </Button>
            </div>
            <OpportunitySearchSelect
              id="followUpOpportunity"
              name="opportunityIdDisplay"
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
                <Label htmlFor="nextFollowUpAt">计划时间</Label>
                <Input
                  id="nextFollowUpAt"
                  type="datetime-local"
                  value={nextFollowUpAt}
                  onChange={(e) => setNextFollowUpAt(e.target.value)}
                />
              </div>
            </div>
          </div>

          {isFaceVisit && (
            <>
              <div className="space-y-2 md:col-span-2">
                <p className="text-sm font-medium text-muted-foreground">面访详情</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">地点 *</Label>
                <Input id="location" name="location" required={isFaceVisit} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">科室</Label>
                <Input id="department" name="department" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="companions">同行人员</Label>
                <Input id="companions" name="companions" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="detailedNotes">详细纪要 *</Label>
                <Textarea id="detailedNotes" name="detailedNotes" required={isFaceVisit} rows={4} />
              </div>
            </>
          )}
        </div>

        <Button type="submit" disabled={!contactId}>
          保存跟进
        </Button>
      </form>

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
