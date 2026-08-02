"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addExpenseTrip,
  approveExpenseByManager,
  payoutExpenseClaim,
  rejectExpenseByManager,
  removeExpenseInvoice,
  removeExpenseTrip,
  submitExpenseClaim,
  updateExpenseClaimDraft,
  updateExpenseInvoiceAllocation,
  updateExpenseTrip,
  uploadExpenseInvoice,
} from "@/app/(dashboard)/expenses/actions";
import {
  EXPENSE_CATEGORY_RULES,
  EXPENSE_COST_TARGET_LABELS,
} from "@/lib/expenses/labels";
import { SALES_COST_TYPE_LABELS } from "@/lib/sales-costs/labels";
import {
  EXPENSE_CITY_TIER_LABELS,
  normalizeCityName,
  type EffectiveExpenseTravelPolicy,
} from "@/lib/expenses/travel-policy";
import type { ExpenseCityTier } from "@prisma/client";

type UserOption = { id: string; name: string };
type ProjectOption = { id: string; name: string };
type CustomerOption = { id: string; name: string };

type InvoiceRow = {
  id: string;
  fileName: string;
  amount: unknown;
  invoiceNo: string | null;
  invoicedAt: Date | null;
  sellerName: string | null;
  categoryKey: string | null;
  costTarget: string | null;
  salesCostType: string | null;
  customerId: string | null;
  projectId: string | null;
  costCategory: string | null;
  ocrNotes: string | null;
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
};

type TripRow = {
  id: string;
  sortOrder: number;
  startDate: Date;
  endDate: Date;
  fromCity: string | null;
  city: string | null;
  customerId: string | null;
  description: string | null;
  customer: { id: string; name: string } | null;
};

type CityHotelHint = {
  cityName: string;
  tier: ExpenseCityTier;
  hotelCapPerNight: number;
  tierLabel: string;
};

function hotelHintForCity(
  city: string | null | undefined,
  hints: CityHotelHint[],
  policy: EffectiveExpenseTravelPolicy
): { tierLabel: string; cap: number; matched: boolean } {
  const normalized = city ? normalizeCityName(city) : "";
  if (!normalized) {
    return { tierLabel: EXPENSE_CITY_TIER_LABELS.TIER_3, cap: policy.hotelCapTier3, matched: false };
  }
  const hit = hints.find((h) => normalizeCityName(h.cityName) === normalized);
  if (hit) {
    return { tierLabel: hit.tierLabel, cap: hit.hotelCapPerNight, matched: true };
  }
  return { tierLabel: EXPENSE_CITY_TIER_LABELS.TIER_3, cap: policy.hotelCapTier3, matched: false };
}

function money(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function dateInputValue(d: Date | null) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function ExpenseClaimEditor(props: {
  claimId: string;
  mode: "edit" | "manager" | "finance" | "view";
  initialTitle: string;
  initialDescription: string | null;
  invoices: InvoiceRow[];
  trips: TripRow[];
  managers: UserOption[];
  projects: ProjectOption[];
  customers: CustomerOption[];
  currentManagerId?: string | null;
  hotelPolicy: EffectiveExpenseTravelPolicy;
  cityHotelHints: CityHotelHint[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(props.initialTitle);
  const [description, setDescription] = useState(props.initialDescription ?? "");
  const [managerId, setManagerId] = useState(props.currentManagerId ?? props.managers[0]?.id ?? "");
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const editable = props.mode === "edit";
  const canAllocate = props.mode === "edit" || props.mode === "manager";

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingTripId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">基本信息</h2>
        <div className="space-y-2">
          <Label htmlFor="exp-title">标题 *</Label>
          <Input
            id="exp-title"
            value={title}
            disabled={!editable || pending}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exp-desc">说明</Label>
          <Textarea
            id="exp-desc"
            rows={2}
            value={description}
            disabled={!editable || pending}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        {editable ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const fd = new FormData();
                fd.set("title", title);
                fd.set("description", description);
                return updateExpenseClaimDraft(props.claimId, fd);
              })
            }
          >
            保存基本信息
          </Button>
        ) : null}
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <div>
          <h2 className="font-medium">出差行程（可添加多段）</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            例如：武汉 → 上海 → 北京，每段单独添加。目的地城市会显示对应住宿标准（
            {EXPENSE_CITY_TIER_LABELS.TIER_1} ¥{props.hotelPolicy.hotelCapTier1}/晚 ·{" "}
            {EXPENSE_CITY_TIER_LABELS.TIER_2} ¥{props.hotelPolicy.hotelCapTier2}/晚 ·{" "}
            {EXPENSE_CITY_TIER_LABELS.TIER_3} ¥{props.hotelPolicy.hotelCapTier3}/晚）。
          </p>
        </div>
        <ul className="space-y-3 text-sm">
          {props.trips.length === 0 ? (
            <li className="text-muted-foreground">暂无行程，可按实际路线添加多段</li>
          ) : (
            props.trips.map((t, idx) => {
              const hint = hotelHintForCity(t.city, props.cityHotelHints, props.hotelPolicy);
              const isEditing = editingTripId === t.id;
              return (
                <li key={t.id} className="space-y-2 rounded border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        第 {idx + 1} 段
                        {t.fromCity || t.city
                          ? ` · ${t.fromCity || "—"} → ${t.city || "—"}`
                          : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {dateInputValue(t.startDate)} ~ {dateInputValue(t.endDate)}
                        {t.customer ? ` · ${t.customer.name}` : ""}
                        {t.description ? ` · ${t.description}` : ""}
                      </p>
                      {t.city ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          住宿标准参考：{hint.tierLabel}
                          {!hint.matched ? "（未收录城市，按三线及以下）" : ""} · ¥{hint.cap}/晚
                        </p>
                      ) : null}
                    </div>
                    {editable ? (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setEditingTripId(isEditing ? null : t.id)}
                        >
                          {isEditing ? "取消" : "编辑"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => removeExpenseTrip(t.id))}
                        >
                          删除
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {editable && isEditing ? (
                    <form
                      className="grid gap-2 md:grid-cols-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        run(() => updateExpenseTrip(t.id, fd));
                      }}
                    >
                      <div className="space-y-1">
                        <Label>开始日期</Label>
                        <Input name="startDate" type="date" required defaultValue={dateInputValue(t.startDate)} />
                      </div>
                      <div className="space-y-1">
                        <Label>结束日期</Label>
                        <Input name="endDate" type="date" required defaultValue={dateInputValue(t.endDate)} />
                      </div>
                      <div className="space-y-1">
                        <Label>出发城市</Label>
                        <Input name="fromCity" defaultValue={t.fromCity ?? ""} placeholder="如：武汉" />
                      </div>
                      <div className="space-y-1">
                        <Label>目的地/住宿城市</Label>
                        <Input name="city" defaultValue={t.city ?? ""} placeholder="如：上海" list="expense-city-hints" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label>关联客户</Label>
                        <select
                          name="customerId"
                          defaultValue={t.customerId ?? ""}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">不选</option>
                          {props.customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label>说明</Label>
                        <Input name="description" defaultValue={t.description ?? ""} placeholder="拜访/实施说明" />
                      </div>
                      <div className="md:col-span-2">
                        <Button type="submit" size="sm" disabled={pending}>
                          保存本段
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
        {editable ? (
          <form
            className="grid gap-2 rounded-md border border-dashed p-3 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => addExpenseTrip(props.claimId, fd));
              e.currentTarget.reset();
            }}
          >
            <p className="md:col-span-2 text-sm font-medium">添加下一段行程</p>
            <div className="space-y-1">
              <Label>开始日期</Label>
              <Input name="startDate" type="date" required />
            </div>
            <div className="space-y-1">
              <Label>结束日期</Label>
              <Input name="endDate" type="date" required />
            </div>
            <div className="space-y-1">
              <Label>出发城市</Label>
              <Input name="fromCity" placeholder="如：武汉" />
            </div>
            <div className="space-y-1">
              <Label>目的地/住宿城市</Label>
              <Input name="city" placeholder="如：上海" list="expense-city-hints" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>关联客户</Label>
              <select
                name="customerId"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
              >
                <option value="">不选</option>
                {props.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>说明</Label>
              <Input name="description" placeholder="拜访/实施说明" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" size="sm" disabled={pending}>
                添加行程段
              </Button>
            </div>
          </form>
        ) : null}
        <datalist id="expense-city-hints">
          {props.cityHotelHints.map((h) => (
            <option key={h.cityName} value={h.cityName}>
              {h.tierLabel} · ¥{h.hotelCapPerNight}/晚
            </option>
          ))}
        </datalist>
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <h2 className="font-medium">发票明细</h2>
        {editable ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => uploadExpenseInvoice(props.claimId, fd));
              e.currentTarget.reset();
            }}
          >
            <div className="space-y-1">
              <Label>费用类别</Label>
              <select
                name="categoryKey"
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue="customer_visit"
              >
                {EXPENSE_CATEGORY_RULES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>发票文件</Label>
              <Input name="file" type="file" accept="image/*,.pdf,application/pdf" required />
            </div>
            <Button type="submit" disabled={pending}>
              上传并 AI 识别
            </Button>
          </form>
        ) : null}

        <ul className="space-y-4">
          {props.invoices.length === 0 ? (
            <li className="text-sm text-muted-foreground">尚未上传发票</li>
          ) : (
            props.invoices.map((inv, idx) => (
              <li key={inv.id} className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-medium">
                      发票 {idx + 1} ·{" "}
                      <a
                        href={`/api/expenses/${props.claimId}/invoices/${inv.id}/file?inline=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {inv.fileName}
                      </a>
                    </p>
                    <p className="text-muted-foreground">
                      {inv.sellerName ? `${inv.sellerName} · ` : ""}
                      {inv.invoiceNo ? `票号 ${inv.invoiceNo} · ` : ""}
                      金额 ¥{money(inv.amount)}
                      {inv.invoicedAt ? ` · ${dateInputValue(inv.invoicedAt)}` : ""}
                    </p>
                    {inv.ocrNotes ? (
                      <p className="text-xs text-muted-foreground">{inv.ocrNotes}</p>
                    ) : null}
                  </div>
                  {editable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => removeExpenseInvoice(inv.id))}
                    >
                      删除
                    </Button>
                  ) : null}
                </div>

                {canAllocate ? (
                  <form
                    className="grid gap-2 md:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      run(() => updateExpenseInvoiceAllocation(inv.id, fd));
                    }}
                  >
                    <div className="space-y-1">
                      <Label>金额</Label>
                      <Input
                        name="amount"
                        type="number"
                        step="0.01"
                        defaultValue={money(inv.amount)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>费用类别</Label>
                      <select
                        name="categoryKey"
                        defaultValue={inv.categoryKey ?? "other"}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {EXPENSE_CATEGORY_RULES.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>成本归属 *</Label>
                      <select
                        name="costTarget"
                        defaultValue={inv.costTarget ?? ""}
                        required={props.mode === "manager"}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">请选择</option>
                        {(Object.keys(EXPENSE_COST_TARGET_LABELS) as Array<
                          keyof typeof EXPENSE_COST_TARGET_LABELS
                        >).map((k) => (
                          <option key={k} value={k}>
                            {EXPENSE_COST_TARGET_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>销售成本类型</Label>
                      <select
                        name="salesCostType"
                        defaultValue={inv.salesCostType ?? ""}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">（销售归属时必选）</option>
                        {Object.entries(SALES_COST_TYPE_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>关联客户</Label>
                      <select
                        name="customerId"
                        defaultValue={inv.customerId ?? ""}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">不选</option>
                        {props.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>关联项目</Label>
                      <select
                        name="projectId"
                        defaultValue={inv.projectId ?? ""}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">（项目归属时必选）</option>
                        {props.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>成本类别/备注</Label>
                      <Input
                        name="costCategory"
                        defaultValue={inv.costCategory ?? ""}
                        placeholder="写入项目成本类别或补充说明"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Button type="submit" size="sm" variant="outline" disabled={pending}>
                        保存本发票归属
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    归属：
                    {inv.costTarget
                      ? EXPENSE_COST_TARGET_LABELS[
                          inv.costTarget as keyof typeof EXPENSE_COST_TARGET_LABELS
                        ]
                      : "未指定"}
                    {inv.project ? ` · 项目 ${inv.project.name}` : ""}
                    {inv.customer ? ` · 客户 ${inv.customer.name}` : ""}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>
      </section>

      {editable ? (
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">提交审批</h2>
          <div className="space-y-2 max-w-md">
            <Label>指定上级审批人 *</Label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {props.managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            disabled={pending || !managerId}
            onClick={() =>
              run(async () => {
                const fd = new FormData();
                fd.set("managerId", managerId);
                return submitExpenseClaim(props.claimId, fd);
              })
            }
          >
            提交报销
          </Button>
        </section>
      ) : null}

      {props.mode === "manager" ? (
        <section className="flex flex-wrap gap-3 rounded-md border p-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => approveExpenseByManager(props.claimId, fd));
            }}
          >
            <div className="space-y-1">
              <Label>审批意见</Label>
              <Input name="comment" placeholder="可选" />
            </div>
            <Button type="submit" disabled={pending}>
              通过并提交财务
            </Button>
          </form>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => rejectExpenseByManager(props.claimId, fd));
            }}
          >
            <div className="space-y-1">
              <Label>驳回原因</Label>
              <Input name="comment" placeholder="必填建议" required />
            </div>
            <Button type="submit" variant="outline" disabled={pending}>
              驳回
            </Button>
          </form>
        </section>
      ) : null}

      {props.mode === "finance" ? (
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">打款结案</h2>
          <p className="text-sm text-muted-foreground">
            确认后将按每张发票归属写入销售成本或项目成本，并通知申请人。
          </p>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => payoutExpenseClaim(props.claimId, fd));
            }}
          >
            <div className="space-y-1">
              <Label>打款日期</Label>
              <Input
                name="paidAt"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>备注</Label>
              <Input name="notes" placeholder="可选" />
            </div>
            <Button type="submit" disabled={pending}>
              确认已打款并结案
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
