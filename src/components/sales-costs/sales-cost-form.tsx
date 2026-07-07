"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SalesCostType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import { SALES_COST_TYPE_OPTIONS } from "@/lib/sales-costs/labels";
import { TRAVEL_ITEM_FIELDS, type TravelAmountKey, type TravelNoteKey } from "@/lib/sales-costs/travel-items";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

type SubmitAction = (formData: FormData) => Promise<ActionResult>;

type UserOption = { id: string; name: string };
type PresalesOption = {
  id: string;
  name: string;
  personnelProfile: { dailyRate: number } | null;
};

type Props = {
  salesUsers: UserOption[];
  presalesUsers: PresalesOption[];
  submitAction: SubmitAction;
  defaultCostType?: SalesCostType;
  costId?: string;
  defaultValues?: {
    costType: SalesCostType;
    salesUserId: string;
    costDate: string;
    description?: string;
    customerId?: string;
    customerName?: string;
    totalAmount?: number;
    presalesUserId?: string;
    presalesDays?: number;
    accommodation?: number;
    transportation?: number;
    meals?: number;
    otherTravel?: number;
    accommodationNote?: string;
    transportationNote?: string;
    mealsNote?: string;
    otherTravelNote?: string;
  };
};

type TravelDefaultValues = Partial<Record<TravelAmountKey | TravelNoteKey, string | number>>;

function FormField({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id} className="block min-h-5 leading-5">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="col-span-full border-t pt-4 text-sm font-medium text-foreground">{children}</p>
  );
}

function toDateInput(value?: Date | string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function SalesCostForm({
  salesUsers,
  presalesUsers,
  submitAction,
  defaultCostType = SalesCostType.PERSONAL_TRAVEL,
  costId,
  defaultValues,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [costType, setCostType] = useState<SalesCostType>(
    defaultValues?.costType ?? defaultCostType
  );
  const [customerId, setCustomerId] = useState(defaultValues?.customerId ?? "");
  const [customerLabel, setCustomerLabel] = useState(defaultValues?.customerName ?? "");

  const presalesOptions = useMemo(
    () =>
      presalesUsers.map((u) => ({
        value: u.id,
        label: `${u.name}（¥${u.personnelProfile?.dailyRate ?? 0}/天）`,
      })),
    [presalesUsers]
  );

  const salesOptions = salesUsers.map((u) => ({ value: u.id, label: u.name }));

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("costType", costType);
    if (costType === SalesCostType.BUSINESS) {
      formData.set("customerId", customerId);
    }

    setError(null);
    startTransition(async () => {
      try {
        if (costId) formData.set("id", costId);
        const result = await submitAction(formData);
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("was not found on the server")) {
          setError("提交失败，请刷新页面后重试");
          return;
        }
        setError(message || "提交失败，请重试");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <SelectField
        id="costType"
        name="costType"
        label="费用类型"
        className="col-span-full"
        value={costType}
        onValueChange={(v) => setCostType(v as SalesCostType)}
        options={SALES_COST_TYPE_OPTIONS}
        required
      />

      <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          id="salesUserId"
          name="salesUserId"
          label="归属销售"
          defaultValue={defaultValues?.salesUserId}
          options={salesOptions}
          required
        />

        <FormField id="costDate" label="费用日期">
          <Input
            id="costDate"
            name="costDate"
            type="date"
            required
            defaultValue={defaultValues?.costDate ?? toDateInput(new Date())}
          />
        </FormField>
      </div>

      {costType === SalesCostType.BUSINESS ? (
        <>
          <div className="col-span-full">
            <CustomerSearchSelect
              id="customerId"
              name="customerId"
              label="关联客户"
              value={customerId}
              selectedLabel={customerLabel}
              onValueChange={(id, option) => {
                setCustomerId(id);
                setCustomerLabel(option?.label ?? "");
              }}
              required
            />
          </div>
          <FormField id="totalAmount" label="商务费用金额（元）" className="col-span-full sm:col-span-1">
            <Input
              id="totalAmount"
              name="totalAmount"
              type="number"
              min="0"
              step="0.01"
              required
              defaultValue={defaultValues?.totalAmount ?? ""}
            />
          </FormField>
        </>
      ) : null}

      {costType === SalesCostType.PRESALES ? (
        <div className="col-span-full grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="presalesUserId"
            name="presalesUserId"
            label="售前人员"
            defaultValue={defaultValues?.presalesUserId}
            options={presalesOptions}
            required
          />
          <FormField id="presalesDays" label="支持天数">
            <Input
              id="presalesDays"
              name="presalesDays"
              type="number"
              min="1"
              step="1"
              required
              defaultValue={defaultValues?.presalesDays ?? ""}
            />
          </FormField>
        </div>
      ) : null}

      {costType !== SalesCostType.BUSINESS ? (
        <>
          <SectionTitle>
            {costType === SalesCostType.PERSONAL_TRAVEL ? "差旅分项（元）" : "售前差旅分项（元）"}
          </SectionTitle>
          {TRAVEL_ITEM_FIELDS.map(({ amountKey, noteKey, label }) => (
            <div
              key={amountKey}
              className="col-span-full grid grid-cols-1 gap-3 border-b border-border/60 pb-4 last:border-b-0 sm:grid-cols-2"
            >
              <FormField id={amountKey} label={`${label}（元）`}>
                <Input
                  id={amountKey}
                  name={amountKey}
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={
                    (defaultValues as TravelDefaultValues | undefined)?.[amountKey] ?? ""
                  }
                  placeholder="0"
                />
              </FormField>
              <FormField id={noteKey} label={`${label}备注`}>
                <Input
                  id={noteKey}
                  name={noteKey}
                  defaultValue={
                    (defaultValues as TravelDefaultValues | undefined)?.[noteKey] ?? ""
                  }
                  placeholder={`${label}说明（选填）`}
                />
              </FormField>
            </div>
          ))}
        </>
      ) : null}

      {costType === SalesCostType.BUSINESS ? (
        <FormField id="description" label="备注" className="col-span-full">
          <Textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={defaultValues?.description ?? ""}
            placeholder="商务费用说明"
          />
        </FormField>
      ) : null}

      {error ? <p className="col-span-full text-sm text-destructive">{error}</p> : null}

      <div className="col-span-full flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : costId ? "保存修改" : "创建记录"}
        </Button>
      </div>
    </form>
  );
}
