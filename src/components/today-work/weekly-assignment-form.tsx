"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import { OpportunitySearchSelect } from "@/components/opportunities/opportunity-search-select";
import { ContactSelect } from "@/components/sales-log/contact-select";
import { DatetimeLocalField } from "@/components/ui/datetime-local-field";
import { createWeeklyAssignment } from "@/app/(dashboard)/plans-tasks/actions";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";

type EligibleAssignee = { id: string; name: string };

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const methodOptions = Object.entries(FOLLOW_UP_METHOD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function WeeklyAssignmentForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [opportunityLabel, setOpportunityLabel] = useState("");
  const [contactId, setContactId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [eligibleAssignees, setEligibleAssignees] = useState<EligibleAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [canAssign, setCanAssign] = useState(true);
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 7);
  defaultDue.setHours(18, 0, 0, 0);
  const [dueAt, setDueAt] = useState(() => toLocalDatetimeValue(defaultDue));

  useEffect(() => {
    if (!customerId) {
      setEligibleAssignees([]);
      setAssigneeId("");
      setCanAssign(true);
      setOpportunityId("");
      setOpportunityLabel("");
      setContactId("");
      return;
    }

    setAssigneesLoading(true);
    fetch(`/api/customers/${customerId}/assignment-context`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("加载客户信息失败"))))
      .then(
        (data: {
          eligibleAssignees: EligibleAssignee[];
          canAssign: boolean;
        }) => {
          setEligibleAssignees(data.eligibleAssignees);
          setCanAssign(data.canAssign);
          setAssigneeId(data.eligibleAssignees[0]?.id ?? "");
        }
      )
      .catch(() => {
        setEligibleAssignees([]);
        setAssigneeId("");
        setCanAssign(false);
      })
      .finally(() => setAssigneesLoading(false));
  }, [customerId]);

  function resetForm() {
    setCustomerId("");
    setCustomerLabel("");
    setOpportunityId("");
    setOpportunityLabel("");
    setContactId("");
    setAssigneeId("");
    setEligibleAssignees([]);
    setCanAssign(true);
    setDueAt(toLocalDatetimeValue(defaultDue));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!customerId) {
      setError("请选择客户");
      return;
    }
    if (!canAssign || !assigneeId) {
      setError("该客户暂无负责人或协助负责人，无法指派");
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("customerId", customerId);
    formData.set("assigneeId", assigneeId);
    if (opportunityId) formData.set("opportunityId", opportunityId);
    else formData.delete("opportunityId");
    if (contactId) formData.set("contactId", contactId);
    else formData.delete("contactId");

    startTransition(async () => {
      try {
        await createWeeklyAssignment(formData);
        resetForm();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建失败");
      }
    });
  }

  const submitDisabled = pending || !customerId || !canAssign || !assigneeId;

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-title">任务标题 *</Label>
        <Input id="wa-title" name="title" placeholder="如：本周内拜访并确认方案" required />
      </div>

      <div className="space-y-2 md:col-span-2">
        <CustomerSearchSelect
          id="wa-customer"
          name="customerId"
          label="客户 *"
          value={customerId}
          selectedLabel={customerLabel}
          onValueChange={(id, option) => {
            setCustomerId(id);
            setCustomerLabel(option?.label ?? "");
            setOpportunityId("");
            setOpportunityLabel("");
            setContactId("");
          }}
          placeholder="搜索客户…"
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <OpportunitySearchSelect
          id="wa-opportunity"
          name="opportunityId"
          label="商机（可选）"
          value={opportunityId}
          selectedLabel={opportunityLabel}
          onValueChange={(id, option) => {
            setOpportunityId(id);
            setOpportunityLabel(option?.label ?? "");
          }}
          customerId={customerId || undefined}
          disabled={!customerId}
          placeholder={customerId ? "搜索该客户下的商机…" : "请先选择客户"}
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-contact">联系人（可选）</Label>
        <ContactSelect customerId={customerId} value={contactId} onChange={setContactId} />
      </div>

      <DatetimeLocalField
        id="wa-dueAt"
        name="dueAt"
        label="截止时间 *"
        value={dueAt}
        onValueChange={setDueAt}
        required
        className="md:col-span-2"
      />

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-plannedMethod">计划往来方式（可选）</Label>
        <select
          id="wa-plannedMethod"
          name="plannedMethod"
          defaultValue=""
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">不指定</option>
          {methodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-description">说明（可选）</Label>
        <Textarea
          id="wa-description"
          name="description"
          rows={2}
          placeholder="跟进目标或注意事项，将写入计划跟进内容"
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-assignee">指派给 *</Label>
        {!customerId ? (
          <select
            id="wa-assignee"
            disabled
            className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            <option>请先选择客户</option>
          </select>
        ) : assigneesLoading ? (
          <select
            id="wa-assignee"
            disabled
            className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            <option>加载可指派销售…</option>
          </select>
        ) : !canAssign || eligibleAssignees.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            该客户在公海池，需先指定负责人后再指派任务。
          </p>
        ) : (
          <select
            id="wa-assignee"
            name="assigneeId"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {eligibleAssignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
      <div className="md:col-span-2">
        <Button type="submit" disabled={submitDisabled}>
          {pending ? "创建中…" : "创建指派任务"}
        </Button>
      </div>
    </form>
  );
}
