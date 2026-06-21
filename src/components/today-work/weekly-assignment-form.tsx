"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import { createWeeklyAssignment } from "@/app/(dashboard)/plans-tasks/actions";

type SalesUser = { id: string; name: string };

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function WeeklyAssignmentForm({ salesUsers }: { salesUsers: SalesUser[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const defaultDue = new Date();
  defaultDue.setDate(defaultDue.getDate() + 7);
  defaultDue.setHours(18, 0, 0, 0);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("customerId", customerId);

    startTransition(async () => {
      try {
        await createWeeklyAssignment(formData);
        setCustomerId("");
        setCustomerLabel("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "创建失败");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-title">任务标题 *</Label>
        <Input id="wa-title" name="title" placeholder="如：本周内拜访并确认方案" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="wa-assignee">指派给 *</Label>
        <select
          id="wa-assignee"
          name="assigneeId"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">请选择销售</option>
          {salesUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="wa-dueAt">截止时间 *</Label>
        <Input
          id="wa-dueAt"
          name="dueAt"
          type="datetime-local"
          defaultValue={toLocalDatetimeValue(defaultDue)}
          required
        />
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
          }}
          placeholder="搜索客户…"
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="wa-description">说明（可选）</Label>
        <Textarea id="wa-description" name="description" rows={2} placeholder="跟进目标或注意事项" />
      </div>
      {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending || !customerId}>
          {pending ? "创建中…" : "创建指派任务"}
        </Button>
      </div>
    </form>
  );
}
