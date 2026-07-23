"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import type { ConfigOptionItem } from "@/lib/config-options";
import {
  buildProportionalExternalPlan,
  sumExternalPlanAmounts,
} from "@/lib/contracts/external-cost-plan";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";
import { nextClientKey } from "@/lib/ui/stable-client-key";

export type ExternalInstallmentLine = {
  key: string;
  periodNumber: number;
  amount: string;
  condition: string;
  dueAt: string;
};

export type CostProductLine = {
  key: string;
  productName: string;
  notes: string;
  costAmount: string;
  costType: "INTERNAL" | "EXTERNAL";
  externalInstallments: ExternalInstallmentLine[];
};

type PaymentPlanRow = {
  periodNumber: number;
  amount: string;
  condition: string;
  dueAt: string;
};

type Props = {
  products: CostProductLine[];
  onChange: (products: CostProductLine[]) => void;
  internalNameOptions: ConfigOptionItem[];
  externalNameOptions: ConfigOptionItem[];
  contractAmount: number;
  grossProfit: number;
  paymentPlan: PaymentPlanRow[];
  onError: (message: string | null) => void;
};

function newKey() {
  return nextClientKey("cost");
}

export function defaultCostProductLine(costType: "INTERNAL" | "EXTERNAL"): CostProductLine {
  return {
    key: newKey(),
    productName: "",
    notes: "",
    costAmount: "",
    costType,
    externalInstallments:
      costType === "EXTERNAL"
        ? [{ key: newKey(), periodNumber: 1, amount: "", condition: "", dueAt: "" }]
        : [],
  };
}

function nameSelectOptions(
  options: ConfigOptionItem[],
  currentName: string
): ConfigOptionItem[] {
  const base = options.map((item) => ({ value: item.label, label: item.label }));
  if (currentName && !base.some((item) => item.value === currentName)) {
    return [{ value: currentName, label: currentName }, ...base];
  }
  return base;
}

function CostRow({
  row,
  nameOptions,
  canDelete,
  paymentPlan,
  contractAmount,
  onPatch,
  onRemove,
  onError,
}: {
  row: CostProductLine;
  nameOptions: ConfigOptionItem[];
  canDelete: boolean;
  paymentPlan: PaymentPlanRow[];
  contractAmount: number;
  onPatch: (patch: Partial<CostProductLine>) => void;
  onRemove: () => void;
  onError: (message: string | null) => void;
}) {
  const isExternal = row.costType === "EXTERNAL";
  const externalPlanSum = sumExternalPlanAmounts(row.externalInstallments);
  const externalGap = isExternal ? (Number(row.costAmount) || 0) - externalPlanSum : 0;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-4 space-y-1">
          <SelectField
            id={`cost-name-${row.key}`}
            label="产品名称 *"
            name=""
            options={[{ value: "", label: "请选择" }, ...nameSelectOptions(nameOptions, row.productName)]}
            value={row.productName}
            onValueChange={(productName) => onPatch({ productName })}
            required
          />
        </div>
        <div className="md:col-span-3 space-y-1">
          <Label>{isExternal ? "应付总额 *" : "成本 *"}</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={row.costAmount}
            onChange={(e) => onPatch({ costAmount: e.target.value })}
            required
          />
        </div>
        <div className="md:col-span-4 space-y-1">
          <Label>备注</Label>
          <Input
            value={row.notes}
            onChange={(e) => onPatch({ notes: e.target.value })}
            placeholder="可选"
          />
        </div>
        <div className="flex items-end md:col-span-1">
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (
                  !confirmDestructiveAction(
                    `确定删除「${row.productName || "该行"}」？需保存合同后才会生效。`
                  )
                ) {
                  return;
                }
                onRemove();
              }}
            >
              删
            </Button>
          ) : null}
        </div>
      </div>

      {isExternal ? (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">外部付款计划</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const plan = paymentPlan.map((item) => ({
                    periodNumber: item.periodNumber,
                    amount: Number(item.amount) || 0,
                    condition: item.condition,
                    dueAt: item.dueAt,
                  }));
                  const next = buildProportionalExternalPlan(
                    Number(row.costAmount) || 0,
                    contractAmount,
                    plan
                  );
                  if (!next.length) {
                    onError("请先填写合同金额、应付总额与回款计划，再等比对齐");
                    return;
                  }
                  onError(null);
                  onPatch({ externalInstallments: next });
                }}
              >
                等比对齐回款计划
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  onPatch({
                    externalInstallments: [
                      ...row.externalInstallments,
                      {
                        key: newKey(),
                        periodNumber: row.externalInstallments.length + 1,
                        amount: "",
                        condition: "",
                        dueAt: "",
                      },
                    ],
                  })
                }
              >
                添加期次
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            付款计划合计须等于应付总额（{(Number(row.costAmount) || 0).toFixed(2)} 元）。当前合计：
            <span
              className={
                Math.abs(externalGap) <= 0.01
                  ? "ml-1 font-medium text-emerald-600"
                  : "ml-1 font-medium text-destructive"
              }
            >
              {externalPlanSum.toFixed(2)} 元
            </span>
          </p>
          {row.externalInstallments.map((planRow) => (
            <div key={planRow.key} className="grid gap-2 md:grid-cols-12">
              <div className="md:col-span-1 space-y-1">
                <Label>期次</Label>
                <Input
                  type="number"
                  min={1}
                  value={planRow.periodNumber}
                  onChange={(e) =>
                    onPatch({
                      externalInstallments: row.externalInstallments.map((p) =>
                        p.key === planRow.key
                          ? { ...p, periodNumber: Number(e.target.value) || 1 }
                          : p
                      ),
                    })
                  }
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label>计划金额 *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={planRow.amount}
                  onChange={(e) =>
                    onPatch({
                      externalInstallments: row.externalInstallments.map((p) =>
                        p.key === planRow.key ? { ...p, amount: e.target.value } : p
                      ),
                    })
                  }
                />
              </div>
              <div className="md:col-span-4 space-y-1">
                <Label>付款条件</Label>
                <Input
                  value={planRow.condition}
                  onChange={(e) =>
                    onPatch({
                      externalInstallments: row.externalInstallments.map((p) =>
                        p.key === planRow.key ? { ...p, condition: e.target.value } : p
                      ),
                    })
                  }
                />
              </div>
              <div className="md:col-span-3 space-y-1">
                <Label>计划到期</Label>
                <Input
                  type="date"
                  value={planRow.dueAt}
                  onChange={(e) =>
                    onPatch({
                      externalInstallments: row.externalInstallments.map((p) =>
                        p.key === planRow.key ? { ...p, dueAt: e.target.value } : p
                      ),
                    })
                  }
                />
              </div>
              <div className="flex items-end md:col-span-1">
                {row.externalInstallments.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onPatch({
                        externalInstallments: row.externalInstallments.filter(
                          (p) => p.key !== planRow.key
                        ),
                      })
                    }
                  >
                    删
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ContractCostComposition({
  products,
  onChange,
  internalNameOptions,
  externalNameOptions,
  contractAmount,
  grossProfit,
  paymentPlan,
  onError,
}: Props) {
  const internalRows = products.filter((row) => row.costType === "INTERNAL");
  const externalRows = products.filter((row) => row.costType === "EXTERNAL");

  function patchRow(key: string, patch: Partial<CostProductLine>) {
    onChange(products.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function removeRow(key: string) {
    onChange(products.filter((item) => item.key !== key));
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">成本构成</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          合同售价为上方合同金额；内部与外部成本分开录入。预估毛利：
          <span className="ml-1 font-medium text-foreground">
            {Number.isFinite(grossProfit) ? grossProfit.toFixed(2) : "—"} 元
          </span>
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">内部成本</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...products, defaultCostProductLine("INTERNAL")])}
          >
            添加内部成本
          </Button>
        </div>
        {internalRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无内部成本，可点击上方添加。</p>
        ) : (
          internalRows.map((row) => (
            <CostRow
              key={row.key}
              row={row}
              nameOptions={internalNameOptions}
              canDelete={products.length > 1}
              paymentPlan={paymentPlan}
              contractAmount={contractAmount}
              onPatch={(patch) => patchRow(row.key, patch)}
              onRemove={() => removeRow(row.key)}
              onError={onError}
            />
          ))
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">外部成本</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...products, defaultCostProductLine("EXTERNAL")])}
          >
            添加外部成本
          </Button>
        </div>
        {externalRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无外部成本，可点击上方添加。</p>
        ) : (
          externalRows.map((row) => (
            <CostRow
              key={row.key}
              row={row}
              nameOptions={externalNameOptions}
              canDelete={products.length > 1}
              paymentPlan={paymentPlan}
              contractAmount={contractAmount}
              onPatch={(patch) => patchRow(row.key, patch)}
              onRemove={() => removeRow(row.key)}
              onError={onError}
            />
          ))
        )}
      </div>
    </section>
  );
}
