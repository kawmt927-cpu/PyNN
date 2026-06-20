"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import { createManualLogAction } from "@/app/(dashboard)/sales-log/actions";
import { ContactSelect } from "@/components/sales-log/contact-select";

export { CheckInForm } from "@/components/sales-log/check-in-form";

function toLocalDatetimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ManualLogForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [contactId, setContactId] = useState("");
  const [method, setMethod] = useState<SalesLogMethod>("PHONE");
  const [followUpAt, setFollowUpAt] = useState(toLocalDatetimeValue());

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("customerId", customerId);
    formData.set("contactId", contactId);
    formData.set("method", method);
    formData.set("followUpAt", followUpAt);

    startTransition(async () => {
      const result = await createManualLogAction(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <CustomerSearchSelect
          id="manualLogCustomer"
          name="customerId"
          label="客户"
          required
          value={customerId}
          selectedLabel={customerLabel}
          onValueChange={(id, option) => {
            setCustomerId(id);
            setCustomerLabel(option?.label ?? "");
            setContactId("");
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="manualLogContact">联系人</Label>
        <ContactSelect customerId={customerId} value={contactId} onChange={setContactId} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="manualLogMethod">往来方式</Label>
        <select
          id="manualLogMethod"
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
        <Label htmlFor="manualLogAt">往来时间</Label>
        <Input
          id="manualLogAt"
          type="datetime-local"
          value={followUpAt}
          onChange={(e) => setFollowUpAt(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="manualLogNext">下次跟进（可选）</Label>
        <Input id="manualLogNext" name="nextFollowUpAt" type="datetime-local" />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="manualLogContent">往来内容</Label>
        <Textarea id="manualLogContent" name="content" rows={3} required placeholder="沟通要点、客户反馈…" />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="manualLogResult">结果/意向（可选）</Label>
        <Input id="manualLogResult" name="result" placeholder="如意向等级、下一步计划" />
      </div>
      {method === "FACE_VISIT" && (
        <>
          <div className="space-y-2">
            <Label htmlFor="manualLogLocation">面访地点</Label>
            <Input id="manualLogLocation" name="location" placeholder="医院/公司地址" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manualLogDetail">面访纪要</Label>
            <Textarea id="manualLogDetail" name="detailedNotes" rows={2} />
          </div>
        </>
      )}
      {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}
      <div className="md:col-span-2">
        <Button type="submit" disabled={pending || !customerId}>
          {pending ? "保存中…" : "保存往来记录"}
        </Button>
      </div>
    </form>
  );
}

export function AiLogLink() {
  return (
    <Button asChild>
      <Link href="/mobile/log">结束一天 · AI 完善日志</Link>
    </Button>
  );
}
