"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SalesOption = { id: string; name: string };

type Props = {
  salesUsers: SalesOption[];
  ownerId: string | null;
  initialIds?: string[];
  className?: string;
};

export function AssistantOwnersField({
  salesUsers,
  ownerId,
  initialIds = [],
  className,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialIds));

  const options = salesUsers.filter((user) => user.id !== ownerId);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <div className={cn("space-y-2 md:col-span-2", className)}>
      <Label>协助负责人（可选）</Label>
      <p className="text-xs text-muted-foreground">可指定其他销售一同负责此客户，协助负责人可录入往来与编辑客户信息。</p>
      {options.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          暂无可选销售
        </p>
      ) : (
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-3">
          {options.map((user) => (
            <label key={user.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="assistantOwnerIds"
                value={user.id}
                checked={selected.has(user.id)}
                onChange={() => toggle(user.id)}
                className="h-4 w-4 rounded border-input"
              />
              <span>{user.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
