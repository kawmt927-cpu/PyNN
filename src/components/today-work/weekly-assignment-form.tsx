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
import { cn } from "@/lib/utils";

type EligibleAssignee = { id: string; name: string };
type AssignmentKind = "CUSTOMER_FOLLOW_UP" | "GENERAL";

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const methodOptions = Object.entries(FOLLOW_UP_METHOD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function WeeklyAssignmentForm({
  onSuccess,
  formClassName,
  salesUsers = [],
  initialCustomerId,
  initialCustomerLabel,
  initialOpportunityId,
  initialOpportunityLabel,
  initialAssigneeId,
  initialTitle,
  initialDescription,
}: {
  onSuccess?: () => void;
  formClassName?: string;
  /** 普通任务可选销售列表 */
  salesUsers?: EligibleAssignee[];
  initialCustomerId?: string;
  initialCustomerLabel?: string;
  initialOpportunityId?: string;
  initialOpportunityLabel?: string;
  initialAssigneeId?: string;
  initialTitle?: string;
  initialDescription?: string;
} = {}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<AssignmentKind>("CUSTOMER_FOLLOW_UP");
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [customerLabel, setCustomerLabel] = useState(initialCustomerLabel ?? "");
  const [opportunityId, setOpportunityId] = useState(initialOpportunityId ?? "");
  const [opportunityLabel, setOpportunityLabel] = useState(initialOpportunityLabel ?? "");
  const [contactId, setContactId] = useState("");
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId ?? "");
  const [title, setTitle] = useState(initialTitle ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [eligibleAssignees, setEligibleAssignees] = useState<EligibleAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [canAssign, setCanAssign] = useState(true);
  const [claimOwnerOnAssign, setClaimOwnerOnAssign] = useState(false);
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 7);
  defaultDue.setHours(18, 0, 0, 0);
  const [dueAt, setDueAt] = useState(() => toLocalDatetimeValue(defaultDue));

  useEffect(() => {
    if (kind === "GENERAL") {
      setEligibleAssignees(salesUsers);
      setCanAssign(salesUsers.length > 0);
      setClaimOwnerOnAssign(false);
      setAssigneeId((prev) =>
        salesUsers.some((u) => u.id === prev) ? prev : (salesUsers[0]?.id ?? "")
      );
      setCustomerId("");
      setCustomerLabel("");
      setOpportunityId("");
      setOpportunityLabel("");
      setContactId("");
      return;
    }

    if (!customerId) {
      setEligibleAssignees([]);
      setAssigneeId("");
      setCanAssign(true);
      setClaimOwnerOnAssign(false);
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
          claimOwnerOnAssign?: boolean;
        }) => {
          setEligibleAssignees(data.eligibleAssignees);
          setCanAssign(data.canAssign);
          setClaimOwnerOnAssign(Boolean(data.claimOwnerOnAssign));
          setAssigneeId((prev) => {
            const preferred = initialAssigneeId && data.eligibleAssignees.some((u) => u.id === initialAssigneeId)
              ? initialAssigneeId
              : null;
            if (preferred) return preferred;
            if (prev && data.eligibleAssignees.some((u) => u.id === prev)) return prev;
            return data.eligibleAssignees[0]?.id ?? "";
          });
        }
      )
      .catch(() => {
        setEligibleAssignees([]);
        setAssigneeId("");
        setCanAssign(false);
        setClaimOwnerOnAssign(false);
        setError("加载可指派销售失败，请刷新重试");
      })
      .finally(() => setAssigneesLoading(false));
  }, [customerId, kind, salesUsers, initialAssigneeId]);

  function resetForm() {
    setKind("CUSTOMER_FOLLOW_UP");
    setCustomerId("");
    setCustomerLabel("");
    setOpportunityId("");
    setOpportunityLabel("");
    setContactId("");
    setAssigneeId(initialAssigneeId ?? "");
    setTitle(initialTitle ?? "");
    setDescription(initialDescription ?? "");
    setEligibleAssignees([]);
    setCanAssign(true);
    setClaimOwnerOnAssign(false);
    setDueAt(toLocalDatetimeValue(defaultDue));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (kind === "CUSTOMER_FOLLOW_UP" && !customerId) {
      setError("请选择客户");
      return;
    }
    if (!canAssign || !assigneeId) {
      setError(
        kind === "GENERAL"
          ? "请选择被指派人"
          : claimOwnerOnAssign
            ? "请选择指派销售"
            : "该客户暂无负责人或协助负责人，无法指派"
      );
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("kind", kind);
    formData.set("assigneeId", assigneeId);
    if (kind === "CUSTOMER_FOLLOW_UP") {
      formData.set("customerId", customerId);
      if (opportunityId) formData.set("opportunityId", opportunityId);
      else formData.delete("opportunityId");
      if (contactId) formData.set("contactId", contactId);
      else formData.delete("contactId");
    } else {
      formData.delete("customerId");
      formData.delete("opportunityId");
      formData.delete("contactId");
      formData.delete("plannedMethod");
    }

    startTransition(async () => {
      try {
        const result = await createWeeklyAssignment(formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        resetForm();
        router.refresh();
        onSuccess?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "创建失败");
      }
    });
  }

  const submitDisabled =
    pending ||
    !assigneeId ||
    !canAssign ||
    (kind === "CUSTOMER_FOLLOW_UP" && !customerId);

  return (
    <form onSubmit={handleSubmit} className={formClassName ?? "grid gap-4 md:grid-cols-2"}>
      <div className="space-y-2 md:col-span-2">
        <Label>任务类型 *</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              {
                value: "CUSTOMER_FOLLOW_UP" as const,
                title: "客户跟进",
                desc: "需选客户，完成后同步往来计划",
              },
              {
                value: "GENERAL" as const,
                title: "普通任务",
                desc: "无需客户；完成后需指派人确认",
              },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors",
                kind === option.value
                  ? "border-primary bg-primary/5"
                  : "border-input hover:bg-muted/50"
              )}
            >
              <p className="text-sm font-medium">{option.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{option.desc}</p>
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={kind} />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-title">任务标题 *</Label>
        <Input
          id="wa-title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === "GENERAL" ? "如：整理本周渠道资料并提交" : "如：本周内拜访并确认方案"
          }
          required
        />
      </div>

      {kind === "CUSTOMER_FOLLOW_UP" ? (
        <>
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
        </>
      ) : null}

      <DatetimeLocalField
        id="wa-dueAt"
        name="dueAt"
        label="截止时间 *"
        value={dueAt}
        onValueChange={setDueAt}
        required
        className="md:col-span-2"
      />

      {kind === "CUSTOMER_FOLLOW_UP" ? (
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
      ) : null}

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-description">说明（可选）</Label>
        <Textarea
          id="wa-description"
          name="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            kind === "GENERAL"
              ? "任务目标或注意事项"
              : "跟进目标或注意事项，将写入计划跟进内容"
          }
        />
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-assignee">指派给 *</Label>
        {kind === "CUSTOMER_FOLLOW_UP" && !customerId ? (
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
            暂无可指派的销售人员。
          </p>
        ) : (
          <>
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
            {claimOwnerOnAssign ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                该客户在公海池。创建任务后，所选销售将自动成为客户负责人。
              </p>
            ) : null}
            {kind === "GENERAL" ? (
              <p className="text-xs text-muted-foreground">
                被指派人完成后需你确认；若指派给自己，完成即结束，无需再确认。
              </p>
            ) : null}
          </>
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
