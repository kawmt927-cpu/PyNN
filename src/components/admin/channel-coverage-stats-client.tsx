"use client";

import { useState, useTransition } from "react";
import { ChannelCoverageTable } from "@/components/admin/channel-coverage-table";
import type { ChannelDashboardBundle } from "@/lib/admin/channel-dashboard";
import { saveChannelCoverageTargets } from "@/app/(dashboard)/admin/channels/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  data: ChannelDashboardBundle;
  canEditTargets: boolean;
};

export function ChannelCoverageStatsClient({ data, canEditTargets }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const { totals, targets, kindLabels, gradeLabels, byProvince, activeWindowDays } = data;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="渠道总数" value={String(totals.customers)} />
        <Kpi
          label="已覆盖省 / 缺口省"
          value={`${totals.coveredProvinces} / ${totals.gapProvinces}`}
        />
        <Kpi
          label={`活跃（${activeWindowDays}天）`}
          value={`${totals.active}`}
          hint={`沉寂 ${totals.inactive}`}
        />
        <Kpi
          label="未分类 / 未填省"
          value={`${totals.unclassified} / ${totals.unassignedProvince}`}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        覆盖目标：集成商 {targets.integratorTarget} · HRP {targets.hrpVendorTarget} · 友商{" "}
        {targets.competitorTarget}（各省统一；其他不考核）
      </p>

      <ChannelCoverageTable
        rows={byProvince}
        kindLabels={kindLabels}
        gradeLabels={gradeLabels}
      />

      {canEditTargets ? (
        <form
          className="space-y-3 rounded-lg border p-4"
          action={(fd) => {
            startTransition(async () => {
              const res = await saveChannelCoverageTargets(fd);
              setMsg(res.error ?? "目标已保存");
              if (!res.error) window.location.reload();
            });
          }}
        >
          <h2 className="text-sm font-semibold">覆盖目标（各省统一）</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="integratorTarget">信息化集成商</Label>
              <Input
                id="integratorTarget"
                name="integratorTarget"
                type="number"
                min={0}
                defaultValue={targets.integratorTarget}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hrpVendorTarget">HRP 厂商</Label>
              <Input
                id="hrpVendorTarget"
                name="hrpVendorTarget"
                type="number"
                min={0}
                defaultValue={targets.hrpVendorTarget}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="competitorTarget">友商</Label>
              <Input
                id="competitorTarget"
                name="competitorTarget"
                type="number"
                min={0}
                defaultValue={targets.competitorTarget}
                required
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending} size="sm">
              {pending ? "保存中…" : "保存目标"}
            </Button>
            {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
