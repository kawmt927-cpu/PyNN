import type { UserRole } from "@prisma/client";
import { listMyTodayCheckIns, checkInStatusLabel } from "@/lib/sales-log/check-in";
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

  const records: TodayWorkRecord[] = [
    ...checkIns.map((row) => ({
      kind: "check_in" as const,
      id: row.id,
      at: row.checkedInAt,
      contactName: row.contact?.name ?? null,
      customerId: row.customer?.id ?? null,
      customerName: row.customer?.name ?? null,
      summary: formatCheckInLocation(row),
      statusLabel: checkInStatusLabel(row),
      needsAction: row.status === "PENDING" && Boolean(row.customerId),
    })),
    ...followUps.map((row) => ({
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
