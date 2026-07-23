"use client";

import { useState } from "react";
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

export function CreateWeeklyAssignmentDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">新建指派任务</Button>
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
            为销售指派跟进任务，创建后同步生成客户计划跟进，并显示在任务列表中。
          </DialogDescription>
        </DialogHeader>
        <WeeklyAssignmentForm
          formClassName="grid gap-4"
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
