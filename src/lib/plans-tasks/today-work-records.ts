import type { UserRole } from "@prisma/client";
import {
  listMyTodayCheckIns,
  checkInStatusLabel,
  isEffectiveCheckInRecord,
} from "@/lib/sales-log/check-in";
import { listTodayFollowUps } from "@/lib/sales-log/today-follow-ups";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import { salesLogMethodLabel } from "@/lib/sales-log/methods";

export type TodayWorkRecord =
  | {
      kind: "check_in";
      id: string;
      at: Date;
      contactName: string | null;
      customerId: string | null;
      customerName: string | null;
      summary: string;
      statusLabel: string;
      needsAction: boolean;
      followUp?: {
        id: string;
        summary: string;
        methodLabel: string;
        opportunityTitle: string | null;
      };
    }
  | {
      kind: "follow_up";
      id: string;
      at: Date;
      contactName: string | null;
      customerId: string;
      customerName: string;
      summary: string;
      methodLabel: string;
      opportunityTitle: string | null;
    };

export async function listTodayWorkRecords(
  role: UserRole,
  userId: string
): Promise<TodayWorkRecord[]> {
  const [checkIns, followUps] = await Promise.all([
    listMyTodayCheckIns(userId),
    listTodayFollowUps(role, userId),
  ]);

  const effectiveCheckIns = checkIns.filter(isEffectiveCheckInRecord);
  const linkedFollowUpIds = new Set(
    effectiveCheckIns.map((row) => row.followUpId).filter((id): id is string => Boolean(id))
  );

  const records: TodayWorkRecord[] = [
    ...effectiveCheckIns.map((row) => {
      const linkedFollowUp = row.followUpId
        ? followUps.find((followUp) => followUp.id === row.followUpId)
        : null;

      return {
        kind: "check_in" as const,
        id: row.id,
        at: row.checkedInAt,
        contactName: row.contact?.name ?? null,
        customerId: row.customer?.id ?? null,
        customerName: row.customer?.name ?? null,
        summary: formatCheckInLocation(row),
        statusLabel: checkInStatusLabel(row),
        needsAction: row.status === "PENDING" && Boolean(row.customerId),
        ...(linkedFollowUp
          ? {
              followUp: {
                id: linkedFollowUp.id,
                summary: linkedFollowUp.content,
                methodLabel: salesLogMethodLabel(linkedFollowUp.method),
                opportunityTitle: linkedFollowUp.opportunity?.title ?? null,
              },
            }
          : {}),
      };
    }),
    ...followUps
      .filter((row) => !linkedFollowUpIds.has(row.id))
      .map((row) => ({
        kind: "follow_up" as const,
        id: row.id,
        at: row.followUpAt,
        contactName: row.contact?.name ?? null,
        customerId: row.customer.id,
        customerName: row.customer.name,
        summary: row.content,
        methodLabel: salesLogMethodLabel(row.method),
        opportunityTitle: row.opportunity?.title ?? null,
      })),
  ];

  return records.sort((a, b) => b.at.getTime() - a.at.getTime());
}
