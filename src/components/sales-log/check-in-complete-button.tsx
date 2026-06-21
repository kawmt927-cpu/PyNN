"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckInCompleteDialog } from "@/components/sales-log/check-in-complete-dialog";
import type { ConfigOptionItem } from "@/lib/config-options";

type Props = {
  checkInId: string;
  customerId: string;
  customerName: string;
  contactId?: string | null;
  locationLabel: string;
  stageOptions: ConfigOptionItem[];
};

export function CheckInCompleteButton({
  checkInId,
  customerId,
  customerName,
  contactId,
  locationLabel,
  stageOptions,
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
        defaultContactId={contactId ?? ""}
        defaultLocation={locationLabel}
        stageOptions={stageOptions}
      />
    </>
  );
}
