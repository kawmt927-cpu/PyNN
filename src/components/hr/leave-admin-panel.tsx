"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cancelLeaveAction,
  createLeaveAction,
} from "@/app/(dashboard)/hr/leaves/actions";

type Props = {
  year: number;
  month: number;
  types: { id: string; key: string; label: string; payFactor: number }[];
  users: { id: string; name: string; role: string }[];
  leaves: {
    id: string;
    userName: string;
    typeLabel: string;
    payFactor: number;
    startDayKey: string;
    endDayKey: string;
    source: string;
    note: string | null;
  }[];
};

export function LeaveAdminPanel({ year, month, types, users, leaves }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ym = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          className="underline"
          href={`/hr/leaves?year=${month === 1 ? year - 1 : year}&month=${month === 1 ? 12 : month - 1}`}
        >
          上一月
        </Link>
        <span className="font-medium">{ym}</span>
        <Link
          className="underline"
          href={`/hr/leaves?year=${month === 12 ? year + 1 : year}&month=${month === 12 ? 1 : month + 1}`}
        >
          下一月
        </Link>
      </div>

      <form
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const res = await createLeaveAction(fd);
            if (!res.error) {
              e.currentTarget.reset();
              router.refresh();
            } else {
              alert(res.error);
            }
          });
        }}
      >
        <div className="space-y-1 sm:col-span-2">
          <p className="text-sm font-medium">登记请假</p>
          <p className="text-xs text-muted-foreground">
            假种计薪：
            {types.map((t) => `${t.label} ${(t.payFactor * 100).toFixed(0)}%`).join(" · ")}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="userId">人员</Label>
          <select
            id="userId"
            name="userId"
            required
            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">选择</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="leaveTypeId">假种</Label>
          <select
            id="leaveTypeId"
            name="leaveTypeId"
            required
            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}（计薪 {(t.payFactor * 100).toFixed(0)}%）
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="startDayKey">开始</Label>
          <Input id="startDayKey" name="startDayKey" type="date" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endDayKey">结束</Label>
          <Input id="endDayKey" name="endDayKey" type="date" required />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="note">备注</Label>
          <Input id="note" name="note" placeholder="可选" />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            保存请假
          </Button>
        </div>
      </form>

      <ul className="space-y-2 text-sm">
        {leaves.length === 0 ? (
          <li className="text-muted-foreground">本月暂无请假记录</li>
        ) : (
          leaves.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div>
                <p className="font-medium">
                  {l.userName} · {l.typeLabel}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    计薪 {(l.payFactor * 100).toFixed(0)}% · {l.source}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.startDayKey} ~ {l.endDayKey}
                  {l.note ? ` · ${l.note}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("leaveId", l.id);
                  startTransition(async () => {
                    await cancelLeaveAction(fd);
                    router.refresh();
                  });
                }}
              >
                取消
              </Button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
