"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import {
  copyProjectModel,
  deleteProjectModel,
} from "@/app/(dashboard)/admin/settings/project-model-actions";
import {
  PROJECT_MODELS_NEW_HREF,
  projectModelEditHref,
  type ProjectModelListItem,
} from "@/components/admin/project-model-types";
import { cn } from "@/lib/utils";

export function ProjectModelsList({ items }: { items: ProjectModelListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ProjectModelListItem | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  function handleCopy(item: ProjectModelListItem) {
    setCopyError(null);
    setCopyingId(item.id);
    startTransition(async () => {
      const result = await copyProjectModel(item.id);
      setCopyingId(null);
      if (result.error) {
        setCopyError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          维护项目实施阶段模板。点击「编辑」进入阶段与甘特配置。
        </p>
        <Button asChild>
          <Link href={PROJECT_MODELS_NEW_HREF}>新建模型</Link>
        </Button>
      </div>

      {copyError ? <p className="text-sm text-destructive">{copyError}</p> : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center rounded-lg border border-dashed">
          暂无项目模型，请点击「新建模型」。
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">模型名称</th>
                <th className="px-4 py-3 font-medium w-24">状态</th>
                <th className="px-4 py-3 font-medium w-28">总工期</th>
                <th className="px-4 py-3 font-medium w-24">阶段数</th>
                <th className="px-4 py-3 font-medium w-36 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{item.name}</span>
                          <button
                            type="button"
                            title="复制该模型"
                            aria-label="复制该模型"
                            disabled={pending}
                            className={cn(
                              "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground",
                              "hover:bg-muted hover:text-foreground",
                              "disabled:cursor-not-allowed disabled:opacity-50",
                              copyingId === item.id && "text-foreground"
                            )}
                            onClick={() => handleCopy(item)}
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                        {item.description ? (
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {item.description}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        item.enabled
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground"
                      }
                    >
                      {item.enabled ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.totalDurationDays} 天</td>
                  <td className="px-4 py-3">{item.phaseCount}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Button asChild size="sm">
                        <Link href={projectModelEditHref(item.id)}>编辑</Link>
                      </Button>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                        onClick={() => setDeleteTarget(item)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDestructiveDialog
        open={Boolean(deleteTarget)}
        title="删除项目模型"
        message={
          deleteTarget
            ? `确定删除模型「${deleteTarget.name}」？此操作不可撤销。`
            : ""
        }
        confirmLabel="删除"
        pending={pending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          startTransition(async () => {
            const result = await deleteProjectModel(deleteTarget.id);
            if (result.error) alert(result.error);
            else {
              setDeleteTarget(null);
              router.refresh();
            }
          });
        }}
      />
    </div>
  );
}
