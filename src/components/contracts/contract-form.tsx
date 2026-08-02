"use client";

import { useMemo, useState, useTransition } from "react";
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
  updateContract,
} from "@/app/(dashboard)/contracts/actions";
import { SIGNING_TYPE_LABELS } from "@/lib/permissions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import {
  asUserFacingError,
  toUserFacingActionError,
  type ActionResult,
  type UserFacingActionError,
} from "@/lib/action-result";
import { ActionErrorDisplay } from "@/components/ui/action-error-display";
import { validateInstallmentCoverage } from "@/lib/validations/contract";
import { getContractPaymentRemaining } from "@/lib/contracts/payment-waterfall";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";
import { ContractAttachmentsPanel } from "@/components/contracts/contract-attachments-panel";
import {
  ContractPendingAttachments,
  uploadContractAttachmentFiles,
} from "@/components/contracts/contract-pending-attachments";
import {
  ContractCostComposition,
  defaultCostProductLine,
  type CostProductLine,
} from "@/components/contracts/contract-cost-composition";
import type { ConfigOptionItem } from "@/lib/config-options";
import { nextClientKey } from "@/lib/ui/stable-client-key";
import {
  DealPartiesEditor,
  partiesToJson,
} from "@/components/deals/deal-parties-editor";
import type { DealPartyDraft } from "@/lib/deals/party-roles";

type SalesOption = { id: string; name: string };
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
  internalCostNameOptions?: ConfigOptionItem[];
  externalCostNameOptions?: ConfigOptionItem[];
  opportunityId?: string;
  opportunityTitle?: string;
  contractId?: string;
  isResubmit?: boolean;
  isEdit?: boolean;
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
    opportunityId?: string;
    opportunityTitle?: string;
    signedAt?: string;
    effectiveAt?: string;
    expiresAt?: string;
    notes?: string;
    products?: Array<{
      productServiceId?: string | null;
      productName: string;
      description?: string | null;
      costAmount: number;
      costType?: "INTERNAL" | "EXTERNAL";
      externalInstallments?: Array<{
        periodNumber: number;
        amount: number;
        condition?: string | null;
        dueAt?: string | null;
      }>;
    }>;
    installments?: Array<{
      periodNumber: number;
      amount: number;
      condition?: string | null;
      dueAt?: string | null;
    }>;
  };
  submitLabel?: string;
  initialParties?: DealPartyDraft[];
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
  return nextClientKey("form");
}

/** 两列网格内统一标签行高，使左右输入框对齐 */
const FORM_GRID_CELL = "grid min-w-0 grid-rows-[2.75rem_auto] gap-2 space-y-0";
const FORM_GRID_LABEL = "self-end leading-snug";
const FORM_FULL_WIDTH = "space-y-2 md:col-span-2";

function defaultInstallmentLine(periodNumber: number, amount = ""): InstallmentLine {
  return { key: newKey(), periodNumber, amount, condition: "", dueAt: "" };
}

function formatInstallmentPrefillAmount(amount: number) {
  if (amount <= 0) return "";
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function ContractForm({
  showOwnerSelect,
  salesUsers = [],
  paymentMethodOptions = [],
  internalCostNameOptions = [],
  externalCostNameOptions = [],
  opportunityId,
  opportunityTitle,
  contractId,
  isResubmit,
  isEdit,
  currentUserId,
  defaultValues,
  submitLabel = "提交销售合同",
  initialParties = [],
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<UserFacingActionError | null>(null);
  const [pending, startTransition] = useTransition();

  const [linkedOpportunityId, setLinkedOpportunityId] = useState(
    opportunityId ?? defaultValues?.opportunityId ?? ""
  );
  const [linkedOpportunityLabel, setLinkedOpportunityLabel] = useState(
    opportunityTitle ?? defaultValues?.opportunityTitle ?? ""
  );

  const [signCustomerId, setSignCustomerId] = useState(defaultValues?.signCustomerId ?? "");
  const [signCustomerLabel, setSignCustomerLabel] = useState(defaultValues?.signCustomerName ?? "");
  const [endUserCustomerId, setEndUserCustomerId] = useState(
    defaultValues?.endUserCustomerId ?? defaultValues?.signCustomerId ?? ""
  );
  const [endUserCustomerLabel, setEndUserCustomerLabel] = useState(
    defaultValues?.endUserCustomerName ?? defaultValues?.signCustomerName ?? ""
  );
  const [signingType, setSigningType] = useState(
    defaultValues?.signingType === "INDIRECT" ? "INDIRECT" : "DIRECT"
  );
  const isDirectSign = signingType === "DIRECT";
  const [parties, setParties] = useState<DealPartyDraft[]>(() =>
    initialParties.map((p) => ({ ...p, key: p.key || nextClientKey("party") }))
  );
  const [signContactId, setSignContactId] = useState(defaultValues?.signContactId ?? "");
  const [totalAmount, setTotalAmount] = useState(
    defaultValues?.totalAmount != null ? String(defaultValues.totalAmount) : ""
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const [products, setProducts] = useState<CostProductLine[]>(() =>
    defaultValues?.products?.length
      ? defaultValues.products.map((row) => ({
          key: newKey(),
          productName: row.productName,
          notes: row.description ?? "",
          costAmount: String(row.costAmount),
          costType: row.costType === "EXTERNAL" ? "EXTERNAL" : "INTERNAL",
          externalInstallments:
            row.costType === "EXTERNAL" && row.externalInstallments?.length
              ? row.externalInstallments.map((item) => ({
                  key: newKey(),
                  periodNumber: item.periodNumber,
                  amount: String(item.amount),
                  condition: item.condition ?? "",
                  dueAt: item.dueAt ? toDateInput(item.dueAt) : "",
                }))
              : [],
        }))
      : [defaultCostProductLine("INTERNAL")]
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
  const installmentCoverageError = useMemo(() => {
    if (contractAmountNum <= 0) return null;
    return validateInstallmentCoverage(
      contractAmountNum,
      installments.map((row) => ({ amount: Number(row.amount) || 0 }))
    );
  }, [contractAmountNum, installments]);
  const installmentsCovered = !installmentCoverageError;

  function handleAddInstallment() {
    setInstallments((rows) => {
      const currentTotal = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      const remaining = getContractPaymentRemaining(contractAmountNum, currentTotal);
      return [
        ...rows,
        defaultInstallmentLine(rows.length + 1, formatInstallmentPrefillAmount(remaining)),
      ];
    });
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
      productName: row.productName.trim(),
      description: row.notes.trim() || null,
      costType: row.costType,
      costAmount: Number(row.costAmount) || 0,
      externalInstallments:
        row.costType === "EXTERNAL"
          ? row.externalInstallments.map((item) => ({
              periodNumber: item.periodNumber,
              amount: Number(item.amount) || 0,
              condition: item.condition.trim() || null,
              dueAt: item.dueAt || null,
            }))
          : [],
    }));

    const installmentsPayload = installments.map((row) => ({
      periodNumber: row.periodNumber,
      amount: Number(row.amount) || 0,
      condition: row.condition.trim() || null,
      dueAt: row.dueAt || null,
    }));

    formData.set("productsJson", JSON.stringify(productsPayload));
    formData.set("installmentsJson", JSON.stringify(installmentsPayload));
    formData.set("partiesJson", partiesToJson(parties));

    const coverageError = validateInstallmentCoverage(contractAmountNum, installmentsPayload);
    if (coverageError) {
      setError(asUserFacingError(coverageError));
      return;
    }

    startTransition(async () => {
      setError(null);
      try {
        let result: ActionResult;
        if (isEdit && contractId) {
          result = await updateContract(contractId, formData);
        } else if (isResubmit && contractId) {
          result = await resubmitContract(contractId, formData);
        } else if (resolvedOpportunityId) {
          result = await createContractFromOpportunity(resolvedOpportunityId, formData);
        } else {
          result = await createContract(formData);
        }
        if (result.error) {
          setError(asUserFacingError(result.error));
          return;
        }

        const savedId = result.contractId ?? contractId;
        if (savedId && pendingFiles.length > 0) {
          const uploadErrors = await uploadContractAttachmentFiles(savedId, pendingFiles);
          if (uploadErrors.length > 0) {
            window.alert(`合同已保存，但部分附件上传失败：\n${uploadErrors.join("\n")}`);
          } else {
            setPendingFiles([]);
          }
        }

        if (result.redirectTo) {
          router.push(result.redirectTo);
          router.refresh();
        }
      } catch (e) {
        setError(toUserFacingActionError(e));
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
            value={signingType}
            onValueChange={(next) => {
              const typed = next === "INDIRECT" ? "INDIRECT" : "DIRECT";
              setSigningType(typed);
              if (typed === "DIRECT" && signCustomerId) {
                setEndUserCustomerId(signCustomerId);
                setEndUserCustomerLabel(signCustomerLabel);
              } else if (
                typed === "INDIRECT" &&
                signCustomerId &&
                endUserCustomerId === signCustomerId
              ) {
                setEndUserCustomerId("");
                setEndUserCustomerLabel("");
              }
            }}
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
              if (isDirectSign) {
                setEndUserCustomerId(id);
                setEndUserCustomerLabel(option?.label ?? "");
              }
            }}
            excludeIds={
              isDirectSign
                ? parties.map((p) => p.customerId).filter(Boolean)
                : [endUserCustomerId, ...parties.map((p) => p.customerId)].filter(Boolean)
            }
          />

          <CustomerSearchSelect
            id="endUserCustomerId"
            name="endUserCustomerId"
            label="最终用户 *"
            required
            className={FORM_GRID_CELL}
            labelClassName={FORM_GRID_LABEL}
            value={endUserCustomerId}
            selectedLabel={endUserCustomerLabel}
            disabled={isDirectSign}
            excludeIds={
              isDirectSign
                ? parties.map((p) => p.customerId).filter(Boolean)
                : [signCustomerId, ...parties.map((p) => p.customerId)].filter(Boolean)
            }
            onValueChange={(id, option) => {
              if (isDirectSign) return;
              setEndUserCustomerId(id);
              setEndUserCustomerLabel(option?.label ?? "");
            }}
          />
          {isDirectSign ? (
            <p className="-mt-1 text-xs text-muted-foreground md:col-span-2">
              直签：最终用户自动与签约客户保持一致。
            </p>
          ) : (
            <p className="-mt-1 text-xs text-muted-foreground md:col-span-2">
              非直签：最终用户须与签约客户不同。
            </p>
          )}

          <div className="md:col-span-2">
            <DealPartiesEditor
              parties={parties}
              onChange={setParties}
              excludeCustomerIds={[signCustomerId, endUserCustomerId].filter(Boolean)}
              title="关联其他客户（渠道/第三方）"
              description="签约客户与最终用户之外的渠道、第三方等；不可与上述两方重复。"
            />
          </div>

          <div className={FORM_GRID_CELL}>
            <Label htmlFor="signContactId" className={FORM_GRID_LABEL}>
              对方代表 *
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">回款计划 *</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddInstallment}
            >
              添加期次
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          计划合计须等于合同金额
          {contractAmountNum > 0 ? `（${contractAmountNum.toFixed(2)} 元）` : ""}。当前合计：
          <span
            className={
              installmentsCovered
                ? "ml-1 font-medium text-emerald-600"
                : "ml-1 font-medium text-destructive"
            }
          >
            {installmentTotal.toFixed(2)} 元
          </span>
        </p>
        {installmentCoverageError && (
          <p className="text-sm text-destructive">{installmentCoverageError}</p>
        )}
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
                    onClick={() => {
                      if (
                        !confirmDestructiveAction(
                          `确定删除第 ${row.periodNumber} 期回款计划？需保存合同后才会生效。`
                        )
                      ) {
                        return;
                      }
                      setInstallments((rows) => rows.filter((item) => item.key !== row.key));
                    }}
                  >
                    删
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ContractCostComposition
        products={products}
        onChange={setProducts}
        internalNameOptions={internalCostNameOptions}
        externalNameOptions={externalCostNameOptions}
        contractAmount={contractAmountNum}
        grossProfit={grossProfit}
        paymentPlan={installments}
        onError={(message) => setError(asUserFacingError(message))}
      />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">合同附件</h2>
        {contractId ? (
          <ContractAttachmentsPanel contractId={contractId} canUpload canDelete />
        ) : (
          <ContractPendingAttachments
            files={pendingFiles}
            onChange={setPendingFiles}
            disabled={pending}
          />
        )}
      </section>

      <ActionErrorDisplay error={error} />

      <Button type="submit" disabled={pending || !installmentsCovered}>
        {pending ? "提交中…" : submitLabel}
      </Button>
    </form>
  );
}
