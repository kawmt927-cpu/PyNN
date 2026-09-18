"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import { QuickOpportunityDialog } from "@/components/sales-log/quick-opportunity-dialog";
import type { ConfigOptionItem } from "@/lib/config-options";

type Props = {
  stageOptions: ConfigOptionItem[];
  /** 已选定客户时可跳过选客步骤 */
  initialCustomerId?: string;
  initialCustomerName?: string;
  buttonLabel?: string;
  className?: string;
};

export function MobileCreateOpportunityButton({
  stageOptions,
  initialCustomerId,
  initialCustomerName,
  buttonLabel = "新增",
  className,
}: Props) {
  const router = useRouter();
  const preselected = Boolean(initialCustomerId && initialCustomerName);
  const [pickOpen, setPickOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [customerId, setCustomerId] = useState(initialCustomerId ?? "");
  const [customerName, setCustomerName] = useState(initialCustomerName ?? "");

  function resetPick() {
    if (preselected) {
      setCustomerId(initialCustomerId ?? "");
      setCustomerName(initialCustomerName ?? "");
      return;
    }
    setCustomerId("");
    setCustomerName("");
  }

  function openFlow() {
    if (preselected) {
      setCustomerId(initialCustomerId!);
      setCustomerName(initialCustomerName!);
      setOppOpen(true);
      return;
    }
    setPickOpen(true);
  }

  return (
    <>
      <Button type="button" size="sm" className={className} onClick={openFlow}>
        {buttonLabel}
      </Button>

      <Dialog
        open={pickOpen}
        onOpenChange={(open) => {
          setPickOpen(open);
          if (!open) resetPick();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建商机</DialogTitle>
            <DialogDescription>先选择销售对象客户，再填写商机信息。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <CustomerSearchSelect
              id="mobile-new-opp-customer"
              name="customerId"
              label="客户"
              required
              writableOnly
              value={customerId}
              selectedLabel={customerName}
              onValueChange={(id, option) => {
                setCustomerId(id);
                setCustomerName(option?.label ?? "");
              }}
              placeholder="搜索客户名称…"
            />
            <Button
              type="button"
              className="w-full"
              disabled={!customerId}
              onClick={() => {
                setPickOpen(false);
                setOppOpen(true);
              }}
            >
              下一步
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {customerId ? (
        <QuickOpportunityDialog
          open={oppOpen}
          onOpenChange={(open) => {
            setOppOpen(open);
            if (!open) resetPick();
          }}
          customerId={customerId}
          customerName={customerName}
          stageOptions={stageOptions}
          onCreated={(opp) => {
            router.push(`/mobile/opportunities/${opp.id}`);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
