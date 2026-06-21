"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConfigOptionItem } from "@/lib/config-options";
import { toExpectedCloseMonthInput } from "@/lib/opportunities/expected-close-date";

function withEmptyOption(options: ConfigOptionItem[]) {
  return [{ value: "", label: "请选择" }, ...options];
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  stageOptions: ConfigOptionItem[];
  initialTitle?: string;
  onCreated: (opportunity: { id: string; title: string }) => void;
};

export function QuickOpportunityDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  stageOptions,
  initialTitle = "",
  onCreated,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [stage, setStage] = useState("");
  const [expectedAmount, setExpectedAmount] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState(toExpectedCloseMonthInput(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setStage("");
    setExpectedAmount("");
    setExpectedCloseDate(toExpectedCloseMonthInput(new Date()));
    setError(null);
  }, [open, initialTitle]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/opportunities/quick-create", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId,
            title,
            stage,
            expectedAmount: Number(expectedAmount),
            expectedCloseDate,
          }),
        });
        const data = (await res.json()) as { id?: string; title?: string; error?: string };
        if (!res.ok || !data.id || !data.title) {
          setError(data.error || "创建商机失败");
          return;
        }
        onCreated({ id: data.id, title: data.title });
        onOpenChange(false);
      } catch {
        setError("创建商机失败，请稍后重试");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新建商机</DialogTitle>
          <DialogDescription>
            为客户「{customerName}」创建商机，保存后将自动关联到本次往来。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quickOppTitle">商机名称 *</Label>
            <Input id="quickOppTitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <SelectField
            id="quickOppStage"
            label="商机阶段 *"
            name="stage"
            options={withEmptyOption(stageOptions)}
            value={stage}
            onValueChange={setStage}
            required
          />
          <div className="space-y-2">
            <Label htmlFor="quickOppAmount">预计金额（元）*</Label>
            <Input
              id="quickOppAmount"
              type="number"
              min={1}
              value={expectedAmount}
              onChange={(e) => setExpectedAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quickOppClose">预计签约月份 *</Label>
            <Input
              id="quickOppClose"
              type="month"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending || !title.trim() || !stage || !expectedAmount}>
              {pending ? "创建中…" : "创建并关联"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
