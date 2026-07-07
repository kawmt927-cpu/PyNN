"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveCustomerGradeOptions } from "@/app/(dashboard)/admin/settings/actions";
import { CustomerGradeVisual } from "@/components/customers/customer-grade-icon";
import {
  ConfigOptionSortableList,
  type ConfigOptionRow,
  type DraftConfigOption,
} from "@/components/admin/config-option-sortable-list";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";

type GradeDraft = DraftConfigOption & { followUpIntervalDays: number; value?: string };

type Props = {
  options: ConfigOptionRow[];
  onDirtyChange?: (dirty: boolean) => void;
};

function optionsToDraft(options: ConfigOptionRow[]): GradeDraft[] {
  return [...options]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((option, index) => ({
      id: option.id,
      value: option.value,
      label: option.label,
      enabled: option.enabled,
      sortOrder: index + 1,
      isNew: false,
      followUpIntervalDays: option.followUpIntervalDays ?? 30,
    }));
}

function draftSnapshot(items: GradeDraft[]) {
  return items.map(({ id, label, enabled, followUpIntervalDays }) => ({
    id,
    label,
    enabled,
    followUpIntervalDays,
  }));
}

export function CustomerGradeOptionsPanel({ options, onDirtyChange }: Props) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(() => optionsToDraft(options));
  const [draft, setDraft] = useState(() => optionsToDraft(options));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePending, startSaveTransition] = useTransition();
  const valueById = useMemo(
    () => new Map(draft.map((item) => [item.id, item.value])),
    [draft]
  );

  useEffect(() => {
    const next = optionsToDraft(options);
    setBaseline(next);
    setDraft(next);
    setSaveError(null);
  }, [options]);

  const isDirty = useMemo(
    () => JSON.stringify(draftSnapshot(draft)) !== JSON.stringify(draftSnapshot(baseline)),
    [draft, baseline]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function handleSave() {
    const trimmedItems = draft.map((item) => ({
      ...item,
      label: item.label.trim(),
    }));

    const emptyLabel = trimmedItems.find((item) => !item.label);
    if (emptyLabel) {
      setSaveError("文字描述不能为空");
      return;
    }

    const invalidInterval = trimmedItems.find(
      (item) => !Number.isFinite(item.followUpIntervalDays) || item.followUpIntervalDays < 1
    );
    if (invalidInterval) {
      setSaveError("往来间隔须为至少 1 天的整数");
      return;
    }

    startSaveTransition(async () => {
      try {
        await saveCustomerGradeOptions(
          trimmedItems.map((item) => ({
            id: item.isNew ? null : item.id,
            label: item.label,
            enabled: item.enabled,
            followUpIntervalDays: item.followUpIntervalDays,
          }))
        );
        setSaveError(null);
        router.refresh();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        为每个星级设置文字描述与往来间隔天数。文字描述会显示在表单下拉选项的星级后面，并在各列表悬浮星级时提示；超过间隔天数未往来时，客户将进入待跟进列表。
      </p>

      <ConfigOptionSortableList
        items={draft}
        labelColumnName="文字描述"
        leadingColumnLabel="星级"
        leadingColumnClassName="w-24"
        renderLeading={(item) => {
          const value = valueById.get(item.id);
          return value ? (
            <span className="inline-flex justify-center">
              <CustomerGradeVisual grade={value} size="sm" />
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        }}
        onItemsChange={(items) =>
          setDraft((prev) =>
            items.map((item) => {
              const existing = prev.find((row) => row.id === item.id);
              return {
                ...item,
                value: existing?.value,
                followUpIntervalDays: existing?.followUpIntervalDays ?? 30,
              };
            })
          )
        }
        onUpdateLabel={(id, label) =>
          setDraft((items) => items.map((item) => (item.id === id ? { ...item, label } : item)))
        }
        onToggleEnabled={(id) =>
          setDraft((items) =>
            items.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
          )
        }
        onDelete={(opt) => {
          if (
            !confirmDestructiveAction(
              `确定从列表中移除「${opt.label || "该等级"}」？需点击保存后才会生效。`
            )
          ) {
            return;
          }
          setDraft((items) =>
            items
              .filter((item) => item.id !== opt.id)
              .map((item, index) => ({ ...item, sortOrder: index + 1 }))
          );
        }}
        confirmBeforeDelete={false}
        extraColumnLabel="往来间隔"
        extraColumnClassName="w-[8rem]"
        renderExtra={(item) => {
          const row = draft.find((d) => d.id === item.id);
          if (!row) return null;
          return (
            <div className="flex items-center justify-center gap-1">
              <Input
                type="number"
                min={1}
                className="h-8 w-16 text-center"
                value={row.followUpIntervalDays}
                onChange={(e) => {
                  const days = Number(e.target.value);
                  setDraft((items) =>
                    items.map((d) => (d.id === item.id ? { ...d, followUpIntervalDays: days } : d))
                  );
                }}
              />
              <span className="text-xs text-muted-foreground">天</span>
            </div>
          );
        }}
      />

      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

      <div className="flex gap-2">
        <Button type="button" onClick={handleSave} disabled={savePending || !isDirty}>
          {savePending ? "保存中…" : "保存"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={savePending || !isDirty}
          onClick={() => setDraft(baseline)}
        >
          取消
        </Button>
      </div>
    </div>
  );
}
