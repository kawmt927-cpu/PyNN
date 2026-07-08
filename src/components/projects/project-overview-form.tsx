"use client";

import { useState, useTransition } from "react";
import { ProjectStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { PROJECT_STATUS_LABELS } from "@/lib/projects/labels";
import { formatLocalDateInput } from "@/lib/dates/local-date";
import { updateProjectOverview } from "@/app/(dashboard)/projects/actions";

const STATUS_OPTIONS = (Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map(
  (status) => ({
    value: status,
    label: PROJECT_STATUS_LABELS[status],
  })
);

type Props = {
  projectId: string;
  canEdit: boolean;
  defaultValues: {
    status: ProjectStatus;
    progressPercent: number;
    plannedStartAt: Date | null;
    plannedEndAt: Date | null;
    actualStartAt: Date | null;
    actualEndAt: Date | null;
    notes: string | null;
  };
};

export function ProjectOverviewForm({ projectId, canEdit, defaultValues }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(defaultValues.status);

  if (!canEdit) {
    return (
      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">状态</dt>
          <dd>{PROJECT_STATUS_LABELS[defaultValues.status]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">进度</dt>
          <dd>{defaultValues.progressPercent}%</dd>
        </div>
        {defaultValues.notes ? (
          <div className="md:col-span-2">
            <dt className="text-muted-foreground">备注</dt>
            <dd className="whitespace-pre-wrap">{defaultValues.notes}</dd>
          </div>
        ) : null}
      </dl>
    );
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("projectId", projectId);
    startTransition(async () => {
      const result = await updateProjectOverview(formData);
      if (result.error) setError(result.error);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          id="status"
          name="status"
          label="状态"
          value={status}
          onValueChange={(v) => setStatus(v as ProjectStatus)}
          options={STATUS_OPTIONS}
        />
        <div className="space-y-2">
          <Label htmlFor="progressPercent">进度 %</Label>
          <Input
            id="progressPercent"
            name="progressPercent"
            type="number"
            min={0}
            max={100}
            defaultValue={defaultValues.progressPercent}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plannedStartAt">计划开始</Label>
          <Input
            id="plannedStartAt"
            name="plannedStartAt"
            type="date"
            defaultValue={
              defaultValues.plannedStartAt
                ? formatLocalDateInput(defaultValues.plannedStartAt)
                : ""
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plannedEndAt">计划结束</Label>
          <Input
            id="plannedEndAt"
            name="plannedEndAt"
            type="date"
            defaultValue={
              defaultValues.plannedEndAt
                ? formatLocalDateInput(defaultValues.plannedEndAt)
                : ""
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="actualStartAt">实际开始</Label>
          <Input
            id="actualStartAt"
            name="actualStartAt"
            type="date"
            defaultValue={
              defaultValues.actualStartAt
                ? formatLocalDateInput(defaultValues.actualStartAt)
                : ""
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="actualEndAt">实际结束</Label>
          <Input
            id="actualEndAt"
            name="actualEndAt"
            type="date"
            defaultValue={
              defaultValues.actualEndAt
                ? formatLocalDateInput(defaultValues.actualEndAt)
                : ""
            }
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">备注</Label>
        <Input id="notes" name="notes" defaultValue={defaultValues.notes ?? ""} />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "保存中…" : "保存概览"}
      </Button>
    </form>
  );
}
