"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckInCompleteDialog } from "@/components/sales-log/check-in-complete-dialog";
import type { ConfigOptionItem } from "@/lib/config-options";

type Props = {
  checkInId: string;
  customerId: string;
  customerName: string;
  customerType?: string | null;
  currentCustomerGrade?: string | null;
  contactId?: string | null;
  stageOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  channelGradeOptions?: ConfigOptionItem[];
  typeOptions?: ConfigOptionItem[];
};

export function CheckInCompleteButton({
  checkInId,
  customerId,
  customerName,
  customerType,
  currentCustomerGrade,
  contactId,
  stageOptions,
  gradeOptions,
  channelGradeOptions = [],
  typeOptions = [],
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={() => setOpen(true)}>
        完善
      </Button>
      <CheckInCompleteDialog
        open={open}
        onOpenChange={setOpen}
        checkInId={checkInId}
        customerId={customerId}
        customerName={customerName}
        customerType={customerType}
        currentCustomerGrade={currentCustomerGrade}
        defaultContactIds={contactId ? [contactId] : []}
        stageOptions={stageOptions}
        gradeOptions={gradeOptions}
        channelGradeOptions={channelGradeOptions}
        typeOptions={typeOptions}
      />
    </>
  );
}
