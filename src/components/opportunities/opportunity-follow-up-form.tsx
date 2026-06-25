"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import {
  createOpportunityFollowUp,
  updateOpportunityFollowUp,
} from "@/app/(dashboard)/opportunities/actions";
import { PlannedFollowUpDateField } from "@/components/sales-log/planned-follow-up-date-field";
import { toPlannedFollowUpInputValue } from "@/lib/dates/local-date";
import { toExpectedCloseMonthInput } from "@/lib/opportunities/expected-close-date";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { FollowUpMethod } from "@prisma/client";

export type OpportunityFollowUpSnapshot = {
  stage: string;
  expectedAmount: number;
  expectedCloseDate: string | Date;
  winProbability: number | null;
  requirementDesc: string | null;
  competitor: string | null;
  notes: string | null;
  amountLocked: boolean;
};

type FollowUpInitial = {
  id: string;
  method: FollowUpMethod;
  content: string;
  followUpAt: string | Date;
  nextFollowUpAt: string | Date | null;
};

type Props = {
  mode: "create" | "edit";
  opportunityId: string;
  opportunity: OpportunityFollowUpSnapshot;
  stageOptions: ConfigOptionItem[];
  initialFollowUp?: FollowUpInitial;
  onCancel?: () => void;
  compact?: boolean;
};

const methodOptions = Object.entries(FOLLOW_UP_METHOD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function withEmptyOption(options: ConfigOptionItem[]) {
  return [{ value: "", label: "请选择" }, ...options];
}

function toDatetimeLocal(value: Date | string) {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function todayLocalDatetime() {
  return toDatetimeLocal(new Date());
}

function buildFormState(
  opportunity: OpportunityFollowUpSnapshot,
  initialFollowUp?: FollowUpInitial
) {
  return {
    method: initialFollowUp?.method ?? "PHONE",
    content: initialFollowUp?.content ?? "",
    followUpAt: initialFollowUp ? toDatetimeLocal(initialFollowUp.followUpAt) : todayLocalDatetime(),
    nextFollowUpAt: initialFollowUp?.nextFollowUpAt
      ? toPlannedFollowUpInputValue(initialFollowUp.nextFollowUpAt)
      : "",
    expectedAmount: String(opportunity.expectedAmount),
    expectedCloseDate: toExpectedCloseMonthInput(opportunity.expectedCloseDate),
    stage: opportunity.stage,
    requirementDesc: opportunity.requirementDesc ?? "",
    winProbability:
      opportunity.winProbability != null ? String(opportunity.winProbability) : "",
    competitor: opportunity.competitor ?? "",
    notes: opportunity.notes ?? "",
  };
}

export function OpportunityFollowUpForm({
  mode,
  opportunityId,
  opportunity,
  stageOptions,
  initialFollowUp,
  onCancel,
  compact = false,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState(() => buildFormState(opportunity, initialFollowUp));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patchForm(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("opportunityId", opportunityId);
    if (mode === "edit" && initialFollowUp) {
      formData.set("followUpId", initialFollowUp.id);
    }
    formData.set("method", form.method);
    formData.set("content", form.content);
    formData.set("followUpAt", form.followUpAt);
    formData.set("nextFollowUpAt", form.nextFollowUpAt);
    formData.set("expectedAmount", form.expectedAmount);
    formData.set("expectedCloseDate", form.expectedCloseDate);
    formData.set("stage", form.stage);
    formData.set("requirementDesc", form.requirementDesc);
    formData.set("winProbability", form.winProbability);
    formData.set("competitor", form.competitor);
    formData.set("notes", form.notes);

    startTransition(async () => {
      setError(null);
      const result =
        mode === "create"
          ? await createOpportunityFollowUp(formData)
          : await updateOpportunityFollowUp(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.redirectTo) {
        router.push(result.redirectTo);
        router.refresh();
      }
      onCancel?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">跟进信息</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`method-${mode}`}>跟进方式 *</Label>
            <select
              id={`method-${mode}`}
              value={form.method}
              onChange={(e) => patchForm({ method: e.target.value as FollowUpMethod })}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {methodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`followUpAt-${mode}`}>跟进时间 *</Label>
            <Input
              id={`followUpAt-${mode}`}
              type="datetime-local"
              value={form.followUpAt}
              onChange={(e) => patchForm({ followUpAt: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`content-${mode}`}>跟进内容 *</Label>
            <Textarea
              id={`content-${mode}`}
              rows={compact ? 2 : 3}
              value={form.content}
              onChange={(e) => patchForm({ content: e.target.value })}
              required
            />
          </div>
          <PlannedFollowUpDateField
            id={`nextFollowUpAt-${mode}`}
            label="下次跟进"
            value={form.nextFollowUpAt}
            onChange={(nextFollowUpAt) => patchForm({ nextFollowUpAt })}
          />
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium text-muted-foreground">
          同步更新商机（如有变更，将与跟进合并为一条记录）
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`expectedAmount-${mode}`}>预计金额 *</Label>
            <Input
              id={`expectedAmount-${mode}`}
              type="number"
              min={0}
              step="0.01"
              value={form.expectedAmount}
              onChange={(e) => patchForm({ expectedAmount: e.target.value })}
              required
              readOnly={opportunity.amountLocked}
              className={opportunity.amountLocked ? "bg-muted" : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`expectedCloseDate-${mode}`}>预计签约月份 *</Label>
            <Input
              id={`expectedCloseDate-${mode}`}
              type="month"
              value={form.expectedCloseDate}
              onChange={(e) => patchForm({ expectedCloseDate: e.target.value })}
              required
            />
          </div>
          <SelectField
            id={`stage-${mode}`}
            label="商机阶段 *"
            name="stage"
            options={withEmptyOption(stageOptions)}
            value={form.stage}
            onValueChange={(stage) => patchForm({ stage })}
          />
          <div className="space-y-2">
            <Label htmlFor={`winProbability-${mode}`}>赢单概率 (%)</Label>
            <Input
              id={`winProbability-${mode}`}
              type="number"
              min={0}
              max={100}
              value={form.winProbability}
              onChange={(e) => patchForm({ winProbability: e.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`requirementDesc-${mode}`}>需求描述</Label>
            <Textarea
              id={`requirementDesc-${mode}`}
              rows={compact ? 2 : 3}
              value={form.requirementDesc}
              onChange={(e) => patchForm({ requirementDesc: e.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`competitor-${mode}`}>竞争对手</Label>
            <Input
              id={`competitor-${mode}`}
              value={form.competitor}
              onChange={(e) => patchForm({ competitor: e.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`notes-${mode}`}>备注</Label>
            <Textarea
              id={`notes-${mode}`}
              rows={compact ? 2 : 3}
              value={form.notes}
              onChange={(e) => patchForm({ notes: e.target.value })}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "保存中…" : mode === "create" ? "保存跟进" : "保存修改"}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
