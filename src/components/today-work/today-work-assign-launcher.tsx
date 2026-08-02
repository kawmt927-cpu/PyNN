"use client";

import { CreateWeeklyAssignmentDialog } from "@/components/plans-tasks/create-weekly-assignment-dialog";

type Props = {
  salesUsers: Array<{ id: string; name: string }>;
  customerId?: string;
  customerName?: string;
  opportunityId?: string;
  opportunityTitle?: string;
};

export function TodayWorkAssignLauncher({
  salesUsers,
  customerId,
  customerName,
  opportunityId,
  opportunityTitle,
}: Props) {
  return (
    <CreateWeeklyAssignmentDialog
      salesUsers={salesUsers}
      defaultOpen
      initialCustomerId={customerId}
      initialCustomerLabel={customerName}
      initialOpportunityId={opportunityId}
      initialOpportunityLabel={opportunityTitle}
    />
  );
}
