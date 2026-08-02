import type { UserRole } from "@prisma/client";
import { listTodayWorkRecords } from "@/lib/plans-tasks/today-work-records";
import {
  TodayWorkRecordsPanelClient,
  type TodayWorkRecordCard,
} from "@/components/today-work/today-work-records-client";

type Props = {
  role: UserRole;
  userId: string;
  openParam?: string | null;
};

export async function TodayWorkRecordsPanel({ role, userId, openParam }: Props) {
  const records = await listTodayWorkRecords(role, userId);

  const cards: TodayWorkRecordCard[] = records.map((row) => {
    if (row.kind === "check_in") {
      return {
        kind: "check_in",
        id: row.id,
        at: row.at.toISOString(),
        contactName: row.contactName,
        contactNames: row.contactNames,
        customerId: row.customerId,
        customerName: row.customerName,
        summary: row.summary,
        statusLabel: row.statusLabel,
        needsAction: row.needsAction,
        followUpSummary: row.followUp?.summary ?? null,
        followUpId: row.followUp?.id ?? null,
        followUpMethodLabel: row.followUp?.methodLabel ?? null,
        opportunityTitle: row.followUp?.opportunityTitle ?? null,
        nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
        nextFollowUpMethodLabel: row.nextFollowUpMethodLabel,
        nextFollowUpContent: row.nextFollowUpContent,
        methodLabel: row.followUp?.methodLabel ?? null,
      };
    }
    if (row.kind === "daily_log") {
      return {
        kind: "daily_log",
        id: row.id,
        at: row.at.toISOString(),
        contactName: null,
        customerId: null,
        customerName: null,
        summary: row.summary,
        title: row.title,
        statusLabel: row.statusLabel,
        logSubmitted: row.logSubmitted,
        logLate: row.logLate,
        logPendingMakeup: row.logPendingMakeup,
        makeupHref: row.makeupHref,
        detail: row.detail,
      };
    }
    return {
      kind: "follow_up",
      id: row.id,
      at: row.at.toISOString(),
      contactName: row.contactName,
      contactNames: row.contactNames,
      customerId: row.customerId,
      customerName: row.customerName,
      summary: row.summary,
      methodLabel: row.methodLabel,
      opportunityTitle: row.opportunityTitle,
      nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
      nextFollowUpMethodLabel: row.nextFollowUpMethodLabel,
      nextFollowUpContent: row.nextFollowUpContent,
    };
  });

  return <TodayWorkRecordsPanelClient records={cards} openParam={openParam} />;
}
