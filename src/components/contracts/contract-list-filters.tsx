"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CONTRACT_STATUS_LABELS } from "@/lib/permissions";
import type { ContractStatus } from "@prisma/client";

type UserOption = { id: string; name: string };

type Props = {
  showOwnerFilter: boolean;
  salesUsers: UserOption[];
};

export function ContractListFilters({ showOwnerFilter, salesUsers }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `/contracts?${qs}` : "/contracts");
    });
  }

  function updateParam(key: string, value: string) {
    pushParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
  }

  function clearAll() {
    startTransition(() => router.push("/contracts"));
  }

  const hasActive =
    Boolean(searchParams.get("q")) ||
    Boolean(searchParams.get("status")) ||
    Boolean(searchParams.get("ownerId"));

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        updateParam("q", String(form.get("q") ?? "").trim());
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="contract-q">搜索</Label>
        <Input
          id="contract-q"
          name="q"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="合同名称 / 编号 / 客户"
          className="h-10 w-[220px]"
          disabled={pending}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="contract-status">状态</Label>
        <select
          id="contract-status"
          className="flex h-10 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={searchParams.get("status") ?? ""}
          disabled={pending}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          <option value="">全部状态</option>
          {(Object.keys(CONTRACT_STATUS_LABELS) as ContractStatus[]).map((status) => (
            <option key={status} value={status}>
              {CONTRACT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      {showOwnerFilter ? (
        <div className="space-y-1">
          <Label htmlFor="contract-owner">负责销售</Label>
          <select
            id="contract-owner"
            className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={searchParams.get("ownerId") ?? ""}
            disabled={pending}
            onChange={(e) => updateParam("ownerId", e.target.value)}
          >
            <option value="">全部</option>
            {salesUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Button type="submit" size="sm" disabled={pending}>
        搜索
      </Button>
      {hasActive ? (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={clearAll}>
          清除
        </Button>
      ) : null}
    </form>
  );
}
