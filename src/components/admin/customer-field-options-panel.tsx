"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveConfigCategoryOptions } from "@/app/(dashboard)/admin/settings/actions";
import {
  ConfigOptionSortableList,
  type ConfigOptionRow,
  type DraftConfigOption,
} from "@/components/admin/config-option-sortable-list";

type PendingDelete = { id: string; label: string };

type Props = {
  category: string;
  title: string;
  options: ConfigOptionRow[];
  onDirtyChange?: (dirty: boolean) => void;
};

function optionsToDraft(options: ConfigOptionRow[]): DraftConfigOption[] {
  return [...options]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((option, index) => ({
      id: option.id,
      label: option.label,
      enabled: option.enabled,
      sortOrder: index + 1,
      isNew: false,
    }));
}

function draftSnapshot(items: DraftConfigOption[]) {
  return items.map(({ id, label, enabled }) => ({ id, label, enabled }));
}

function DeleteConfirmDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: PendingDelete;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-option-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="delete-option-title" className="text-lg font-semibold">
          确认移除
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          确定从列表中移除「{target.label}」？需点击「保存」后才会真正删除；已使用该选项的客户相关字段将被清空。
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            确定移除
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CustomerFieldOptionsPanel({
  category,
  title,
  options,
  onDirtyChange,
}: Props) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(() => optionsToDraft(options));
  const [draft, setDraft] = useState(() => optionsToDraft(options));
  const [newLabel, setNewLabel] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePending, startSaveTransition] = useTransition();

  useEffect(() => {
    const next = optionsToDraft(options);
    setBaseline(next);
    setDraft(next);
    setNewLabel("");
    setSaveError(null);
  }, [options, category]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(draftSnapshot(draft)) !== JSON.stringify(draftSnapshot(baseline)),
    [draft, baseline]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function handleAddToDraft() {
    const trimmed = newLabel.trim();
    if (!trimmed) {
      setSaveError("请输入显示名称");
      return;
    }
    if (draft.some((item) => item.label.trim() === trimmed)) {
      setSaveError("该显示名称已存在");
      return;
    }

    setDraft((prev) => [
      ...prev,
      {
        id: `__new__${crypto.randomUUID()}`,
        label: trimmed,
        enabled: true,
        sortOrder: prev.length + 1,
        isNew: true,
      },
    ]);
    setNewLabel("");
    setSaveError(null);
  }

  function confirmRemoveFromDraft() {
    if (!pendingDelete) return;
    setDraft((prev) =>
      prev
        .filter((item) => item.id !== pendingDelete.id)
        .map((item, index) => ({ ...item, sortOrder: index + 1 }))
    );
    setPendingDelete(null);
    setSaveError(null);
  }

  function handleCancel() {
    setDraft(baseline);
    setNewLabel("");
    setSaveError(null);
    setPendingDelete(null);
  }

  function handleSave() {
    const trimmedItems = draft.map((item) => ({
      ...item,
      label: item.label.trim(),
    }));

    const emptyLabel = trimmedItems.find((item) => !item.label);
    if (emptyLabel) {
      setSaveError("显示名称不能为空");
      return;
    }

    const labels = trimmedItems.map((item) => item.label);
    if (new Set(labels).size !== labels.length) {
      setSaveError("显示名称不能重复");
      return;
    }

    const payload = trimmedItems.map((item) => ({
      id: item.isNew ? null : item.id,
      label: item.label,
      enabled: item.enabled,
    }));

    const formData = new FormData();
    formData.set("category", category);
    formData.set("payload", JSON.stringify(payload));

    startSaveTransition(async () => {
      try {
        await saveConfigCategoryOptions(formData);
        setSaveError(null);
        router.refresh();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
      }
    });
  }

  return (
    <div className="space-y-4">
      {pendingDelete && (
        <DeleteConfirmDialog
          target={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmRemoveFromDraft}
        />
      )}

      <div className="rounded-md border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1 space-y-2">
            <Label htmlFor={`${category}-label`}>显示名称</Label>
            <Input
              id={`${category}-label`}
              placeholder="请输入"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddToDraft();
                }
              }}
            />
          </div>
          <Button type="button" className="shrink-0" onClick={handleAddToDraft}>
            添加到列表
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          新选项先加入下方列表，点击「保存」后才会写入系统。
        </p>
      </div>

      <ConfigOptionSortableList
        items={draft}
        onItemsChange={setDraft}
        onUpdateLabel={(id, label) => {
          setDraft((prev) => prev.map((item) => (item.id === id ? { ...item, label } : item)));
          setSaveError(null);
        }}
        onToggleEnabled={(id) => {
          setDraft((prev) =>
            prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
          );
          setSaveError(null);
        }}
        onDelete={setPendingDelete}
        confirmBeforeDelete={false}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
        <div className="text-sm">
          {isDirty ? (
            <span className="text-orange-600">有未保存的修改</span>
          ) : (
            <span className="text-muted-foreground">所有修改已保存</span>
          )}
          {saveError && <p className="mt-1 text-sm text-destructive">{saveError}</p>}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={!isDirty || savePending} onClick={handleCancel}>
            取消
          </Button>
          <Button type="button" disabled={!isDirty || savePending} onClick={handleSave}>
            {savePending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {title}：改名仅影响显示名称；删除后排序会自动从 1 起重新编号；删除会清空已有客户上的对应字段。
      </p>
    </div>
  );
}
