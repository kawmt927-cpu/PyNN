"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import { OpportunitySearchSelect } from "@/components/opportunities/opportunity-search-select";
import { ContactSelect } from "@/components/sales-log/contact-select";
import {
  createContract,
  createContractFromOpportunity,
  resubmitContract,
} from "@/app/(dashboard)/contracts/actions";
import { SIGNING_TYPE_LABELS } from "@/lib/permissions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import type { ActionResult } from "@/lib/action-result";

type SalesOption = { id: string; name: string };
type ProductTemplate = { id: string; name: string; defaultCost: number };
type ProductLine = { key: string; productServiceId: string; productName: string; costAmount: string };
type InstallmentLine = {
  key: string;
  periodNumber: number;
  amount: string;
  condition: string;
  dueAt: string;
};

type Props = {
  showOwnerSelect?: boolean;
  salesUsers?: SalesOption[];
  paymentMethodOptions?: Array<{ value: string; label: string }>;
  opportunityId?: string;
  opportunityTitle?: string;
  contractId?: string;
  isResubmit?: boolean;
  currentUserId?: string;
  defaultValues?: {
    title?: string;
    totalAmount?: number;
    signingType?: string;
    signCustomerId?: string;
    signCustomerName?: string;
    endUserCustomerId?: string;
    endUserCustomerName?: string;
    signContactId?: string;
    ourRepresentativeId?: string;
    paymentMethod?: string;
    ownerId?: string;
    signedAt?: string;
    effectiveAt?: string;
    expiresAt?: string;
    notes?: string;
    products?: Array<{ productServiceId?: string | null; productName: string; costAmount: number }>;
    installments?: Array<{
      periodNumber: number;
      amount: number;
      condition?: string | null;
      dueAt?: string | null;
    }>;
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

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

/** 两列网格内统一标签行高，使左右输入框对齐 */
const FORM_GRID_CELL = "grid min-w-0 grid-rows-[2.75rem_auto] gap-2 space-y-0";
const FORM_GRID_LABEL = "self-end leading-snug";
const FORM_FULL_WIDTH = "space-y-2 md:col-span-2";

function defaultProductLine(): ProductLine {
  return { key: newKey(), productServiceId: "", productName: "", costAmount: "" };
}

function defaultInstallmentLine(periodNumber: number): InstallmentLine {
  return { key: newKey(), periodNumber, amount: "", condition: "", dueAt: "" };
}

export function ContractForm({
  showOwnerSelect,
  salesUsers = [],
  paymentMethodOptions = [],
  opportunityId,
  opportunityTitle,
  contractId,
  isResubmit,
  currentUserId,
  defaultValues,
  submitLabel = "提交销售合同",
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);

  const [linkedOpportunityId, setLinkedOpportunityId] = useState(opportunityId ?? "");
  const [linkedOpportunityLabel, setLinkedOpportunityLabel] = useState(opportunityTitle ?? "");

  const [signCustomerId, setSignCustomerId] = useState(defaultValues?.signCustomerId ?? "");
  const [signCustomerLabel, setSignCustomerLabel] = useState(defaultValues?.signCustomerName ?? "");
  const [endUserCustomerId, setEndUserCustomerId] = useState(
    defaultValues?.endUserCustomerId ?? defaultValues?.signCustomerId ?? ""
  );
  const [endUserCustomerLabel, setEndUserCustomerLabel] = useState(
    defaultValues?.endUserCustomerName ?? defaultValues?.signCustomerName ?? ""
  );
  const [signContactId, setSignContactId] = useState(defaultValues?.signContactId ?? "");
  const [totalAmount, setTotalAmount] = useState(
    defaultValues?.totalAmount != null ? String(defaultValues.totalAmount) : ""
  );

  const [products, setProducts] = useState<ProductLine[]>(() =>
    defaultValues?.products?.length
      ? defaultValues.products.map((row) => ({
          key: newKey(),
          productServiceId: row.productServiceId ?? "",
          productName: row.productName,
          costAmount: String(row.costAmount),
        }))
      : [defaultProductLine()]
  );

  const [installments, setInstallments] = useState<InstallmentLine[]>(() =>
    defaultValues?.installments?.length
      ? defaultValues.installments.map((row) => ({
          key: newKey(),
          periodNumber: row.periodNumber,
          amount: String(row.amount),
          condition: row.condition ?? "",
          dueAt: row.dueAt ? toDateInput(row.dueAt) : "",
        }))
      : [defaultInstallmentLine(1)]
  );

  useEffect(() => {
    fetch("/api/product-templates", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items: ProductTemplate[] }) => setTemplates(data.items ?? []))
      .catch(() => setTemplates([]));
  }, []);

  const productCostTotal = useMemo(
    () => products.reduce((sum, row) => sum + (Number(row.costAmount) || 0), 0),
    [products]
  );

  const installmentTotal = useMemo(
    () => installments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    [installments]
  );

  const contractAmountNum = Number(totalAmount) || 0;
  const grossProfit = contractAmountNum - productCostTotal;

  function distributeInstallmentsEvenly() {
    const amount = Number(totalAmount);
    if (!amount || amount <= 0 || installments.length === 0) return;
    const per = amount / installments.length;
    setInstallments((rows) =>
      rows.map((row, index) => ({
        ...row,
        amount:
          index === rows.length - 1
            ? (amount - per * (rows.length - 1)).toFixed(2)
            : per.toFixed(2),
      }))
    );
  }

  function handleSubmit(formData: FormData) {
    formData.set("signCustomerId", signCustomerId);
    formData.set("endUserCustomerId", endUserCustomerId);
    formData.set("signContactId", signContactId);
    formData.set("totalAmount", totalAmount);

    const resolvedOpportunityId = opportunityId ?? linkedOpportunityId;
    if (resolvedOpportunityId) {
      formData.set("opportunityId", resolvedOpportunityId);
    }

    const productsPayload = products.map((row) => ({
      productServiceId: row.productServiceId || null,
      productName: row.productName.trim(),
      costAmount: Number(row.costAmount) || 0,
    }));

    const installmentsPayload = installments.map((row) => ({
      periodNumber: row.periodNumber,
      amount: Number(row.amount) || 0,
      condition: row.condition.trim() || null,
      dueAt: row.dueAt || null,
    }));

    formData.set("productsJson", JSON.stringify(productsPayload));
    formData.set("installmentsJson", JSON.stringify(installmentsPayload));

    startTransition(async () => {
      setError(null);
      try {
        let result: ActionResult;
        if (isResubmit && contractId) {
          result = await resubmitContract(contractId, formData);
        } else if (resolvedOpportunityId) {
          result = await createContractFromOpportunity(resolvedOpportunityId, formData);
        } else {
          result = await createContract(formData);
        }
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
    <form action={handleSubmit} className="max-w-3xl space-y-8">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">基本信息</h2>
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
          {!opportunityId && (
            <OpportunitySearchSelect
              id="opportunityId"
              name="opportunityId"
              label="关联商机（可选）"
              className={FORM_FULL_WIDTH}
              value={linkedOpportunityId}
              selectedLabel={linkedOpportunityLabel}
              onValueChange={(id, option) => {
                setLinkedOpportunityId(id);
                setLinkedOpportunityLabel(option?.label ?? "");
              }}
              status="ALL"
            />
          )}

          <div className={FORM_FULL_WIDTH}>
            <Label htmlFor="title">合同标题 *</Label>
            <Input id="title" name="title" defaultValue={defaultValues?.title ?? ""} required />
          </div>

          <div className={FORM_GRID_CELL}>
            <Label htmlFor="totalAmount" className={FORM_GRID_LABEL}>
              合同金额 *
            </Label>
            <Input
              id="totalAmount"
              name="totalAmount"
              type="number"
              min={0}
              step="0.01"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              required
            />
          </div>

          <SelectField
            id="signingType"
            label="签约类型 *"
            name="signingType"
            options={signingOptions}
            defaultValue={defaultValues?.signingType ?? "DIRECT"}
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
          />

          <CustomerSearchSelect
            id="signCustomerId"
            name="signCustomerId"
            label="签约客户 *"
            required
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
            value={signCustomerId}
            selectedLabel={signCustomerLabel}
            onValueChange={(id, option) => {
              setSignCustomerId(id);
              setSignCustomerLabel(option?.label ?? "");
              setSignContactId("");
            }}
          />

          <CustomerSearchSelect
            id="endUserCustomerId"
            name="endUserCustomerId"
            label="终用户 *"
            required
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
            value={endUserCustomerId}
            selectedLabel={endUserCustomerLabel}
            onValueChange={(id, option) => {
              setEndUserCustomerId(id);
              setEndUserCustomerLabel(option?.label ?? "");
            }}
          />

          <div className={FORM_GRID_CELL}>
            <Label htmlFor="signContactId" className={FORM_GRID_LABEL}>
              甲方代表 *
            </Label>
            <div>
              <ContactSelect
                customerId={signCustomerId}
                value={signContactId}
                onChange={setSignContactId}
                required
              />
              <input type="hidden" name="signContactId" value={signContactId} />
            </div>
          </div>

          <SelectField
            id="ourRepresentativeId"
            label="我方代表 *"
            name="ourRepresentativeId"
            options={salesUsers.map((u) => ({ value: u.id, label: u.name }))}
            defaultValue={
              defaultValues?.ourRepresentativeId ??
              currentUserId ??
              salesUsers[0]?.id ??
              ""
            }
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
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
              className={FORM_GRID_CELL}
              labelClassName={FORM_GRID_LABEL}
            />
          )}

          {paymentMethodOptions.length > 0 && (
            <SelectField
              id="paymentMethod"
              label="支付方式"
              name="paymentMethod"
              options={[{ value: "", label: "未指定" }, ...paymentMethodOptions]}
              defaultValue={defaultValues?.paymentMethod ?? ""}
              className={FORM_GRID_CELL}
              labelClassName={FORM_GRID_LABEL}
            />
          )}

          <div className={FORM_GRID_CELL}>
            <Label htmlFor="signedAt" className={FORM_GRID_LABEL}>
              签约日期 *
            </Label>
            <Input
              id="signedAt"
              name="signedAt"
              type="date"
              defaultValue={toDateInput(defaultValues?.signedAt ?? new Date())}
              required
            />
          </div>

          <div className={FORM_FULL_WIDTH}>
            <Label htmlFor="notes">备注</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">签约产品（成本）</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setProducts((rows) => [...rows, defaultProductLine()])}
          >
            添加产品
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          合同售价为上方合同金额；此处仅录入各产品成本。预估毛利：
          <span className="ml-1 font-medium text-foreground">
            {Number.isFinite(grossProfit) ? grossProfit.toFixed(2) : "—"} 元
          </span>
        </p>
        <div className="space-y-3">
          {products.map((row, index) => (
            <div key={row.key} className="grid gap-3 rounded-lg border p-3 md:grid-cols-12">
              <div className="md:col-span-4 space-y-1">
                <Label>产品模板</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={row.productServiceId}
                  onChange={(e) => {
                    const template = templates.find((t) => t.id === e.target.value);
                    setProducts((rows) =>
                      rows.map((item) =>
                        item.key === row.key
                          ? {
                              ...item,
                              productServiceId: e.target.value,
                              productName: template?.name ?? item.productName,
                              costAmount:
                                template != null
                                  ? String(template.defaultCost)
                                  : item.costAmount,
                            }
                          : item
                      )
                    );
                  }}
                >
                  <option value="">手动填写</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-4 space-y-1">
                <Label>产品名称 *</Label>
                <Input
                  value={row.productName}
                  onChange={(e) =>
                    setProducts((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, productName: e.target.value } : item
                      )
                    )
                  }
                  required
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label>成本 *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.costAmount}
                  onChange={(e) =>
                    setProducts((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, costAmount: e.target.value } : item
                      )
                    )
                  }
                  required
                />
              </div>
              <div className="flex items-end md:col-span-1">
                {products.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setProducts((rows) => rows.filter((item) => item.key !== row.key))}
                  >
                    删
                  </Button>
                )}
              </div>
              {index === products.length - 1 ? null : null}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">回款计划 *</h2>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={distributeInstallmentsEvenly}>
              平均分配金额
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setInstallments((rows) => [
                  ...rows,
                  defaultInstallmentLine(rows.length + 1),
                ])
              }
            >
              添加期次
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          计划合计须等于合同金额。当前合计：
          <span
            className={
              Math.abs(installmentTotal - contractAmountNum) < 0.01
                ? "ml-1 font-medium text-emerald-600"
                : "ml-1 font-medium text-destructive"
            }
          >
            {installmentTotal.toFixed(2)} 元
          </span>
        </p>
        <div className="space-y-3">
          {installments.map((row) => (
            <div key={row.key} className="grid gap-3 rounded-lg border p-3 md:grid-cols-12">
              <div className="md:col-span-1 space-y-1">
                <Label>期次</Label>
                <Input
                  type="number"
                  min={1}
                  value={row.periodNumber}
                  onChange={(e) =>
                    setInstallments((rows) =>
                      rows.map((item) =>
                        item.key === row.key
                          ? { ...item, periodNumber: Number(e.target.value) || 1 }
                          : item
                      )
                    )
                  }
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label>计划金额 *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.amount}
                  onChange={(e) =>
                    setInstallments((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, amount: e.target.value } : item
                      )
                    )
                  }
                  required
                />
              </div>
              <div className="md:col-span-4 space-y-1">
                <Label>回款条件</Label>
                <Input
                  value={row.condition}
                  onChange={(e) =>
                    setInstallments((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, condition: e.target.value } : item
                      )
                    )
                  }
                  placeholder="如：合同签订后 7 日内"
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label>计划到期</Label>
                <Input
                  type="date"
                  value={row.dueAt}
                  onChange={(e) =>
                    setInstallments((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, dueAt: e.target.value } : item
                      )
                    )
                  }
                />
              </div>
              <div className="flex items-end md:col-span-1">
                {installments.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setInstallments((rows) => rows.filter((item) => item.key !== row.key))}
                  >
                    删
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
