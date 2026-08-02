import { prisma } from "@/lib/prisma";

export type OpportunityVisitSummary = {
  lastVisitAt: Date | null;
  lastVisitContent: string | null;
  nextVisitAt: Date | null;
  /** 下次计划内容（往来里填写的 nextFollowUpContent） */
  nextVisitContent: string | null;
};

function emptySummary(): OpportunityVisitSummary {
  return {
    lastVisitAt: null,
    lastVisitContent: null,
    nextVisitAt: null,
    nextVisitContent: null,
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

export async function getOpportunityVisitSummaries(
  opportunityIds: string[]
): Promise<Map<string, OpportunityVisitSummary>> {
  const map = new Map<string, OpportunityVisitSummary>();
  if (opportunityIds.length === 0) return map;

  for (const id of opportunityIds) {
    map.set(id, emptySummary());
  }

  const followUps = await prisma.followUp.findMany({
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
  });

  const now = new Date();

  for (const followUp of followUps) {
    for (const opportunityId of resolveLinkedOpportunityIds(followUp)) {
      const summary = map.get(opportunityId);
      if (!summary) continue;

      if (!summary.lastVisitAt || followUp.followUpAt > summary.lastVisitAt) {
        summary.lastVisitAt = followUp.followUpAt;
        summary.lastVisitContent = followUp.content;
      }

      if (
        followUp.nextFollowUpAt &&
        shouldPreferNextVisit(summary.nextVisitAt, followUp.nextFollowUpAt, now)
      ) {
        summary.nextVisitAt = followUp.nextFollowUpAt;
        summary.nextVisitContent = followUp.nextFollowUpContent?.trim() || null;
      }
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
