"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExpenseFeeCategoryView } from "@/lib/expenses/fee-categories";
import {
  saveExpenseFeeCategory,
  setExpenseFeeCategoryEnabled,
} from "@/app/(dashboard)/admin/settings/actions";

type Props = {
  initial: ExpenseFeeCategoryView[];
};

export function ExpenseFeeCategorySettings({ initial }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>, okMsg: string) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(okMsg);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">报销费用细类</p>
        <p className="mt-1">
          维护住宿、交通、补贴等细类。勾选「住宿上限」的类别在提交/审批时会按行程城市标准校验金额。
        </p>
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2">标识</th>
              <th className="px-3 py-2">名称</th>
              <th className="px-3 py-2">排序</th>
              <th className="px-3 py-2">住宿上限</th>
              <th className="px-3 py-2">启用</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {initial.map((row) => (
              <tr key={row.key} className="border-b align-middle">
                <td className="px-3 py-2 font-mono text-xs">{row.key}</td>
                <td className="px-3 py-2">
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      run(() => saveExpenseFeeCategory(fd), "已保存");
                    }}
                  >
                    <input type="hidden" name="key" value={row.key} />
                    <Input
                      name="label"
                      defaultValue={row.label}
                      className="h-9 w-36"
                      required
                    />
                    <Input
                      name="sortOrder"
                      type="number"
                      defaultValue={row.sortOrder}
                      className="h-9 w-20"
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        name="enforceHotelCap"
                        defaultChecked={row.enforceHotelCap}
                        value="1"
                      />
                      住宿上限
                    </label>
                    <Button type="submit" size="sm" disabled={pending}>
                      保存
                    </Button>
                  </form>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.sortOrder}</td>
                <td className="px-3 py-2">{row.enforceHotelCap ? "是" : "否"}</td>
                <td className="px-3 py-2">{row.enabled ? "启用" : "停用"}</td>
                <td className="px-3 py-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => setExpenseFeeCategoryEnabled(row.key, !row.enabled),
                        row.enabled ? "已停用" : "已启用"
                      )
                    }
                  >
                    {row.enabled ? "停用" : "启用"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-md border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(async () => {
            await saveExpenseFeeCategory(fd);
            e.currentTarget.reset();
          }, "已新增细类");
        }}
      >
        <div className="space-y-1">
          <Label>新标识（英文）</Label>
          <Input name="key" placeholder="例如 parking" required pattern="[a-z0-9_]+" />
        </div>
        <div className="space-y-1">
          <Label>名称</Label>
          <Input name="label" placeholder="例如 停车费" required />
        </div>
        <div className="space-y-1">
          <Label>排序</Label>
          <Input name="sortOrder" type="number" defaultValue={100} />
        </div>
        <label className="flex items-center gap-1 pb-2 text-sm">
          <input type="checkbox" name="enforceHotelCap" value="1" />
          住宿上限
        </label>
        <Button type="submit" disabled={pending}>
          新增细类
        </Button>
      </form>
    </div>
  );
}
