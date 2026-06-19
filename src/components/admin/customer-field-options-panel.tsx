"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createConfigOption,
  deleteConfigOption,
  toggleConfigOption,
  updateConfigOptionLabel,
} from "@/app/(dashboard)/admin/settings/actions";

type ConfigOptionRow = {
  id: string;
  category: string;
  value: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
};

type PendingDelete = { id: string; label: string };

type Props = {
  category: string;
  title: string;
  options: ConfigOptionRow[];
};

function DeleteConfirmDialog({
  target,
  onCancel,
  onConfirm,
  pending,
}: {
  target: PendingDelete;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
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
          确认删除
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          确定删除「{target.label}」？已使用该选项的客户相关字段将被清空，此操作不可恢复。
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            取消
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "删除中…" : "确定删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CustomerFieldOptionsPanel({ category, title, options }: Props) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [sortOrder, setSortOrder] = useState(String(options.length + 1));
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  useEffect(() => {
    setLabel("");
    setSortOrder(String(options.length + 1));
  }, [category, options.length]);

  function confirmDelete() {
    if (!pendingDelete) return;

    const formData = new FormData();
    formData.set("id", pendingDelete.id);
    startDeleteTransition(async () => {
      try {
        await deleteConfigOption(formData);
        setPendingDelete(null);
        router.refresh();
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "删除失败，请重试");
      }
    });
  }

  return (
    <div className="space-y-4">
      {pendingDelete && (
        <DeleteConfirmDialog
          target={pendingDelete}
          pending={deletePending}
          onCancel={() => {
            if (!deletePending) setPendingDelete(null);
          }}
          onConfirm={confirmDelete}
        />
      )}

      <form key={category} action={createConfigOption} className="rounded-md border p-4">
        <input type="hidden" name="category" value={category} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1 space-y-2">
            <Label htmlFor={`${category}-label`}>显示名称</Label>
            <Input
              id={`${category}-label`}
              name="label"
              placeholder="请输入"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
          <div className="w-24 space-y-2">
            <Label htmlFor={`${category}-sortOrder`}>排序</Label>
            <Input
              id={`${category}-sortOrder`}
              name="sortOrder"
              type="number"
              placeholder="请输入"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <Button type="submit" className="shrink-0">
            添加选项
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-36" />
          </colgroup>
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pb-2 pr-4 text-left font-medium">显示名称</th>
              <th className="pb-2 text-center font-medium">排序</th>
              <th className="pb-2 text-center font-medium">状态</th>
              <th className="pb-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {options.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-muted-foreground">
                  暂无选项
                </td>
              </tr>
            ) : (
              options.map((opt) => (
                <tr key={opt.id} className="border-b">
                  <td className="py-3 pr-4 align-middle">
                    <form action={updateConfigOptionLabel} className="flex gap-2">
                      <input type="hidden" name="id" value={opt.id} />
                      <Input
                        name="label"
                        defaultValue={opt.label}
                        placeholder="请输入"
                        className="h-8"
                      />
                      <Button type="submit" size="sm" variant="outline" className="shrink-0">
                        保存
                      </Button>
                    </form>
                  </td>
                  <td className="py-3 text-center align-middle">{opt.sortOrder}</td>
                  <td className="py-3 text-center align-middle">
                    {opt.enabled ? "启用" : "停用"}
                  </td>
                  <td className="py-3 text-center align-middle">
                    <div className="inline-flex items-center justify-center gap-0.5">
                      <form action={toggleConfigOption}>
                        <input type="hidden" name="id" value={opt.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          {opt.enabled ? "停用" : "启用"}
                        </Button>
                      </form>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingDelete({ id: opt.id, label: opt.label })}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {title}：改名仅影响显示名称，已关联客户数据不受影响；删除或停用后，新建/编辑时不可选，删除会清空已有客户上的对应字段。
      </p>
    </div>
  );
}
