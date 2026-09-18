"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CONTRACT_LIST_STATUS_LABELS, type ContractListStatus } from "@/lib/permissions";
import {
  COLLECT_FILTER_OPTIONS,
  DUE_WITHIN_FILTER_OPTIONS,
  SETTLEMENT_FILTER_OPTIONS,
} from "@/lib/contracts/list-filters";

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
    // 回到默认：仅「未完成」（不写 settlement）
    startTransition(() => router.push("/contracts"));
  }

  const settlement = searchParams.get("settlement") || "open";
  const settled = settlement === "settled";
  const hasActive =
    Boolean(searchParams.get("q")) ||
    Boolean(searchParams.get("status")) ||
    Boolean(searchParams.get("ownerId")) ||
    settlement !== "open" ||
    (!settled && Boolean(searchParams.get("collect"))) ||
    Boolean(searchParams.get("dueWithin"));

  const listStatuses = Object.keys(CONTRACT_LIST_STATUS_LABELS) as ContractListStatus[];

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
        <Label htmlFor="contract-settlement">完成度</Label>
        <select
          id="contract-settlement"
          className="flex h-10 min-w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={settlement}
          disabled={pending}
          onChange={(e) => {
            const value = e.target.value;
            pushParams((params) => {
              if (value === "open") params.delete("settlement");
              else params.set("settlement", value);
              // 已结清无再催收态势
              if (value === "settled") params.delete("collect");
            });
          }}
        >
          {SETTLEMENT_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="contract-collect">催收态势</Label>
        <select
          id="contract-collect"
          className="flex h-10 min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={settled ? "" : (searchParams.get("collect") ?? "")}
          disabled={pending || settled}
          title={settled ? "已结清时无需按催收态势筛选" : undefined}
          onChange={(e) => updateParam("collect", e.target.value)}
        >
          <option value="">{settled ? "不适用" : "全部态势"}</option>
          {COLLECT_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="contract-due">计划窗口</Label>
        <select
          id="contract-due"
          className="flex h-10 min-w-[130px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={searchParams.get("dueWithin") ?? ""}
          disabled={pending}
          onChange={(e) => updateParam("dueWithin", e.target.value)}
        >
          <option value="">不限</option>
          {DUE_WITHIN_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="contract-status">合同状态</Label>
        <select
          id="contract-status"
          className="flex h-10 min-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={searchParams.get("status") ?? ""}
          disabled={pending}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          <option value="">全部状态</option>
          {listStatuses.map((status) => (
            <option key={status} value={status}>
              {CONTRACT_LIST_STATUS_LABELS[status]}
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
