"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveKpiConfig, saveMonthlyKpiTargets } from "@/app/(dashboard)/plans-tasks/actions";
import type { MonthlyKpiBundle } from "@/lib/plans-tasks/monthly-kpi";

type StageOption = { value: string; label: string };

export function MonthlyKpiSettingsPanel({
  userId,
  year,
  month,
  kpi,
  stageOptions,
  projectDevMinStageValue,
}: {
  userId: string;
  year: number;
  month: number;
  kpi: MonthlyKpiBundle;
  stageOptions: StageOption[];
  projectDevMinStageValue: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const targets = kpi.targets;

  function submitKpiTargets(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("userId", userId);
    formData.set("year", String(year));
    formData.set("month", String(month));
    startTransition(async () => {
      await saveMonthlyKpiTargets(formData);
      router.refresh();
    });
  }

  function submitKpiConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await saveKpiConfig(formData);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 rounded-lg border border-dashed p-4">
      <div>
        <p className="text-sm font-medium">月度 KPI 目标</p>
        <p className="text-xs text-muted-foreground">
          {year} 年 {month} 月 · 过程规范与日报暂不设定目标，仅记录迟交/漏交次数
        </p>
      </div>

      <form onSubmit={submitKpiConfig} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] space-y-2">
          <Label htmlFor="projectDevMinStage">项目开发达标阶段（全局）</Label>
          <select
            id="projectDevMinStage"
            name="projectDevMinStageValue"
            defaultValue={projectDevMinStageValue ?? ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">未设置（仅已签约计数）</option>
            {stageOptions.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label} 及之后
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          保存项目开发规则
        </Button>
      </form>

      <form onSubmit={submitKpiTargets} className="grid gap-4 md:grid-cols-5">
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
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>
            保存 KPI 目标
          </Button>
        </div>
      </form>
    </div>
  );
}
