import type { FollowUpMethod } from "@prisma/client";
import { getPrismaClient } from "@/lib/prisma";

export type OpportunityActivityItem =
  | {
      kind: "stage";
      id: string;
      at: Date;
      user: { name: string };
      fromStage: string | null;
      toStage: string;
      note: string | null;
    }
  | {
      kind: "follow_up";
      id: string;
      at: Date;
      user: { name: string };
      method: FollowUpMethod;
      content: string;
      nextFollowUpAt: Date | null;
      changeSummary: string | null;
    };

function followUpChangeSummary(result: string | null): string | null {
  if (!result?.includes(" → ")) return null;
  return result;
}

export async function getOpportunityActivity(
  opportunityId: string
): Promise<OpportunityActivityItem[]> {
  const db = getPrismaClient();

  const [stageLogs, legacyFollowUps, customerFollowUps] = await Promise.all([
    db.opportunityStageLog.findMany({
      where: { opportunityId },
      include: { user: { select: { name: true } } },
    }),
    db.opportunityFollowUp.findMany({
      where: { opportunityId },
      include: { user: { select: { name: true } } },
    }),
    db.followUp.findMany({
      where: {
        OR: [
          { opportunityId },
          { linkedOpportunities: { some: { opportunityId } } },
        ],
      },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const items: OpportunityActivityItem[] = [
    ...stageLogs.map((log) => ({
      kind: "stage" as const,
      id: log.id,
      at: log.createdAt,
      user: log.user,
      fromStage: log.fromStage,
      toStage: log.toStage,
      note: log.note,
    })),
    ...legacyFollowUps.map((fu) => ({
      kind: "follow_up" as const,
      id: fu.id,
      at: fu.followUpAt,
      user: fu.user,
      method: fu.method,
      content: fu.content,
      nextFollowUpAt: fu.nextFollowUpAt,
      changeSummary: fu.changeSummary,
    })),
    ...customerFollowUps.map((fu) => ({
      kind: "follow_up" as const,
      id: fu.id,
      at: fu.followUpAt,
      user: fu.user,
      method: fu.method,
      content: fu.content,
      nextFollowUpAt: fu.nextFollowUpAt,
      changeSummary: followUpChangeSummary(fu.result),
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
