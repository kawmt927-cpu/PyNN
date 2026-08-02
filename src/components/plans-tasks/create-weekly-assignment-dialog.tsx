"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WeeklyAssignmentForm } from "@/components/today-work/weekly-assignment-form";

type SalesUser = { id: string; name: string };

export function CreateWeeklyAssignmentDialog({
  salesUsers = [],
  defaultOpen = false,
  trigger,
  initialCustomerId,
  initialCustomerLabel,
  initialOpportunityId,
  initialOpportunityLabel,
  initialAssigneeId,
  initialTitle,
  initialDescription,
}: {
  salesUsers?: SalesUser[];
  defaultOpen?: boolean;
  /** 自定义触发按钮；不传则显示默认「新建指派任务」 */
  trigger?: ReactNode;
  initialCustomerId?: string;
  initialCustomerLabel?: string;
  initialOpportunityId?: string;
  initialOpportunityLabel?: string;
  initialAssigneeId?: string;
  initialTitle?: string;
  initialDescription?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button type="button">新建指派任务</Button>}
      </DialogTrigger>
      <DialogContent
        showCloseButton
        scrollable
        className="max-w-lg"
        closeOnOutsideClick={false}
      >
        <DialogHeader className="mb-4">
          <DialogTitle>新建指派任务</DialogTitle>
          <DialogDescription>
            可创建客户跟进任务，或无需客户的普通任务。普通任务由被指派人完成后，再由指派人确认。
          </DialogDescription>
        </DialogHeader>
        <WeeklyAssignmentForm
          formClassName="grid gap-4"
          salesUsers={salesUsers}
          initialCustomerId={initialCustomerId}
          initialCustomerLabel={initialCustomerLabel}
          initialOpportunityId={initialOpportunityId}
          initialOpportunityLabel={initialOpportunityLabel}
          initialAssigneeId={initialAssigneeId}
          initialTitle={initialTitle}
          initialDescription={initialDescription}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
