"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QuickCustomerDialog } from "@/components/sales-log/quick-customer-dialog";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { CustomerTagDefinition } from "@/lib/customers/tags";

type Props = {
  sourceOptions: ConfigOptionItem[];
  typeOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  tagOptions: CustomerTagDefinition[];
  showOwnerSelect?: boolean;
  salesUsers?: Array<{ id: string; name: string }>;
};

export function MobileCreateCustomerButton({
  sourceOptions,
  typeOptions,
  gradeOptions,
  tagOptions,
  showOwnerSelect,
  salesUsers = [],
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        新增
      </Button>
      <QuickCustomerDialog
        open={open}
        onOpenChange={setOpen}
        sourceOptions={sourceOptions}
        typeOptions={typeOptions}
        gradeOptions={gradeOptions}
        tagOptions={tagOptions}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        onCreated={(customer) => {
          router.push(`/mobile/customers/${customer.id}`);
          router.refresh();
        }}
      />
    </>
  );
}
