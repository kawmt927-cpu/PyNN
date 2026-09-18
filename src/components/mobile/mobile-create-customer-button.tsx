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
  channelKindOptions?: ConfigOptionItem[];
  tagOptions: CustomerTagDefinition[];
  showOwnerSelect?: boolean;
  salesUsers?: Array<{ id: string; name: string }>;
  /** 销管/管理员可在快捷建档时勾选全国性渠道 */
  canEditNationwideChannel?: boolean;
};

export function MobileCreateCustomerButton({
  sourceOptions,
  typeOptions,
  gradeOptions,
  channelKindOptions = [],
  tagOptions,
  showOwnerSelect,
  salesUsers = [],
  canEditNationwideChannel = false,
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
        channelKindOptions={channelKindOptions}
        tagOptions={tagOptions}
        showOwnerSelect={showOwnerSelect}
        salesUsers={salesUsers}
        canEditNationwideChannel={canEditNationwideChannel}
        onCreated={(customer) => {
          router.push(`/mobile/customers/${customer.id}`);
          router.refresh();
        }}
      />
    </>
  );
}
