import { format } from "date-fns";
import {
  EXPENSE_CLAIM_KIND_LABELS,
  expenseClaimChipStatus,
} from "@/lib/expenses/labels";
import { DEFAULT_EXPENSE_FEE_CATEGORIES } from "@/lib/expenses/fee-categories";
import type { ExpenseClaimListRow } from "@/components/expenses/expense-claim-list";

const FEE_LABEL_BY_KEY = new Map(
  DEFAULT_EXPENSE_FEE_CATEGORIES.map((c) => [c.key, c.label])
);

type TripLike = {
  fromCity: string | null;
  city: string | null;
  startDate: Date;
  endDate: Date;
};

type ItemLike = {
  categoryKey: string | null;
  title: string | null;
};

type ClaimLike = {
  id: string;
  title: string;
  claimKind: string;
  status: string;
  totalAmount: unknown;
  updatedAt: Date;
  rejectReason: string | null;
  applicantId: string;
  trips?: TripLike[];
  items?: ItemLike[];
};

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const t = v?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function formatExpensePlaces(
  trips: Array<{ fromCity: string | null; city: string | null }> | undefined
): string | null {
  if (!trips?.length) return null;
  const cities = uniqueNonEmpty(
    trips.flatMap((t) => [t.fromCity, t.city])
  );
  if (cities.length === 0) return null;
  return cities.join("·");
}

export function formatExpenseTimeRange(
  trips: TripLike[] | undefined
): string | null {
  if (!trips?.length) return null;
  let min = trips[0]!.startDate;
  let max = trips[0]!.endDate;
  for (const t of trips) {
    if (t.startDate < min) min = t.startDate;
    if (t.endDate > max) max = t.endDate;
  }
  return `${format(min, "MM-dd")} ~ ${format(max, "MM-dd")}`;
}

export function formatExpenseKindSubLabel(
  claimKind: string,
  items: ItemLike[] | undefined
): string | null {
  if (!items?.length) {
    if (claimKind === "TRAVEL") return "行程未填写完成";
    return null;
  }
  const labels = uniqueNonEmpty(
    items.map((it) => {
      if (it.categoryKey) {
        const label = FEE_LABEL_BY_KEY.get(it.categoryKey);
        if (label) return label;
      }
      return it.title;
    })
  );
  if (labels.length === 0) return null;
  return labels.slice(0, 4).join(" · ");
}

export function toExpenseMineListRow(
  claim: ClaimLike,
  userId: string
): ExpenseClaimListRow {
  const chip = expenseClaimChipStatus(claim.status);
  return {
    id: claim.id,
    title: claim.title,
    kindLabel: EXPENSE_CLAIM_KIND_LABELS[claim.claimKind] ?? claim.claimKind,
    kindSubLabel: formatExpenseKindSubLabel(claim.claimKind, claim.items),
    amountLabel: `¥${Number(claim.totalAmount).toFixed(2)}`,
    statusLabel: chip.label,
    statusChip: chip.chip,
    placesLabel: formatExpensePlaces(claim.trips),
    timeRangeLabel: formatExpenseTimeRange(claim.trips),
    at: claim.updatedAt,
    rejectReason:
      claim.status === "REJECTED" ? claim.rejectReason?.trim() || null : null,
    canDelete:
      claim.applicantId === userId &&
      (claim.status === "DRAFT" || claim.status === "REJECTED"),
  };
}
