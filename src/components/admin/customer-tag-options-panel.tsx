"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCustomerTagOptions } from "@/app/(dashboard)/admin/settings/actions";
import { normalizeTagColor } from "@/lib/customers/tags";
import {
  CUSTOMER_TAG_COLOR_OPTIONS,
  hasDuplicateTagColors,
  isTagColorAvailable,
  pickAvailableTagColor,
} from "@/lib/customers/tag-colors";
import { CustomerTagBadge } from "@/components/customers/customer-tag-badge";
import { CustomerTagColorPicker } from "@/components/admin/customer-tag-color-picker";
import {
  ConfigOptionSortableList,
  type ConfigOptionRow,
  type DraftConfigOption,
} from "@/components/admin/config-option-sortable-list";

type PendingDelete = { id: string; label: string };
type TagDraft = DraftConfigOption & { color: string };

type Props = {
  options: ConfigOptionRow[];
  onDirtyChange?: (dirty: boolean) => void;
};

function optionsToDraft(options: ConfigOptionRow[]): TagDraft[] {
  return [...options]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((option, index) => ({
      id: option.id,
      label: option.label,
      enabled: option.enabled,
      sortOrder: index + 1,
      isNew: false,
      color: normalizeTagColor(option.color),
    }));
}

function draftSnapshot(items: TagDraft[]) {
  return items.map(({ id, label, enabled, color }) => ({ id, label, enabled, color }));
}

export function CustomerTagOptionsPanel({ options, onDirtyChange }: Props) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(() => optionsToDraft(options));
  const [draft, setDraft] = useState(() => optionsToDraft(options));
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(() => pickAvailableTagColor([]) ?? CUSTOMER_TAG_COLOR_OPTIONS[0].value);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savePending, startSaveTransition] = useTransition();

  useEffect(() => {
    const next = optionsToDraft(options);
    setBaseline(next);
    setDraft(next);
    setNewLabel("");
    setNewColor(pickAvailableTagColor(next.map((item) => item.color)) ?? CUSTOMER_TAG_COLOR_OPTIONS[0].value);
    setSaveError(null);
  }, [options]);

  const isDirty = useMemo(
    () => JSON.stringify(draftSnapshot(draft)) !== JSON.stringify(draftSnapshot(baseline)),
    [draft, baseline]
  );

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const usedColorsForNew = useMemo(() => draft.map((item) => item.color), [draft]);
  const canAddMoreTags = draft.length < CUSTOMER_TAG_COLOR_OPTIONS.length;
  const addColorAvailable = isTagColorAvailable(newColor, usedColorsForNew);

  useEffect(() => {
    if (!addColorAvailable) {
      const next = pickAvailableTagColor(usedColorsForNew);
      if (next) setNewColor(next);
    }
  }, [addColorAvailable, usedColorsForNew]);

  function handleAddToDraft() {
    const trimmed = newLabel.trim();
    if (!trimmed) {
      setSaveError("请输入标签名称");
      return;
    }
    if (draft.some((item) => item.label.trim() === trimmed)) {
      setSaveError("该标签名称已存在");
      return;
    }
    if (draft.length >= CUSTOMER_TAG_COLOR_OPTIONS.length) {
      setSaveError(`最多可配置 ${CUSTOMER_TAG_COLOR_OPTIONS.length} 个标签（颜色已用完）`);
      return;
    }
    if (!isTagColorAvailable(newColor, draft.map((item) => item.color))) {
      setSaveError("该颜色已被其他标签使用");
      return;
    }

    const nextColors = [...draft.map((item) => item.color), newColor];
    setDraft((prev) => [
      ...prev,
      {
        id: `__new__${crypto.randomUUID()}`,
        label: trimmed,
        enabled: true,
        sortOrder: prev.length + 1,
        isNew: true,
        color: newColor,
      },
    ]);
    setNewLabel("");
    setNewColor(pickAvailableTagColor(nextColors) ?? CUSTOMER_TAG_COLOR_OPTIONS[0].value);
    setSaveError(null);
  }

  function handleSave() {
    const payload = draft.map((item) => ({
      id: item.isNew ? null : item.id,
      label: item.label.trim(),
      enabled: item.enabled,
      color: item.color,
    }));

    if (payload.some((item) => !item.label)) {
      setSaveError("标签名称不能为空");
      return;
    }
    if (hasDuplicateTagColors(payload.map((item) => item.color))) {
      setSaveError("标签颜色不能重复");
      return;
    }

    const formData = new FormData();
    formData.set("payload", JSON.stringify(payload));

    startSaveTransition(async () => {
      try {
        await saveCustomerTagOptions(formData);
        setSaveError(null);
        router.refresh();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "保存失败，请重试");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1 space-y-2">
            <Label htmlFor="customer-tag-label">标签名称</Label>
            <Input
              id="customer-tag-label"
              placeholder="如：重点客户"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label id="customer-tag-color">颜色</Label>
            <div className="flex flex-wrap items-start gap-3">
              <CustomerTagColorPicker
                id="customer-tag-color"
                value={newColor}
                onChange={setNewColor}
                usedColors={draft.map((item) => item.color)}
                showLabel
              />
              <CustomerTagBadge label={newLabel.trim() || "预览"} color={newColor} />
            </div>
          </div>
          <Button type="button" onClick={handleAddToDraft} disabled={!canAddMoreTags}>
            添加到列表
          </Button>
        </div>
        {!canAddMoreTags ? (
          <p className="mt-2 text-xs text-muted-foreground">
            已达 {CUSTOMER_TAG_COLOR_OPTIONS.length} 个标签上限（每种颜色仅可使用一次）
          </p>
        ) : null}
      </div>

      <ConfigOptionSortableList
        items={draft}
        onItemsChange={(items) => setDraft(items as TagDraft[])}
        onUpdateLabel={(id, label) => {
          setDraft((prev) => prev.map((item) => (item.id === id ? { ...item, label } : item)));
        }}
        onToggleEnabled={(id) => {
          setDraft((prev) =>
            prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
          );
        }}
        onDelete={setPendingDelete}
        confirmBeforeDelete={false}
        extraColumnLabel="颜色"
        renderExtra={(item) => (
          <CustomerTagColorPicker
            value={(item as TagDraft).color}
            onChange={(color) =>
              setDraft((prev) =>
                prev.map((row) => (row.id === item.id ? { ...row, color } : row))
              )
            }
            usedColors={draft
              .filter((row) => row.id !== item.id)
              .map((row) => row.color)}
            aria-label={`${item.label} 颜色`}
            compact
          />
        )}
      />

      {pendingDelete ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>确定移除标签「{pendingDelete.label}」？保存后会从所有客户上移除该标签。</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDraft((prev) => prev.filter((item) => item.id !== pendingDelete.id));
                setPendingDelete(null);
              }}
            >
              确定移除
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-4 py-3">
        <div className="text-sm">
          {isDirty ? (
            <span className="text-orange-600">有未保存的修改</span>
          ) : (
            <span className="text-muted-foreground">所有修改已保存</span>
          )}
          {saveError ? <p className="mt-1 text-destructive">{saveError}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={!isDirty || savePending} onClick={() => setDraft(baseline)}>
            取消
          </Button>
          <Button type="button" disabled={!isDirty || savePending} onClick={handleSave}>
            {savePending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
