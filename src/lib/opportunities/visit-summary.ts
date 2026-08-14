import { prisma } from "@/lib/prisma";
import { computeGradeFollowUpDueAt } from "@/lib/customers/grade-intervals";
import {
  getOpportunityGradeIntervalMap,
  resolveOpportunityGradeIntervalDays,
} from "@/lib/opportunities/grade-intervals";

export type OpportunityVisitSummary = {
  lastVisitAt: Date | null;
  lastVisitContent: string | null;
  nextVisitAt: Date | null;
  /** 下次计划内容（往来里填写的 nextFollowUpContent） */
  nextVisitContent: string | null;
  /** nextVisitAt 是否来自商机等级往来周期（未指定计划，或等级截止更早） */
  nextVisitFromGrade: boolean;
};

export type OpportunityVisitInput = {
  id: string;
  grade: string | null;
  createdAt: Date;
};

function emptySummary(): OpportunityVisitSummary {
  return {
    lastVisitAt: null,
    lastVisitContent: null,
    nextVisitAt: null,
    nextVisitContent: null,
    nextVisitFromGrade: false,
  };
}

function resolveLinkedOpportunityIds(followUp: {
  opportunityId: string | null;
  linkedOpportunities: Array<{ opportunityId: string }>;
}): string[] {
  const ids = new Set<string>();
  if (followUp.opportunityId) ids.add(followUp.opportunityId);
  for (const link of followUp.linkedOpportunities) {
    ids.add(link.opportunityId);
  }
  return [...ids];
}

function shouldPreferNextVisit(
  current: Date | null,
  candidate: Date,
  now: Date
): boolean {
  if (!current) return true;
  const currentFuture = current >= now;
  const candidateFuture = candidate >= now;
  if (candidateFuture && !currentFuture) return true;
  if (!candidateFuture && currentFuture) return false;
  if (candidateFuture && currentFuture) {
    return candidate < current;
  }
  return candidate > current;
}

function applyPlannedNextVisit(
  summary: OpportunityVisitSummary,
  nextAt: Date,
  nextContent: string | null | undefined,
  now: Date
) {
  if (!shouldPreferNextVisit(summary.nextVisitAt, nextAt, now)) return;
  summary.nextVisitAt = nextAt;
  summary.nextVisitContent = nextContent?.trim() || null;
  summary.nextVisitFromGrade = false;
}

/**
 * 汇总商机上次/下次拜访。
 * 下次拜访 = min(往来中指定的下次时间, 星级周期截止)；无指定时用星级周期。
 * 星级截止 = (上次拜访 || 商机创建日) + 等级往来间隔。
 */
export async function getOpportunityVisitSummaries(
  opportunities: OpportunityVisitInput[]
): Promise<Map<string, OpportunityVisitSummary>> {
  const map = new Map<string, OpportunityVisitSummary>();
  if (opportunities.length === 0) return map;

  const opportunityIds = opportunities.map((o) => o.id);
  for (const opp of opportunities) {
    map.set(opp.id, emptySummary());
  }

  const [followUps, opportunityFollowUps, intervalMap] = await Promise.all([
    prisma.followUp.findMany({
      where: {
        OR: [
          { opportunityId: { in: opportunityIds } },
          { linkedOpportunities: { some: { opportunityId: { in: opportunityIds } } } },
        ],
      },
      select: {
        opportunityId: true,
        followUpAt: true,
        nextFollowUpAt: true,
        content: true,
        nextFollowUpContent: true,
        linkedOpportunities: { select: { opportunityId: true } },
      },
    }),
    prisma.opportunityFollowUp.findMany({
      where: { opportunityId: { in: opportunityIds } },
      select: {
        opportunityId: true,
        followUpAt: true,
        nextFollowUpAt: true,
        content: true,
        nextFollowUpContent: true,
      },
    }),
    getOpportunityGradeIntervalMap(),
  ]);

  const now = new Date();

  for (const followUp of followUps) {
    for (const opportunityId of resolveLinkedOpportunityIds(followUp)) {
      const summary = map.get(opportunityId);
      if (!summary) continue;

      if (!summary.lastVisitAt || followUp.followUpAt > summary.lastVisitAt) {
        summary.lastVisitAt = followUp.followUpAt;
        summary.lastVisitContent = followUp.content;
      }

      if (followUp.nextFollowUpAt) {
        applyPlannedNextVisit(
          summary,
          followUp.nextFollowUpAt,
          followUp.nextFollowUpContent,
          now
        );
      }
    }
  }

  for (const followUp of opportunityFollowUps) {
    const summary = map.get(followUp.opportunityId);
    if (!summary) continue;

    if (!summary.lastVisitAt || followUp.followUpAt > summary.lastVisitAt) {
      summary.lastVisitAt = followUp.followUpAt;
      summary.lastVisitContent = followUp.content;
    }

    if (followUp.nextFollowUpAt) {
      applyPlannedNextVisit(
        summary,
        followUp.nextFollowUpAt,
        followUp.nextFollowUpContent,
        now
      );
    }
  }

  for (const opp of opportunities) {
    const summary = map.get(opp.id);
    if (!summary) continue;

    const intervalDays = resolveOpportunityGradeIntervalDays(opp.grade, intervalMap);
    if (!intervalDays) continue;

    const baseAt = summary.lastVisitAt ?? opp.createdAt;
    const gradeDueAt = computeGradeFollowUpDueAt(baseAt, intervalDays);
    const plannedAt = summary.nextVisitFromGrade ? null : summary.nextVisitAt;

    if (!plannedAt || gradeDueAt.getTime() < plannedAt.getTime()) {
      summary.nextVisitAt = gradeDueAt;
      summary.nextVisitContent = null;
      summary.nextVisitFromGrade = true;
    }
  }

  return map;
}

export async function listOpportunityRecentFollowUps(opportunityId: string, take = 8) {
  return prisma.followUp.findMany({
    where: {
      OR: [
        { opportunityId },
        { linkedOpportunities: { some: { opportunityId } } },
      ],
    },
    orderBy: { followUpAt: "desc" },
    take,
    include: {
      user: { select: { name: true } },
    },
  });
}
