"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMonthlyKpiTargets } from "@/app/(dashboard)/plans-tasks/actions";
import type { MonthlyKpiTargets } from "@/lib/plans-tasks/monthly-kpi";

type SalesUser = { id: string; name: string };

export function MonthlyKpiTargetSettingsDialog({
  year,
  month,
  defaultUserId,
  salesUsers,
  targetsByUserId,
}: {
  year: number;
  month: number;
  defaultUserId: string;
  salesUsers: SalesUser[];
  targetsByUserId: Record<string, MonthlyKpiTargets | null>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(defaultUserId);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targets = targetsByUserId[userId] ?? null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("userId", userId);
    formData.set("year", String(year));
    formData.set("month", String(month));
    startTransition(async () => {
      const result = await saveMonthlyKpiTargets(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("月度 KPI 目标已保存");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          设置目标
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {year} 年 {month} 月 KPI 目标
          </DialogTitle>
          <DialogDescription>
            每位销售单独设定月度 KPI 目标；项目开发达标规则请在系统配置 → KPI 设置中维护。
          </DialogDescription>
        </DialogHeader>

        <form key={userId} onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kpi-person">选择销售</Label>
            <select
              id="kpi-person"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {salesUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="channelDevTarget">渠道开发（个）</Label>
              <Input
                id="channelDevTarget"
                name="channelDevTarget"
                type="number"
                min={0}
                step={1}
                defaultValue={targets?.channelDev ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectDevTarget">项目开发（个）</Label>
              <Input
                id="projectDevTarget"
                name="projectDevTarget"
                type="number"
                min={0}
                step={1}
                defaultValue={targets?.projectDev ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentCollectionTarget">回款催收（元）</Label>
              <Input
                id="paymentCollectionTarget"
                name="paymentCollectionTarget"
                type="number"
                min={0}
                step="0.01"
                defaultValue={targets?.paymentCollection ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenanceTarget">维护与赋能（个）</Label>
              <Input
                id="maintenanceTarget"
                name="maintenanceTarget"
                type="number"
                min={0}
                step={1}
                defaultValue={targets?.maintenance ?? ""}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            过程规范与日报暂不设定目标，仅记录迟交/漏交次数。
          </p>

          <Button type="submit" disabled={pending}>
            {pending ? "保存中…" : "保存 KPI 目标"}
          </Button>
        </form>

        {message ? <p className="text-sm text-green-600 dark:text-green-400">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
