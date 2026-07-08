"use client";

import { useState, useTransition } from "react";
import { PersonnelType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PERSONNEL_TYPE_LABELS } from "@/lib/projects/labels";
import { formatAmount } from "@/lib/opportunities/funnel";
import { updatePersonnelProfile } from "@/app/(dashboard)/personnel/actions";

export type PersonnelListItem = {
  userId: string;
  name: string;
  email: string;
  personnelType: PersonnelType | null;
  dailyRate: number | null;
  projectCount: number;
  weekEffectiveDays: number;
  weekCost: number;
};

const TYPE_OPTIONS = [
  { value: "NONE", label: "未设置" },
  ...(Object.keys(PERSONNEL_TYPE_LABELS) as PersonnelType[]).map((type) => ({
    value: type,
    label: PERSONNEL_TYPE_LABELS[type],
  })),
];

type Props = {
  items: PersonnelListItem[];
};

export function PersonnelListTable({ items }: Props) {
  const [editing, setEditing] = useState<PersonnelListItem | null>(null);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4">姓名</th>
              <th className="pb-2 pr-4">类型</th>
              <th className="pb-2 pr-4">日单价</th>
              <th className="pb-2 pr-4">本周人天</th>
              <th className="pb-2 pr-4">参与项目</th>
              <th className="pb-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.userId} className="border-b">
                <td className="py-3 pr-4">
                  <div>{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.email}</div>
                </td>
                <td className="py-3 pr-4">
                  {item.personnelType
                    ? PERSONNEL_TYPE_LABELS[item.personnelType]
                    : "—"}
                </td>
                <td className="py-3 pr-4">
                  {item.dailyRate != null ? formatAmount(item.dailyRate) : "—"}
                </td>
                <td className="py-3 pr-4">
                  {item.weekEffectiveDays}
                  {item.weekCost > 0 ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({formatAmount(item.weekCost)})
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4">{item.projectCount}</td>
                <td className="py-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(item)}
                  >
                    编辑
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="py-6 text-muted-foreground">暂无实施人员。</p>
        ) : null}
      </div>

      {editing ? (
        <PersonnelEditDialog item={editing} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}

function PersonnelEditDialog({
  item,
  onClose,
}: {
  item: PersonnelListItem;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("userId", item.userId);
    startTransition(async () => {
      const result = await updatePersonnelProfile(formData);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑 — {item.name}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <SelectField
            id="personnelType"
            name="personnelType"
            label="人员类型"
            defaultValue={item.personnelType ?? "NONE"}
            options={TYPE_OPTIONS}
          />
          <div className="space-y-2">
            <Label htmlFor="dailyRate">日单价（元）</Label>
            <Input
              id="dailyRate"
              name="dailyRate"
              type="number"
              min="0"
              step="0.01"
              defaultValue={item.dailyRate ?? ""}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
