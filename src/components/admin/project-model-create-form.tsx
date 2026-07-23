"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProjectModel } from "@/app/(dashboard)/admin/settings/project-model-actions";
import {
  PROJECT_MODELS_LIST_HREF,
  projectModelEditHref,
} from "@/components/admin/project-model-types";

export function ProjectModelCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={PROJECT_MODELS_LIST_HREF}>← 返回列表</Link>
        </Button>
        <h2 className="text-lg font-semibold">新建项目模型</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        先填写基本信息并创建模型，创建后将进入编辑页配置阶段与甘特。
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            setError(null);
            const result = await createProjectModel(formData);
            if (result.error) {
              setError(result.error);
              return;
            }
            if (result.modelId) {
              router.push(projectModelEditHref(result.modelId));
              router.refresh();
            } else {
              router.push(PROJECT_MODELS_LIST_HREF);
              router.refresh();
            }
          });
        }}
        className="grid max-w-2xl gap-4 rounded-lg border p-4"
      >
        <div className="space-y-2">
          <Label htmlFor="new-model-name">模型名称 *</Label>
          <Input id="new-model-name" name="name" required disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-total">总工期（自然日）</Label>
          <Input
            id="new-total"
            name="totalDurationDays"
            type="number"
            min={1}
            defaultValue={40}
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-model-desc">说明</Label>
          <Textarea id="new-model-desc" name="description" rows={3} disabled={pending} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "创建中…" : "创建并编辑阶段"}
          </Button>
          <Button asChild type="button" variant="outline" disabled={pending}>
            <Link href={PROJECT_MODELS_LIST_HREF}>取消</Link>
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}
