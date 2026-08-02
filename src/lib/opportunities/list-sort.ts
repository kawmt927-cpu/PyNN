import { getOpportunityGradeStarCount } from "@/lib/opportunities/grade";
import type { OpportunityListSort } from "@/lib/opportunities/list-filters";
import type { OpportunityVisitSummary } from "@/lib/opportunities/visit-summary";

type SortableOpportunity = {
  id: string;
  stage: string;
  grade: string | null;
  expectedAmount: { toString(): string } | number;
};

function compareNullableNumber(a: number | null, b: number | null, dir: "asc" | "desc") {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const cmp = a - b;
  return dir === "asc" ? cmp : -cmp;
}

function compareNullableDate(
  a: Date | null | undefined,
  b: Date | null | undefined,
  dir: "asc" | "desc"
) {
  return compareNullableNumber(
    a ? a.getTime() : null,
    b ? b.getTime() : null,
    dir
  );
}

export function sortOpportunitiesWithVisits<T extends SortableOpportunity>(
  rows: T[],
  sort: OpportunityListSort,
  visitSummaries: Map<string, OpportunityVisitSummary>,
  stageOrder: Record<string, number>
): T[] {
  if (!sort.column) return rows;

  const dir = sort.dir;
  const sorted = [...rows];

  sorted.sort((left, right) => {
    switch (sort.column) {
      case "grade": {
        const leftStars = getOpportunityGradeStarCount(left.grade ?? "P3");
        const rightStars = getOpportunityGradeStarCount(right.grade ?? "P3");
        return compareNullableNumber(leftStars, rightStars, dir);
      }
      case "amount": {
        return compareNullableNumber(
          Number(left.expectedAmount),
          Number(right.expectedAmount),
          dir
        );
      }
      case "stage": {
        const leftOrder = stageOrder[left.stage] ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = stageOrder[right.stage] ?? Number.MAX_SAFE_INTEGER;
        return compareNullableNumber(leftOrder, rightOrder, dir);
      }
      case "lastVisit": {
        return compareNullableDate(
          visitSummaries.get(left.id)?.lastVisitAt,
          visitSummaries.get(right.id)?.lastVisitAt,
          dir
        );
      }
      case "nextVisit": {
        return compareNullableDate(
          visitSummaries.get(left.id)?.nextVisitAt,
          visitSummaries.get(right.id)?.nextVisitAt,
          dir
        );
      }
      default:
        return 0;
    }
  });

  return sorted;
}
