"use client";

import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type DraftConfigOption = {
  id: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  isNew?: boolean;
};

export type ConfigOptionRow = {
  id: string;
  category: string;
  value: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  color?: string | null;
};

type Props = {
  items: DraftConfigOption[];
  onItemsChange: (items: DraftConfigOption[]) => void;
  onUpdateLabel: (id: string, label: string) => void;
  onToggleEnabled: (id: string) => void;
  onDelete: (opt: { id: string; label: string }) => void;
  extraColumnLabel?: string;
  extraColumnClassName?: string;
  renderExtra?: (item: DraftConfigOption) => React.ReactNode;
};

export function ConfigOptionSortableList({
  items,
  onItemsChange,
  onUpdateLabel,
  onToggleEnabled,
  onDelete,
  extraColumnLabel,
  extraColumnClassName = "w-[9.5rem]",
  renderExtra,
}: Props) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;

    const prev = itemsRef.current;
    const from = prev.findIndex((o) => o.id === draggingId);
    const to = prev.findIndex((o) => o.id === overId);
    if (from < 0 || to < 0) return;

    const next = [...prev];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onItemsChange(next.map((o, i) => ({ ...o, sortOrder: i + 1 })));
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  if (items.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">暂无选项，可在上方添加后保存。</p>;
  }

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-10" />
            <col />
            {renderExtra ? <col className={extraColumnClassName} /> : null}
            <col className="w-16" />
            <col className="w-20" />
            <col className="w-28" />
          </colgroup>
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pb-2" aria-label="拖拽排序" />
              <th className="pb-2 pr-4 text-left font-medium">显示名称</th>
              {renderExtra ? (
                <th className="pb-2 text-center font-medium">{extraColumnLabel ?? "扩展"}</th>
              ) : null}
              <th className="pb-2 text-center font-medium">排序</th>
              <th className="pb-2 text-center font-medium">状态</th>
              <th className="pb-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((opt) => (
              <tr
                key={opt.id}
                className={`border-b ${draggingId === opt.id ? "opacity-50" : ""} ${opt.isNew ? "bg-muted/30" : ""}`}
                onDragOver={(e) => handleDragOver(e, opt.id)}
              >
                <td className="py-3 align-middle">
                  <button
                    type="button"
                    draggable
                    onDragStart={() => handleDragStart(opt.id)}
                    onDragEnd={handleDragEnd}
                    className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
                    aria-label={`拖拽排序：${opt.label || "新选项"}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </td>
                <td className="py-3 pr-4 align-middle">
                  <Input
                    value={opt.label}
                    onChange={(e) => onUpdateLabel(opt.id, e.target.value)}
                    placeholder="请输入"
                    className="h-8"
                  />
                </td>
                {renderExtra ? (
                  <td className="overflow-hidden px-1 py-3 text-center align-middle">
                    {renderExtra(opt)}
                  </td>
                ) : null}
                <td className="py-3 text-center align-middle">{opt.sortOrder}</td>
                <td className="py-3 text-center align-middle">
                  {opt.enabled ? "启用" : "停用"}
                </td>
                <td className="py-3 text-center align-middle">
                  <div className="inline-flex items-center justify-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleEnabled(opt.id)}
                    >
                      {opt.enabled ? "停用" : "启用"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete({ id: opt.id, label: opt.label || "新选项" })}
                    >
                      删除
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        拖动左侧手柄可调整顺序；修改后请点击下方「保存」才会生效。
      </p>
    </div>
  );
}
