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
import { saveAnnualTarget } from "@/app/(dashboard)/plans-tasks/actions";
import type { SalesMetrics } from "@/lib/plans-tasks/metrics";

type SalesUser = { id: string; name: string };

export function AnnualTargetSettingsDialog({
  year,
  defaultPersonUserId,
  salesUsers,
  personTargetsByUserId,
}: {
  year: number;
  defaultPersonUserId: string;
  salesUsers: SalesUser[];
  personTargetsByUserId: Record<string, SalesMetrics | null>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [personUserId, setPersonUserId] = useState(defaultPersonUserId);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activePersonTarget = personTargetsByUserId[personUserId] ?? null;

  function submitPerson(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("userId", personUserId);
    formData.set("year", String(year));
    startTransition(async () => {
      const result = await saveAnnualTarget(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("个人年度目标已保存");
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{year} 年度考核目标</DialogTitle>
          <DialogDescription>
            按销售分别设定年度目标；团队汇总视图的目标为各人目标累加。成本为 KPI 看板，不设考核目标。
          </DialogDescription>
        </DialogHeader>

        <form key={personUserId} onSubmit={submitPerson} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="person-select">选择销售</Label>
            <select
              id="person-select"
              value={personUserId}
              onChange={(e) => setPersonUserId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {salesUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="person-sales">销售额目标</Label>
              <Input
                id="person-sales"
                name="salesTarget"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={activePersonTarget?.sales ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-profit">毛利目标</Label>
              <Input
                id="person-profit"
                name="profitTarget"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={activePersonTarget?.profit ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-payment">回款目标</Label>
              <Input
                id="person-payment"
                name="paymentTarget"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={activePersonTarget?.payment ?? ""}
              />
            </div>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "保存中…" : "保存个人目标"}
          </Button>
        </form>

        {message ? <p className="text-sm text-green-600 dark:text-green-400">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
