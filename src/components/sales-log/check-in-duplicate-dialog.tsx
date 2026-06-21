"use client";

import { format } from "date-fns";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type TodayCustomerCheckInItem = {
  id: string;
  checkedInAt: string;
  status: string;
  customerName: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  items: TodayCustomerCheckInItem[];
  onModify: (checkInId: string) => void;
  onCreateNew: () => void;
  pending?: boolean;
};

function statusLabel(status: string) {
  return status === "PENDING" ? "待完善" : "已完善";
}

export function CheckInDuplicateDialog({
  open,
  onOpenChange,
  customerName,
  items,
  onModify,
  onCreateNew,
  pending,
}: Props) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    if (open && items[0]) {
      setSelectedId(items[0].id);
    }
  }, [open, items]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>今日已打卡</DialogTitle>
          <DialogDescription>
            客户「{customerName}」今日已有 {items.length} 条打卡记录。请选择修改原记录，或仍新增一条。
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 rounded-md border p-3 text-sm">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="duplicateCheckIn"
                  value={item.id}
                  checked={selectedId === item.id}
                  onChange={() => setSelectedId(item.id)}
                  className="h-4 w-4"
                />
                <span>
                  {format(new Date(item.checkedInAt), "HH:mm")} · {statusLabel(item.status)}
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onCreateNew}>
            新增一条
          </Button>
          <Button
            type="button"
            disabled={pending || !selectedId}
            onClick={() => onModify(selectedId)}
          >
            {pending ? "提交中…" : "修改原记录"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
