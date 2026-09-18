"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resetSidebarNavOrder,
  saveSidebarNavOrder,
} from "@/app/(dashboard)/account/actions";
import { cn } from "@/lib/utils";

export type SidebarOrderItem = {
  id: string;
  label: string;
};

type Props = {
  items: SidebarOrderItem[];
  /** 是否已保存过自定义顺序（用于「恢复默认」是否可用） */
  hasCustomOrder: boolean;
};

export function SidebarNavOrderSettings({ items, hasCustomOrder }: Props) {
  const router = useRouter();
  const [order, setOrder] = useState(items);
  const orderRef = useRef(order);
  orderRef.current = order;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrder(items);
  }, [items]);

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  function handleDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === overId) return;

    const prev = orderRef.current;
    const from = prev.findIndex((o) => o.id === draggingId);
    const to = prev.findIndex((o) => o.id === overId);
    if (from < 0 || to < 0) return;

    const next = [...prev];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  function handleSave() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await saveSidebarNavOrder(order.map((item) => item.id));
        setMessage("侧栏顺序已保存");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败");
      }
    });
  }

  function handleReset() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await resetSidebarNavOrder();
        setMessage("已恢复默认顺序");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "恢复失败");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium">侧栏顺序</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          拖动调整左侧功能入口顺序，仅对自己生效。保存后立即应用到侧栏。
        </p>
      </div>

      <ul className="space-y-1 rounded-md border p-2">
        {order.map((item) => (
          <li
            key={item.id}
            draggable
            onDragStart={() => handleDragStart(item.id)}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex cursor-grab items-center gap-2 rounded-md px-2 py-2 text-sm active:cursor-grabbing",
              draggingId === item.id ? "bg-muted opacity-70" : "hover:bg-muted/60"
            )}
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
          {pending ? "保存中…" : "保存顺序"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !hasCustomOrder}
          onClick={handleReset}
        >
          恢复默认
        </Button>
        {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
