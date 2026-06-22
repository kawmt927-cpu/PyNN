"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProductTemplate,
  deleteProductTemplate,
  updateProductTemplate,
} from "@/app/(dashboard)/admin/settings/product-actions";

type Template = {
  id: string;
  name: string;
  description: string | null;
  baselineCostPrice: number;
  enabled: boolean;
};

export function ProductTemplatesPanel({ items }: { items: Template[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        action={(formData) =>
          startTransition(async () => {
            await createProductTemplate(formData);
            router.refresh();
          })
        }
        className="grid gap-3 rounded-lg border p-4 md:grid-cols-4"
      >
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="new-name">产品名称 *</Label>
          <Input id="new-name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-cost">默认成本 *</Label>
          <Input id="new-cost" name="baselineCostPrice" type="number" min={0} step="0.01" required />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={pending}>
            添加
          </Button>
        </div>
        <div className="space-y-2 md:col-span-4">
          <Label htmlFor="new-desc">说明</Label>
          <Textarea id="new-desc" name="description" rows={2} />
        </div>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无产品模板，请先添加。</p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <form
              key={item.id}
              action={(formData) =>
                startTransition(async () => {
                  await updateProductTemplate(formData);
                  router.refresh();
                })
              }
              className="grid gap-3 rounded-lg border p-4 md:grid-cols-4"
            >
              <input type="hidden" name="id" value={item.id} />
              <div className="space-y-2 md:col-span-2">
                <Label>产品名称</Label>
                <Input name="name" defaultValue={item.name} required />
              </div>
              <div className="space-y-2">
                <Label>默认成本</Label>
                <Input
                  name="baselineCostPrice"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={item.baselineCostPrice}
                  required
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="enabled" defaultChecked={item.enabled} />
                  启用
                </label>
                <Button type="submit" size="sm" variant="outline" disabled={pending}>
                  保存
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`确定删除「${item.name}」？`)) return;
                    startTransition(async () => {
                      await deleteProductTemplate(item.id);
                      router.refresh();
                    });
                  }}
                >
                  删除
                </Button>
              </div>
              <div className="space-y-2 md:col-span-4">
                <Label>说明</Label>
                <Textarea name="description" rows={2} defaultValue={item.description ?? ""} />
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
