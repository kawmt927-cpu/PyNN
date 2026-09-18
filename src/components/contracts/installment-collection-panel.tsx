"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatAmount } from "@/lib/opportunities/funnel";
import type { ActionResult } from "@/lib/action-result";
import {
  COLLECTION_STATUS_LABELS,
  type ManualCollectionStatus,
} from "@/lib/contracts/installment-collection-status";

type PhaseOption = {
  id: string;
  name: string;
  status: string;
};

type Row = {
  id: string;
  periodNumber: number;
  amount: number;
  condition: string | null;
  phaseId: string | null;
  phaseName: string | null;
  phaseStatus: string | null;
  collectionStatus: ManualCollectionStatus;
};

type Props = {
  contractId: string;
  phases: PhaseOption[];
  rows: Row[];
  onSave: (formData: FormData) => Promise<ActionResult>;
};

export function InstallmentCollectionPanel({ contractId, phases, rows, onSave }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(
    () =>
      Object.fromEntries(rows.map((row) => [row.id, row.phaseId ?? ""])) as Record<
        string,
        string
      >
  );

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("contractId", contractId);
      fd.set(
        "settingsJson",
        JSON.stringify(
          rows.map((row) => ({
            installmentId: row.id,
            phaseId: drafts[row.id] || null,
          }))
        )
      );
      const result = await onSave(fd);
      if (result.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <p className="text-sm font-medium">催收条件（项目联动）</p>
        <p className="text-xs text-muted-foreground">
          绑定项目阶段后，阶段完成时若该期仍为「未开始」会自动变为「可催款」；已是「回款中 / 回款困难 / 坏账」不会被覆盖。催收状态请在上方回款进度中点击标签修改；坏账不再催收、不计入待回款。
        </p>
      </div>
      <ul className="space-y-3">
        {rows.map((row) => {
          const phaseId = drafts[row.id] ?? row.phaseId ?? "";
          return (
            <li
              key={row.id}
              className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_minmax(12rem,16rem)] sm:items-end"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  第 {row.periodNumber} 期 · {formatAmount(row.amount)}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {COLLECTION_STATUS_LABELS[row.collectionStatus]}
                  </span>
                </p>
                {row.condition ? (
                  <p className="truncate text-xs text-muted-foreground">{row.condition}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">绑定阶段</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={phaseId}
                  disabled={phases.length === 0 || pending}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [row.id]: e.target.value,
                    }))
                  }
                >
                  <option value="">未绑定</option>
                  {phases.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name}
                      {phase.status === "COMPLETED" ? "（已完成）" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
      <Button type="button" size="sm" disabled={pending} onClick={save}>
        {pending ? "保存中…" : "保存催收设置"}
      </Button>
    </div>
  );
}
