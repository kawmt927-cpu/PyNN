"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ExpenseClaimKind, ExpenseItemKind } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  addExpenseClaimItem,
  approveExpenseByHr,
  approveExpenseByManager,
  payoutExpenseClaim,
  rejectExpenseByHr,
  rejectExpenseByManager,
  removeExpenseClaimItem,
  removeExpenseInvoice,
  removeExpenseTrip,
  saveExpenseTrips,
  submitExpenseClaim,
  setExpenseItemAmount,
  getExpenseApproverOptionsForBeneficiary,
  updateExpenseClaimItem,
  updateExpenseInvoiceAllocation,
  updateExpenseInvoiceMeta,
  uploadExpenseInvoice,
} from "@/app/(dashboard)/expenses/actions";
import {
  BedDouble,
  Briefcase,
  BusFront,
  Camera,
  CarFront,
  CarTaxiFront,
  ChevronDown,
  CircleEllipsis,
  FileUp,
  Fuel,
  HandCoins,
  Navigation,
  Plane,
  Route,
  ShieldCheck,
  Ship,
  Ticket,
  TrainFront,
  TramFront,
  Upload,
  Wine,
} from "lucide-react";
import { EXPENSE_COST_TARGET_LABELS } from "@/lib/expenses/labels";
import { SALES_COST_TYPE_LABELS } from "@/lib/sales-costs/labels";
import {
  type EffectiveExpenseTravelPolicy,
} from "@/lib/expenses/travel-policy";
import {
  FEE_ONLY_KEYS,
  TRAVEL_EXPENSE_FEE_KEYS,
  type ExpenseFeeCategoryView,
} from "@/lib/expenses/fee-categories";
import type { ExpenseCityTier } from "@prisma/client";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { ProvinceCityPicker } from "@/components/geo/province-city-picker";
import {
  summarizeTripDaysByTier,
  TRIP_TIER_DAY_LABELS,
} from "@/lib/expenses/trip-days";
import { evaluateHotelCapClient, computeLodgingCapPreview } from "@/lib/expenses/hotel-cap-client";
import type { ActionResult } from "@/lib/action-result";

type UserOption = { id: string; name: string };
type ProjectOption = { id: string; name: string };
type CustomerOption = { id: string; name: string };

type InvoiceRow = {
  id: string;
  fileName: string;
  amount: unknown;
  ocrAmount?: unknown;
  storageKey?: string;
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
  ocrRawSummary?: string | null;
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

type ClaimItemRow = {
  id: string;
  kind: ExpenseItemKind;
  sortOrder: number;
  title: string | null;
  categoryKey: string | null;
  customerId: string | null;
  projectId: string | null;
  notes: string | null;
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  trips: TripRow[];
  invoices: InvoiceRow[];
};

type CityHotelHint = {
  cityName: string;
  tier: ExpenseCityTier;
  hotelCapPerNight: number;
  tierLabel: string;
};

function money(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

/** 各类型图标互不重复 */
const TYPE_STYLE: Record<
  string,
  { icon: typeof Plane; className: string }
> = {
  TRAVEL: { icon: Plane, className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  lodging: { icon: BedDouble, className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200" },
  train_ticket: {
    icon: TrainFront,
    className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  },
  ride_hailing: {
    icon: CarFront,
    className: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
  },
  air_ticket: { icon: Plane, className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  taxi: {
    icon: CarTaxiFront,
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  coach_ticket: {
    icon: BusFront,
    className: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  },
  mileage_subsidy: {
    icon: Route,
    className: "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200",
  },
  ferry_ticket: { icon: Ship, className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200" },
  toll: { icon: Fuel, className: "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200" },
  metro_bus: {
    icon: TramFront,
    className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  },
  other_transport: {
    icon: Navigation,
    className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  },
  transport_insurance: {
    icon: ShieldCheck,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  },
  booking_fee: {
    icon: Ticket,
    className: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200",
  },
  travel_allowance: {
    icon: HandCoins,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  transport: {
    icon: CarFront,
    className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  meal_subsidy: {
    icon: HandCoins,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  },
  business_entertainment: {
    icon: Wine,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  },
  office: { icon: Briefcase, className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
  other: { icon: CircleEllipsis, className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" },
};

function typeStyle(key: string) {
  return TYPE_STYLE[key] ?? TYPE_STYLE.other;
}

/** 有归属项目列 */
const EXPENSE_ROW_GRID_WITH_PROJECT =
  "grid grid-cols-[8.5rem_4.25rem_7rem_minmax(8rem,1fr)_5.5rem_2rem] items-center gap-x-2 px-3";
/** 差旅/费用：无行程列 */
const EXPENSE_ROW_GRID_NO_PROJECT =
  "grid grid-cols-[8.5rem_4.25rem_7rem_minmax(8rem,1fr)_2rem] items-center gap-x-2 px-3";
/** 手机端纵向堆叠 */
const EXPENSE_ROW_GRID_MOBILE = "grid grid-cols-1 gap-2 px-3";

const TRAVEL_FEE_KEY_SET = new Set<string>(TRAVEL_EXPENSE_FEE_KEYS);
const FEE_ONLY_KEY_SET = new Set<string>(FEE_ONLY_KEYS);

function dateInputValue(d: Date | null) {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

type DraftTrip = {
  key: string;
  id: string | null;
  startDate: string;
  endDate: string;
  fromCity: string;
  city: string;
};

function sortDraftTrips(rows: DraftTrip[]): DraftTrip[] {
  return [...rows].sort((a, b) => {
    const as = a.startDate || "9999-99-99";
    const bs = b.startDate || "9999-99-99";
    if (as !== bs) return as.localeCompare(bs);
    const ae = a.endDate || as;
    const be = b.endDate || bs;
    return ae.localeCompare(be);
  });
}

function tripsToDrafts(trips: TripRow[]): DraftTrip[] {
  return sortDraftTrips(
    trips.map((t) => ({
      key: t.id,
      id: t.id,
      startDate: dateInputValue(t.startDate),
      endDate: dateInputValue(t.endDate),
      fromCity: t.fromCity ?? "",
      city: t.city ?? "",
    }))
  );
}

export function ExpenseClaimEditor(props: {
  claimId: string;
  mode: "edit" | "manager" | "hr" | "finance" | "view";
  claimKind?: ExpenseClaimKind;
  initialTitle: string;
  initialDescription: string | null;
  initialBeneficiaryId: string;
  initialProjectId: string | null;
  applicantName: string;
  items: ClaimItemRow[];
  trips?: TripRow[];
  managers: UserOption[];
  beneficiaries: UserOption[];
  projects: ProjectOption[];
  customers: CustomerOption[];
  currentManagerId?: string | null;
  canProxyBeneficiary?: boolean;
  /** 当前配置流程是否需要提交人指定上级 */
  requiresSuperiorPick?: boolean;
  superiorStepName?: string | null;
  hotelPolicy: EffectiveExpenseTravelPolicy;
  cityHotelHints: CityHotelHint[];
  feeCategories: ExpenseFeeCategoryView[];
}) {
  const canProxyBeneficiary = props.canProxyBeneficiary !== false;
  const [requiresSuperiorPick, setRequiresSuperiorPick] = useState(
    props.requiresSuperiorPick !== false
  );
  const [superiorStepName, setSuperiorStepName] = useState(
    props.superiorStepName?.trim() || "指定审批人"
  );
  const [managers, setManagers] = useState(props.managers);
  const router = useRouter();
  const pathname = usePathname();
  const isMobilePath = pathname.startsWith("/mobile");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hotelConfirmMsg, setHotelConfirmMsg] = useState<string | null>(null);
  const [description, setDescription] = useState(props.initialDescription ?? "");
  const [beneficiaryId, setBeneficiaryId] = useState(props.initialBeneficiaryId);
  const [managerId, setManagerId] = useState(() => {
    const ids = new Set(props.managers.map((m) => m.id));
    if (props.currentManagerId && ids.has(props.currentManagerId)) {
      return props.currentManagerId;
    }
    return props.managers[0]?.id ?? "";
  });
  const editable = props.mode === "edit";

  // 切换实际报销人时，按对方角色刷新首个审批节点与候选人
  useEffect(() => {
    if (!editable) return;
    let cancelled = false;
    startTransition(async () => {
      const res = await getExpenseApproverOptionsForBeneficiary(beneficiaryId);
      if (cancelled || "error" in res) return;
      setManagers(res.managers);
      setRequiresSuperiorPick(res.requiresSuperiorPick);
      setSuperiorStepName(res.superiorStepName?.trim() || "指定审批人");
      setManagerId((prev) => {
        if (prev && res.managers.some((m) => m.id === prev)) return prev;
        return res.managers[0]?.id ?? "";
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随报销人变化
  }, [beneficiaryId, editable]);
  const isManagerMode = props.mode === "manager";
  const claimKind: ExpenseClaimKind = props.claimKind ?? "FEE";
  const showProjectColumn = false; // 差旅/费用不填；项目报销用单头项目
  const showClaimTrips = claimKind === "TRAVEL";
  const claimTrips = props.trips ?? [];
  const claimProjectId = props.initialProjectId;
  const claimProjectName =
    props.projects.find((p) => p.id === claimProjectId)?.name ?? null;
  const rowGrid = isMobilePath
    ? EXPENSE_ROW_GRID_MOBILE
    : showProjectColumn
      ? EXPENSE_ROW_GRID_WITH_PROJECT
      : EXPENSE_ROW_GRID_NO_PROJECT;

  const typeFeeCategories = (() => {
    if (claimKind === "TRAVEL") {
      return props.feeCategories.filter((c) => TRAVEL_FEE_KEY_SET.has(c.key));
    }
    if (claimKind === "FEE") {
      return props.feeCategories.filter((c) => FEE_ONLY_KEY_SET.has(c.key));
    }
    // 项目报销：差旅细类 + 费用类
    return props.feeCategories.filter(
      (c) => TRAVEL_FEE_KEY_SET.has(c.key) || FEE_ONLY_KEY_SET.has(c.key)
    );
  })();

  // 打开空草稿时自动补一行（兼容旧单）
  const seededEmptyRef = useRef(false);
  useEffect(() => {
    if (!editable || props.items.length > 0 || seededEmptyRef.current) return;
    seededEmptyRef.current = true;
    const defaultKey =
      claimKind === "FEE" ? "other" : typeFeeCategories[0]?.key ?? "lodging";
    const defaultLabel =
      typeFeeCategories.find((c) => c.key === defaultKey)?.label ??
      (claimKind === "FEE" ? "其他" : "住宿费");
    const fd = new FormData();
    fd.set("kind", "OTHER");
    fd.set("categoryKey", defaultKey);
    fd.set("title", defaultLabel);
    if (claimKind === "PROJECT" && claimProjectId) {
      fd.set("projectId", claimProjectId);
    }
    run(() => addExpenseClaimItem(props.claimId, fd));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首次进入空单
  }, [editable, props.items.length, props.claimId]);

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.needsConfirm?.kind === "hotel_cap_overage") {
        setHotelConfirmMsg(result.needsConfirm.message);
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const hotelCapStatus = evaluateHotelCapClient({
    trips: claimTrips,
    items: props.items,
    feeCategories: props.feeCategories,
    cityHotelHints: props.cityHotelHints,
    hotelPolicy: props.hotelPolicy,
  });

  function renderItemCards() {
    const invoiceCount = props.items.reduce((n, item) => n + item.invoices.length, 0);
    const totalAmount = props.items.reduce(
      (sum, item) =>
        sum + item.invoices.reduce((s, inv) => s + Number(inv.amount ?? 0), 0),
      0
    );
    return (
      <div className={isMobilePath ? "rounded-md border" : "overflow-x-auto rounded-md border"}>
        <div className={isMobilePath ? undefined : "min-w-[40rem]"}>
        {isMobilePath ? null : (
        <div className={`${rowGrid} border-b bg-muted/40 py-1.5 text-xs text-muted-foreground`}>
          <span>类型</span>
          <span>发票</span>
          <span>额度</span>
          <span>备注</span>
          {showProjectColumn ? <span>归属项目</span> : null}
          <span className="text-right"> </span>
        </div>
        )}
        {props.items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            点击下方「添加一行」开始填写。
          </p>
        ) : (
          <ul className="divide-y">
            {props.items.map((item) => (
              <ItemRow
                key={item.id}
                claimId={props.claimId}
                claimKind={claimKind}
                claimProjectId={claimProjectId}
                item={item}
                editable={editable}
                isManagerMode={isManagerMode}
                pending={pending}
                customers={props.customers}
                projects={props.projects}
                feeCategories={typeFeeCategories}
                showProjectColumn={showProjectColumn}
                rowGrid={rowGrid}
                hotelCapExceeded={hotelCapStatus.exceeded}
                run={run}
              />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            共 {props.items.length} 项 · {invoiceCount} 张发票
          </span>
          <span className="font-medium tabular-nums">合计 ¥{totalAmount.toFixed(2)}</span>
        </div>
        </div>
      </div>
    );
  }

  if (editable) {
    return (
      <div className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">填报人：{props.applicantName}</p>
          {claimKind === "PROJECT" ? (
            <p className="rounded-full border bg-violet-50 px-3 py-1 text-xs text-violet-900 dark:bg-violet-950 dark:text-violet-200">
              项目：{claimProjectName ?? "未选择"}
            </p>
          ) : null}
        </div>

        {showClaimTrips ? (
          <ClaimTripsSection
            claimId={props.claimId}
            trips={claimTrips}
            editable={editable}
            pending={pending}
            cityHotelHints={props.cityHotelHints}
            hotelPolicy={props.hotelPolicy}
            run={run}
          />
        ) : null}

        <section className="space-y-2">
          {showClaimTrips ? (
            <h2 className="text-sm font-medium">费用明细</h2>
          ) : null}
          {renderItemCards()}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              const defaultKey =
                claimKind === "FEE"
                  ? "other"
                  : typeFeeCategories[0]?.key ?? "lodging";
              const defaultLabel =
                typeFeeCategories.find((c) => c.key === defaultKey)?.label ??
                (claimKind === "FEE" ? "其他" : "住宿费");
              fd.set("kind", "OTHER");
              fd.set("categoryKey", defaultKey);
              fd.set("title", defaultLabel);
              if (claimKind === "PROJECT" && claimProjectId) {
                fd.set("projectId", claimProjectId);
              }
              run(() => addExpenseClaimItem(props.claimId, fd));
            }}
          >
            添加一行
          </Button>
        </section>

        <datalist id="expense-city-hints">
          {props.cityHotelHints.map((h) => (
            <option key={h.cityName} value={h.cityName}>
              {h.tierLabel} · ¥{h.hotelCapPerNight}/晚
            </option>
          ))}
        </datalist>

        <section className="space-y-4 rounded-md border p-4">
          <div>
            <h2 className="font-medium">确认并提交</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              填完上方明细后，选择实际报销人与审批人即可提交。
            </p>
          </div>

          <div className="space-y-2 max-w-md">
            <Label>实际报销人 *</Label>
            {canProxyBeneficiary ? (
              <>
                <select
                  value={beneficiaryId}
                  disabled={pending}
                  onChange={(e) => setBeneficiaryId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {props.beneficiaries.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  可代他人填报；入账挂实际报销人
                </p>
              </>
            ) : (
              <p className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
                {props.applicantName}
                <span className="ml-2 text-xs text-muted-foreground">（仅本人）</span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="exp-desc">整体说明（可选）</Label>
            <Textarea
              id="exp-desc"
              rows={2}
              value={description}
              disabled={pending}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="补充说明整单用途等"
            />
          </div>

          {requiresSuperiorPick ? (
          <div className="space-y-2 max-w-md">
            <Label>{superiorStepName} *</Label>
            {managers.length === 0 ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                暂无可选审批人，请联系管理员在「报销设置 → 审批流程」中为本节点配置审批人映射。
              </p>
            ) : managers.length === 1 ? (
              <p className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
                {managers[0]!.name}
              </p>
            ) : (
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-muted-foreground">
              {managers.length === 1
                ? `已按审批流程「${superiorStepName}」节点自动指定审批人。`
                : `选项来自审批流程中「${superiorStepName}」节点、对应当前实际报销人的审批人配置（角色或固定人员）。`}
            </p>
          </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              当前流程首步无需指定审批人，提交后将按配置自动进入审批。
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            审批人填写每张发票的成本归属并决定通过或驳回。标题按报销内容自动生成。
          </p>

          {hotelCapStatus.exceeded ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-medium">住宿超出标准</p>
              <p className="mt-1 text-xs">{hotelCapStatus.message}</p>
              <p className="mt-1 text-xs">
                {hotelCapStatus.missingNotes
                  ? "请先在住宿行「备注」中填写超标原因，再提交。"
                  : "提交时将二次确认；审核人可看到超标提示。"}
              </p>
            </div>
          ) : null}

          <Button
            type="button"
            disabled={
              pending ||
              (requiresSuperiorPick && !managerId) ||
              !beneficiaryId ||
              props.items.length === 0 ||
              (hotelCapStatus.exceeded && hotelCapStatus.missingNotes)
            }
            onClick={() =>
              run(async () => {
                const fd = new FormData();
                fd.set("managerId", managerId);
                fd.set("beneficiaryId", beneficiaryId);
                fd.set("description", description);
                return submitExpenseClaim(props.claimId, fd);
              })
            }
          >
            提交报销
          </Button>
        </section>

        <ConfirmDestructiveDialog
          open={!!hotelConfirmMsg}
          title="住宿超出标准"
          message={hotelConfirmMsg ?? ""}
          confirmLabel="仍要提交"
          pending={pending}
          variant="default"
          onCancel={() => setHotelConfirmMsg(null)}
          onConfirm={() => {
            const msg = hotelConfirmMsg;
            setHotelConfirmMsg(null);
            if (!msg) return;
            run(async () => {
              const fd = new FormData();
              fd.set("managerId", managerId);
              fd.set("beneficiaryId", beneficiaryId);
              fd.set("description", description);
              fd.set("confirmOverHotelCap", "1");
              return submitExpenseClaim(props.claimId, fd);
            });
          }}
        />
      </div>
    );
  }

  const beneficiaryName =
    props.beneficiaries.find((b) => b.id === props.initialBeneficiaryId)?.name ?? null;

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="space-y-2 rounded-md border p-4">
        <h2 className="font-medium">{props.initialTitle || "报销单"}</h2>
        <p className="text-xs text-muted-foreground">
          填报人：{props.applicantName}
          {beneficiaryName ? ` · 实际报销人：${beneficiaryName}` : null}
        </p>
        {props.initialDescription ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {props.initialDescription}
          </p>
        ) : null}
      </section>

      {showClaimTrips ? (
        <ClaimTripsSection
          claimId={props.claimId}
          trips={claimTrips}
          editable={false}
          pending={pending}
          cityHotelHints={props.cityHotelHints}
          hotelPolicy={props.hotelPolicy}
          run={run}
        />
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">{showClaimTrips ? "费用明细" : "报销内容"}</h2>
        {renderItemCards()}
      </section>

      <datalist id="expense-city-hints">
        {props.cityHotelHints.map((h) => (
          <option key={h.cityName} value={h.cityName}>
            {h.tierLabel} · ¥{h.hotelCapPerNight}/晚
          </option>
        ))}
      </datalist>

      {isManagerMode ? (
        <section className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <h2 className="font-medium">审核操作</h2>
          {hotelCapStatus.exceeded ? (
            <div className="rounded-md border border-amber-400/80 bg-amber-100/80 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-50">
              <p className="font-medium">住宿超标提示</p>
              <p className="mt-1 text-xs leading-relaxed">{hotelCapStatus.message}</p>
              {hotelCapStatus.lodgingNotes.length > 0 ? (
                <div className="mt-2 space-y-1 text-xs">
                  <p className="font-medium">申请人备注：</p>
                  {hotelCapStatus.lodgingNotes.map((n, i) => (
                    <p key={i} className="whitespace-pre-wrap rounded border bg-background/60 px-2 py-1">
                      {n}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-destructive">申请人未填写超标原因备注。</p>
              )}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            请先在上方各发票中保存成本归属，全部填写后方可通过。
          </p>
          <div className="flex flex-wrap gap-3">
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
                通过并提交行政确认
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
          </div>
        </section>
      ) : null}

      {props.mode === "hr" ? (
        <section className="space-y-3 rounded-md border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
          <h2 className="font-medium">行政确认</h2>
          <p className="text-sm text-muted-foreground">
            核对票据与归属后确认，将提交管理员终审打款。
          </p>
          <div className="flex flex-wrap gap-3">
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(() => approveExpenseByHr(props.claimId, fd));
              }}
            >
              <div className="space-y-1">
                <Label>确认意见</Label>
                <Input name="comment" placeholder="可选" />
              </div>
              <Button type="submit" disabled={pending}>
                确认并提交管理员
              </Button>
            </form>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(() => rejectExpenseByHr(props.claimId, fd));
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
          </div>
        </section>
      ) : null}

      {props.mode === "finance" ? (
        <section className="space-y-3 rounded-md border p-4">
          <h2 className="font-medium">管理员终审打款</h2>
          <p className="text-sm text-muted-foreground">
            确认后将按每张发票归属写入销售成本（挂实际报销人）或项目成本。
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

function ItemRow(props: {
  claimId: string;
  claimKind: ExpenseClaimKind;
  claimProjectId: string | null;
  item: ClaimItemRow;
  editable: boolean;
  isManagerMode: boolean;
  pending: boolean;
  customers: CustomerOption[];
  projects: ProjectOption[];
  feeCategories: ExpenseFeeCategoryView[];
  showProjectColumn: boolean;
  rowGrid: string;
  hotelCapExceeded?: boolean;
  run: (action: () => Promise<ActionResult>) => void;
}) {
  const { item, editable, isManagerMode, pending, run, claimKind, claimProjectId } = props;
  const isTravel = item.kind === "TRAVEL";
  const typeKey = isTravel
    ? item.categoryKey && TRAVEL_FEE_KEY_SET.has(item.categoryKey)
      ? item.categoryKey
      : "TRAVEL"
    : item.categoryKey || item.invoices[0]?.categoryKey || props.feeCategories[0]?.key || "other";
  const style = typeStyle(typeKey);
  const TypeIcon = style.icon;
  const primary = item.invoices[0];
  const hasRealInvoice = item.invoices.some(
    (inv) =>
      !(inv.storageKey ?? "").startsWith("manual://") &&
      !inv.fileName.includes("手填额度") &&
      !inv.fileName.includes("无发票")
  );
  const claimed = primary ? Number(primary.amount ?? 0) : 0;
  const recognized = primary?.ocrAmount != null ? Number(primary.ocrAmount) : null;
  const amountMismatch =
    hasRealInvoice &&
    primary != null &&
    recognized != null &&
    Number.isFinite(recognized) &&
    Math.abs(claimed - recognized) > 0.009;
  const categoryMismatch =
    hasRealInvoice &&
    !!primary?.ocrRawSummary &&
    primary.ocrRawSummary.includes("类别可能不符");
  const mismatch = amountMismatch || categoryMismatch;
  const pathname = usePathname();
  const isMobilePath = pathname.startsWith("/mobile");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [amount, setAmount] = useState(primary ? money(primary.amount) : "0.00");
  const [typeOpen, setTypeOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploadPickerOpen, setUploadPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const typeLabel =
    typeKey === "TRAVEL"
      ? "差旅"
      : props.feeCategories.find((c) => c.key === typeKey)?.label ?? "其他";

  function handleInvoiceFile(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    if (typeKey !== "TRAVEL") fd.set("categoryKey", typeKey);
    run(() => uploadExpenseInvoice(item.id, fd));
  }

  useEffect(() => {
    setAmount(primary ? money(primary.amount) : "0.00");
  }, [primary?.id, primary?.amount]);

  useEffect(() => {
    setNotes(item.notes ?? "");
  }, [item.id, item.notes]);

  function saveMeta(next: {
    notes?: string;
    projectId?: string | null;
    typeKey?: string;
  }) {
    const fd = new FormData();
    const nextNotes = next.notes ?? notes;
    const nextType = next.typeKey ?? typeKey;
    // 细类一律 OTHER + categoryKey；仅遗留「差旅」总类保留 TRAVEL
    const nextKind: ExpenseItemKind = nextType === "TRAVEL" ? "TRAVEL" : "OTHER";
    fd.set("notes", nextNotes);
    fd.set("kind", nextKind);
    fd.set(
      "title",
      nextType === "TRAVEL"
        ? "差旅报销"
        : props.feeCategories.find((c) => c.key === nextType)?.label ?? "其他报销"
    );
    if (nextKind === "OTHER") fd.set("categoryKey", nextType);
    if (claimKind === "PROJECT" && claimProjectId) {
      fd.set("isProjectExpense", "1");
      fd.set("projectId", claimProjectId);
    } else if (props.showProjectColumn) {
      const nextProjectId =
        next.projectId === undefined ? item.projectId : next.projectId;
      if (nextProjectId) {
        fd.set("isProjectExpense", "1");
        fd.set("projectId", nextProjectId);
      } else {
        fd.set("projectId", "");
      }
    } else {
      fd.set("projectId", "");
    }
    run(() => updateExpenseClaimItem(item.id, fd));
  }

  function saveAmount() {
    const fd = new FormData();
    fd.set("amount", amount === "" ? "0" : amount);
    fd.set("categoryKey", typeKey === "TRAVEL" ? "transport" : typeKey);
    run(() => setExpenseItemAmount(item.id, fd));
  }

  const trip = item.trips[0];
  const tripLabel = trip
    ? `${dateInputValue(trip.startDate)}~${dateInputValue(trip.endDate)}${trip.city ? ` · ${trip.city}` : ""}`
    : "填行程";

  const typeOptions: { key: string; label: string }[] =
    claimKind === "TRAVEL" || claimKind === "FEE"
      ? props.feeCategories.map((c) => ({ key: c.key, label: c.label }))
      : props.feeCategories.map((c) => ({ key: c.key, label: c.label }));

  const feeMeta = props.feeCategories.find((c) => c.key === typeKey);
  const isLodgingRow = !!feeMeta?.enforceHotelCap || typeKey === "lodging";
  const notesRequired = !!props.hotelCapExceeded && isLodgingRow && claimed > 0;
  const notesMissing = notesRequired && !notes.trim();

  const mismatchTitle = [
    amountMismatch
      ? `识别金额 ¥${recognized?.toFixed(2)}，填写金额 ¥${claimed.toFixed(2)}`
      : null,
    categoryMismatch ? primary?.ocrRawSummary : null,
  ]
    .filter(Boolean)
    .join("；");

  return (
    <li className="bg-background">
      <div className={`${props.rowGrid} py-1.5`}>
        <div className="min-w-0">
          <Popover open={typeOpen} onOpenChange={setTypeOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!editable || pending}
                className={`flex h-8 w-full min-w-0 items-center gap-1 rounded-md px-2 text-sm font-medium ${style.className}`}
              >
                <TypeIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-center">{typeLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
              align="start"
            >
              {typeOptions.map((opt) => {
                const s = typeStyle(opt.key);
                const Icon = s.icon;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`mb-0.5 flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm last:mb-0 ${s.className}`}
                    onClick={() => {
                      saveMeta({ typeKey: opt.key });
                      setTypeOpen(false);
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 text-center">{opt.label}</span>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </div>

        <div className="min-w-0">
          {editable ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  handleInvoiceFile(file);
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  handleInvoiceFile(file);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 w-full gap-1 px-1.5"
                disabled={pending}
                onClick={() => {
                  if (isMobilePath) {
                    setUploadPickerOpen(true);
                    return;
                  }
                  fileRef.current?.click();
                }}
              >
                <Upload className="h-3.5 w-3.5 shrink-0" />
                上传
              </Button>
              <Dialog open={uploadPickerOpen} onOpenChange={setUploadPickerOpen}>
                <DialogContent className="max-w-xs gap-2 p-4 sm:max-w-xs">
                  <DialogHeader>
                    <DialogTitle>上传发票</DialogTitle>
                  </DialogHeader>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-start gap-3"
                    disabled={pending}
                    onClick={() => {
                      setUploadPickerOpen(false);
                      // 等对话框关闭后再唤起系统选择器，避免被遮挡
                      window.setTimeout(() => cameraRef.current?.click(), 120);
                    }}
                  >
                    <Camera className="h-4 w-4 shrink-0" />
                    拍照
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-start gap-3"
                    disabled={pending}
                    onClick={() => {
                      setUploadPickerOpen(false);
                      window.setTimeout(() => fileRef.current?.click(), 120);
                    }}
                  >
                    <FileUp className="h-4 w-4 shrink-0" />
                    选择文件
                  </Button>
                </DialogContent>
              </Dialog>
            </>
          ) : hasRealInvoice && primary ? (
            <button
              type="button"
              className="h-8 w-full truncate text-left text-xs text-primary hover:underline"
              onClick={() => setInvoiceOpen(true)}
            >
              已传
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">无</span>
          )}
        </div>

        <div className="min-w-0">
          {editable ? (
            <Input
              value={amount}
              disabled={pending}
              inputMode="decimal"
              title={mismatchTitle || undefined}
              className={`h-8 w-full tabular-nums ${mismatch ? "border-amber-400" : ""}`}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                const next = amount === "" ? "0.00" : Number(amount).toFixed(2);
                if (!Number.isFinite(Number(amount)) && amount !== "") return;
                setAmount(Number.isFinite(Number(amount)) ? next : "0.00");
                const prev = primary ? money(primary.amount) : "0.00";
                if (next !== prev) saveAmount();
              }}
            />
          ) : (
            <span
              className={`block truncate text-sm tabular-nums ${mismatch ? "text-amber-700" : ""}`}
              title={mismatchTitle || undefined}
            >
              ¥{money(primary?.amount ?? 0)}
            </span>
          )}
        </div>

        <div className="min-w-0">
          {editable ? (
            <Input
              value={notes}
              disabled={pending}
              placeholder={notesRequired ? "超标原因（必填）" : "备注"}
              title={notesMissing ? "住宿超标时须填写备注原因" : undefined}
              className={`h-8 w-full ${notesMissing ? "border-amber-500" : ""}`}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if ((item.notes ?? "") !== notes) saveMeta({ notes });
              }}
            />
          ) : (
            <p
              className={`truncate text-sm ${notesMissing ? "text-amber-700" : "text-muted-foreground"}`}
              title={item.notes ?? undefined}
            >
              {item.notes || (notesRequired ? "缺超标原因" : "—")}
            </p>
          )}
        </div>

        {props.showProjectColumn ? (
        <div className="min-w-0">
          <Popover open={projectOpen} onOpenChange={setProjectOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!editable || pending}
                className="h-8 w-full truncate rounded-full border px-2 text-xs hover:bg-muted/50 disabled:opacity-70"
                title={item.project?.name ?? "无项目"}
              >
                {item.project?.name ?? "无项目"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="start">
              <button
                type="button"
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  saveMeta({ projectId: null });
                  setProjectOpen(false);
                }}
              >
                无项目
              </button>
              {props.projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    saveMeta({ projectId: p.id });
                    setProjectOpen(false);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        ) : null}

        <div className="flex justify-end gap-1">
          {item.invoices.length > 1 || isManagerMode ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 px-2 text-xs"
              onClick={() => setInvoiceOpen(true)}
            >
              {item.invoices.length > 1 ? `${item.invoices.length}张` : "明细"}
            </Button>
          ) : null}
          {editable ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 px-0 text-destructive"
              disabled={pending}
              onClick={() => setConfirmRemove(true)}
            >
              删
            </Button>
          ) : null}
        </div>
      </div>
      {mismatch && mismatchTitle ? (
        <p className="px-3 pb-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          {mismatchTitle}
        </p>
      ) : null}

      <ConfirmDestructiveDialog
        open={confirmRemove}
        title="确认删除本行"
        message="确定删除这一行报销明细？相关发票也会一并删除。"
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          run(() => removeExpenseClaimItem(item.id));
        }}
      />

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent showCloseButton className="max-w-lg space-y-3 p-5" scrollable>
          <DialogHeader>
            <DialogTitle>发票明细</DialogTitle>
          </DialogHeader>
          {item.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未上传发票</p>
          ) : (
            <ul className="space-y-2">
              {item.invoices.map((inv, idx) => {
                const ocr = inv.ocrAmount != null ? Number(inv.ocrAmount) : null;
                const amt = Number(inv.amount ?? 0);
                const off = ocr != null && Number.isFinite(ocr) && Math.abs(amt - ocr) > 0.009;
                const catOff = !!inv.ocrRawSummary?.includes("类别可能不符");
                const manual = inv.fileName.includes("手填") || inv.fileName.includes("无发票");
                return (
                  <li key={inv.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      {manual ? (
                        <span className="font-medium">{idx + 1}. 手填额度（无发票）</span>
                      ) : (
                        <a
                          href={`/api/expenses/${props.claimId}/invoices/${inv.id}/file?inline=1`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          {idx + 1}. {inv.fileName}
                        </a>
                      )}
                      {editable ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive"
                          disabled={pending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `确定删除发票「${inv.fileName}」？删除后不可恢复。`
                              )
                            ) {
                              return;
                            }
                            run(() => removeExpenseInvoice(inv.id));
                          }}
                        >
                          删除
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      填写 ¥{money(inv.amount)}
                      {off ? ` · 识别 ¥${ocr?.toFixed(2)}` : ""}
                    </p>
                    {catOff ? (
                      <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                        {inv.ocrRawSummary}
                      </p>
                    ) : null}
                    {isManagerMode ? (
                      <form
                        className="mt-2 grid gap-2 rounded-md border border-dashed p-2 md:grid-cols-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          run(() => updateExpenseInvoiceAllocation(inv.id, fd));
                        }}
                      >
                        <p className="md:col-span-2 text-xs font-medium">成本归属（审核必填）</p>
                        <Input
                          name="amount"
                          type="number"
                          step="0.01"
                          defaultValue={money(inv.amount)}
                          className="h-8"
                        />
                        <select
                          name="categoryKey"
                          defaultValue={inv.categoryKey ?? (typeKey === "TRAVEL" ? "transport" : typeKey)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {props.feeCategories.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <select
                          name="costTarget"
                          defaultValue={inv.costTarget ?? ""}
                          required
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">成本归属 *</option>
                          {(Object.keys(EXPENSE_COST_TARGET_LABELS) as Array<
                            keyof typeof EXPENSE_COST_TARGET_LABELS
                          >).map((k) => (
                            <option key={k} value={k}>
                              {EXPENSE_COST_TARGET_LABELS[k]}
                            </option>
                          ))}
                        </select>
                        <select
                          name="salesCostType"
                          defaultValue={inv.salesCostType ?? ""}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">销售成本类型</option>
                          {Object.entries(SALES_COST_TYPE_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <select
                          name="customerId"
                          defaultValue={inv.customerId ?? item.customerId ?? ""}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">客户</option>
                          {props.customers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <select
                          name="projectId"
                          defaultValue={inv.projectId ?? item.projectId ?? ""}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">项目</option>
                          {props.projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <Input
                          name="costCategory"
                          defaultValue={inv.costCategory ?? ""}
                          placeholder="成本类别"
                          className="h-8 md:col-span-2"
                        />
                        <Button type="submit" size="sm" className="md:col-span-2" disabled={pending}>
                          保存归属
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </li>
  );
}

function ClaimTripsSection(props: {
  claimId: string;
  trips: TripRow[];
  editable: boolean;
  pending: boolean;
  cityHotelHints: CityHotelHint[];
  hotelPolicy: EffectiveExpenseTravelPolicy;
  run: (action: () => Promise<ActionResult>) => void;
}) {
  const { trips, editable, pending, run, cityHotelHints, hotelPolicy } = props;
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [drafts, setDrafts] = useState<DraftTrip[]>(() => tripsToDrafts(trips));

  useEffect(() => {
    setDrafts(tripsToDrafts(trips));
    setDirty(false);
  }, [trips]);

  function updateDraft(key: string, patch: Partial<DraftTrip>) {
    setDrafts((prev) => {
      const next = prev.map((row) => (row.key === key ? { ...row, ...patch } : row));
      return sortDraftTrips(next);
    });
    setDirty(true);
  }

  function addDraftRow() {
    const key = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDrafts((prev) => [
      ...prev,
      { key, id: null, startDate: "", endDate: "", fromCity: "", city: "" },
    ]);
    setDirty(true);
  }

  function removeDraftLocal(key: string) {
    setDrafts((prev) => prev.filter((row) => row.key !== key));
    setDirty(true);
  }

  const daySummary = summarizeTripDaysByTier(
    drafts
      .filter((t) => t.startDate && t.endDate && (t.city || t.fromCity))
      .map((t) => ({
        startDate: t.startDate,
        endDate: t.endDate,
        fromCity: t.fromCity,
        city: t.city,
      })),
    cityHotelHints
  );

  const dayLines = (
    [
      ["TIER_1", daySummary.tier1],
      ["TIER_2", daySummary.tier2],
      ["TIER_3", daySummary.tier3],
    ] as const
  ).filter(([, days]) => days > 0);

  const lodgingCap = computeLodgingCapPreview({
    trips: drafts.map((t) => ({
      startDate: t.startDate,
      endDate: t.endDate,
      fromCity: t.fromCity,
      city: t.city,
    })),
    cityHotelHints,
    hotelPolicy,
  });

  const confirmRow = confirmKey
    ? drafts.find((row) => row.key === confirmKey) ?? null
    : null;

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">行程</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            按段填写出发/到达时间与地点；可一次保存全部行程，列表按出发日期排序。
          </p>
        </div>
        {editable ? (
          <Button
            type="button"
            size="sm"
            disabled={pending || !dirty || drafts.length === 0}
            onClick={() => {
              const payload = sortDraftTrips(drafts).map((row) => ({
                id: row.id,
                startDate: row.startDate,
                endDate: row.endDate || row.startDate,
                fromCity: row.fromCity,
                city: row.city,
              }));
              run(() => saveExpenseTrips(props.claimId, payload));
            }}
          >
            保存行程
          </Button>
        ) : null}
      </div>

      {drafts.length === 0 && !editable ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
          未填写行程
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:grid">
            <span>出发日期</span>
            <span>到达日期</span>
            <span>出发地</span>
            <span>到达地点</span>
            <span className="w-14 text-right">操作</span>
          </div>
          <ul className="divide-y">
            {drafts.map((row, idx) => (
              <li key={row.key} className="px-3 py-2.5">
                {editable ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground sm:sr-only">
                        出发日期
                      </Label>
                      <Input
                        type="date"
                        required
                        className="h-9 w-full"
                        value={row.startDate}
                        disabled={pending}
                        onChange={(e) =>
                          updateDraft(row.key, { startDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground sm:sr-only">
                        到达日期
                      </Label>
                      <Input
                        type="date"
                        required
                        className="h-9 w-full"
                        value={row.endDate}
                        disabled={pending}
                        onChange={(e) =>
                          updateDraft(row.key, { endDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground sm:sr-only">
                        出发地
                      </Label>
                      <ProvinceCityPicker
                        name={`fromCity-${row.key}`}
                        required
                        value={row.fromCity}
                        placeholder="选择出发城市"
                        disabled={pending}
                        onValueChange={(city) =>
                          updateDraft(row.key, { fromCity: city })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground sm:sr-only">
                        到达地点
                      </Label>
                      <ProvinceCityPicker
                        name={`city-${row.key}`}
                        required
                        value={row.city}
                        placeholder="选择到达城市"
                        disabled={pending}
                        onValueChange={(city) => updateDraft(row.key, { city })}
                      />
                    </div>
                    <div className="flex justify-end sm:pb-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 text-destructive"
                        disabled={pending}
                        onClick={() => setConfirmKey(row.key)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span className="text-xs text-muted-foreground">第 {idx + 1} 段</span>
                    <span className="tabular-nums">
                      {row.startDate}
                      {row.endDate && row.endDate !== row.startDate
                        ? ` ~ ${row.endDate}`
                        : ""}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      {row.fromCity || "—"}
                      <span className="text-muted-foreground"> → </span>
                      {row.city || "—"}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {editable ? (
            <div className="border-t bg-muted/20 px-3 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={addDraftRow}
              >
                添加一段
              </Button>
              {dirty ? (
                <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                  有未保存的修改
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {daySummary.total > 0 ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
          <p className="text-xs text-muted-foreground">
            出差天数（按住宿晚：昨到与次日出发交叉验证；不一致取较低标准）
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {dayLines.map(([tier, days]) => (
              <span key={tier}>
                {TRIP_TIER_DAY_LABELS[tier]}{" "}
                <span className="font-medium tabular-nums">{days}</span> 天
              </span>
            ))}
            <span className="text-muted-foreground">·</span>
            <span>
              总共 <span className="font-medium tabular-nums">{daySummary.total}</span> 天
            </span>
          </p>
          {lodgingCap ? (
            <p className="mt-2 text-xs text-muted-foreground">
              住宿可报上限{" "}
              <span className="font-medium text-foreground tabular-nums">
                ¥{lodgingCap.maxAllowed.toFixed(0)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                （{lodgingCap.parts.join("；")}）
              </span>
            </p>
          ) : null}
        </div>
      ) : drafts.length === 0 && editable ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          提交前请至少添加一段行程。
        </p>
      ) : null}

      <ConfirmDestructiveDialog
        open={!!confirmRow}
        title="确认删除行程"
        message="确定删除这一段行程？"
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setConfirmKey(null)}
        onConfirm={() => {
          const row = confirmRow;
          setConfirmKey(null);
          if (!row) return;
          if (row.id) {
            run(() => removeExpenseTrip(row.id!));
          } else {
            removeDraftLocal(row.key);
          }
        }}
      />
    </section>
  );
}
