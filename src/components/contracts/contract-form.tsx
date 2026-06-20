"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { createContract, createContractFromOpportunity } from "@/app/(dashboard)/contracts/actions";
import { SIGNING_TYPE_LABELS } from "@/lib/permissions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import type { ActionResult } from "@/lib/action-result";

type CustomerOption = { id: string; name: string };
type SalesOption = { id: string; name: string };

type Props = {
  customers: CustomerOption[];
  showOwnerSelect?: boolean;
  salesUsers?: SalesOption[];
  opportunityId?: string;
  defaultValues?: {
    title?: string;
    totalAmount?: number;
    signCustomerId?: string;
    endUserCustomerId?: string;
    ownerId?: string;
  };
  submitLabel?: string;
};

const signingOptions = Object.entries(SIGNING_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function toDateInput(value?: Date | string | null) {
  if (!value) return "";
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function ContractForm({
  customers,
  showOwnerSelect,
  salesUsers = [],
  opportunityId,
  defaultValues,
  submitLabel = "创建合同",
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const customerOptions = [
    { value: "", label: "请选择" },
    ...customers.map((c) => ({ value: c.id, label: c.name })),
  ];

  function handleSubmit(formData: FormData) {
    if (opportunityId) formData.set("opportunityId", opportunityId);
    startTransition(async () => {
      setError(null);
      try {
        const result: ActionResult = opportunityId
          ? await createContractFromOpportunity(opportunityId, formData)
          : await createContract(formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "提交失败");
      }
    });
  }

  return (
    <form action={handleSubmit} className="max-w-2xl space-y-4">
      {opportunityId && (
        <p className="text-sm text-muted-foreground">
          合同金额可与商机预计金额不一致；保存后将标记商机为赢单并自动创建项目。
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="title">合同标题 *</Label>
          <Input id="title" name="title" defaultValue={defaultValues?.title ?? ""} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="totalAmount">合同金额 *</Label>
          <Input
            id="totalAmount"
            name="totalAmount"
            type="number"
            min={0}
            step="0.01"
            defaultValue={defaultValues?.totalAmount ?? ""}
            required
          />
        </div>

        <SelectField
          id="signingType"
          label="签约类型 *"
          name="signingType"
          options={signingOptions}
          defaultValue="DIRECT"
        />

        <SelectField
          id="signCustomerId"
          label="签约客户 *"
          name="signCustomerId"
          options={customerOptions}
          defaultValue={defaultValues?.signCustomerId ?? ""}
        />

        <SelectField
          id="endUserCustomerId"
          label="终用户 *"
          name="endUserCustomerId"
          options={customerOptions}
          defaultValue={defaultValues?.endUserCustomerId ?? defaultValues?.signCustomerId ?? ""}
        />

        {showOwnerSelect && (
          <SelectField
            id="ownerId"
            label="负责销售"
            name="ownerId"
            options={[
              { value: POOL_OWNER_VALUE, label: "未指定" },
              ...salesUsers.map((u) => ({ value: u.id, label: u.name })),
            ]}
            defaultValue={defaultValues?.ownerId ?? POOL_OWNER_VALUE}
          />
        )}

        <div className="space-y-2">
          <Label htmlFor="signedAt">签约日期</Label>
          <Input id="signedAt" name="signedAt" type="date" defaultValue={toDateInput(new Date())} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">备注</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
