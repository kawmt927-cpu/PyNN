"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveAnnualTarget } from "@/app/(dashboard)/plans-tasks/actions";
import type { TargetMetricsBundle } from "@/lib/plans-tasks/metrics";

type SalesUser = { id: string; name: string };

export function TargetSettingsPanel({
  userId,
  year,
  metrics,
  salesUsers,
}: {
  userId: string;
  year: number;
  metrics: TargetMetricsBundle;
  salesUsers: SalesUser[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onUserChange(nextUserId: string) {
    const params = new URLSearchParams(window.location.search);
    params.set("userId", nextUserId);
    params.set("tab", "dashboard");
    router.replace(`/plans-tasks?${params.toString()}`);
  }

  function submitAnnual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("userId", userId);
    formData.set("year", String(year));
    startTransition(async () => {
      await saveAnnualTarget(formData);
      router.refresh();
    });
  }

  const annual = metrics.annual.target;

  return (
    <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
      <CardHeader>
        <CardTitle className="text-lg">年度指标设置（销售管理）</CardTitle>
        <p className="text-sm text-muted-foreground">为销售设定年度销售额、成本、毛利、回款目标。月度 KPI 请在下方单独设置。</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="target-user">选择销售</Label>
          <select
            id="target-user"
            value={userId}
            onChange={(e) => onUserChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {salesUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={submitAnnual} className="grid gap-4 md:grid-cols-5">
          <p className="md:col-span-5 text-sm font-medium">{year} 年度目标</p>
          <div className="space-y-2">
            <Label htmlFor="annual-sales">销售额目标</Label>
            <Input
              id="annual-sales"
              name="salesTarget"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={annual?.sales ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="annual-cost">成本目标</Label>
            <Input
              id="annual-cost"
              name="costTarget"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={annual?.cost ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="annual-profit">毛利目标</Label>
            <Input
              id="annual-profit"
              name="profitTarget"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={annual?.profit ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="annual-payment">回款目标</Label>
            <Input
              id="annual-payment"
              name="paymentTarget"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={annual?.payment ?? ""}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              保存年度
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
