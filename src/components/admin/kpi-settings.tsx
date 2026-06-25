"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveKpiConfig } from "@/app/(dashboard)/admin/settings/actions";
import type { SalesKpiConfigView } from "@/lib/plans-tasks/kpi-config";

type StageOption = { value: string; label: string };

export function KpiSettings({
  kpiConfig,
  stageOptions,
}: {
  kpiConfig: SalesKpiConfigView;
  stageOptions: StageOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submitKpiConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await saveKpiConfig(formData);
        setMessage("项目开发规则已保存");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        此处仅维护全员统一的 KPI 计数规则。月度 KPI 目标值请在计划与任务 → 指标概览 → 月度中，按销售分别设定。
      </p>

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold">项目开发达标规则</h3>
          <p className="text-sm text-muted-foreground">影响所有销售的项目开发 KPI 计数口径</p>
        </div>
        <form onSubmit={submitKpiConfig} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] space-y-2">
            <Label htmlFor="projectDevMinStage">达标阶段</Label>
            <select
              id="projectDevMinStage"
              name="projectDevMinStageValue"
              defaultValue={kpiConfig.projectDevMinStageValue ?? ""}
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
            保存规则
          </Button>
        </form>
      </section>

      {message ? <p className="text-sm text-green-600 dark:text-green-400">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
