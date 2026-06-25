"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PendingFollowPlanItem } from "@/components/customers/pending-follow-plan-item";
import { pendingPlanSelectionKey } from "@/lib/follow-ups/unified";
import type { SerializedCustomerPendingFollowPlan } from "@/lib/follow-ups/unified";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SerializedCustomerPendingFollowPlan[];
  selectedKeys: string[];
  onSelectedKeysChange: (keys: string[]) => void;
  onConfirm: () => void;
  pending?: boolean;
};

export function planSelectionKey(item: SerializedCustomerPendingFollowPlan) {
  return pendingPlanSelectionKey(item.source, item.id);
}

export function CompletePendingFollowUpDialog({
  open,
  onOpenChange,
  items,
  selectedKeys,
  onSelectedKeysChange,
  onConfirm,
  pending,
}: Props) {
  function toggleKey(key: string) {
    if (selectedKeys.includes(key)) {
      onSelectedKeysChange(selectedKeys.filter((item) => item !== key));
      return;
    }
    onSelectedKeysChange([...selectedKeys, key]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>选择要完成的待跟进计划</DialogTitle>
          <DialogDescription>
            该客户仍有 {items.length} 条待跟进计划，请选择本次跟进对应完成的一条或多条。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(60vh,28rem)] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const key = planSelectionKey(item);
            return (
              <PendingFollowPlanItem
                key={key}
                item={item}
                selectable
                multiple
                selected={selectedKeys.includes(key)}
                onSelect={() => toggleKey(key)}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">已选 {selectedKeys.length} 条</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              返回修改
            </Button>
            <Button type="button" onClick={onConfirm} disabled={pending || selectedKeys.length === 0}>
              {pending ? "保存中…" : "确认并完成"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
