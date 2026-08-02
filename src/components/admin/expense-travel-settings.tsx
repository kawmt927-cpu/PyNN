"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExpenseCityTier } from "@prisma/client";
import type { ExpenseTravelPolicyAdminView } from "@/lib/expenses/travel-policy";
import { EXPENSE_CITY_TIER_LABELS } from "@/lib/expenses/travel-policy";
import {
  addExpenseCityTierMapping,
  removeExpenseCityTierMapping,
  saveExpenseTravelPolicy,
} from "@/app/(dashboard)/admin/settings/actions";

type Props = {
  initial: ExpenseTravelPolicyAdminView;
};

const TIERS: ExpenseCityTier[] = ["TIER_1", "TIER_2", "TIER_3"];

export function ExpenseTravelSettings({ initial }: Props) {
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作失败");
      }
    });
  }

  return (
    <div className="space-y-8">
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">差旅住宿标准</p>
        <p className="mt-1">
          按城市线级设置每晚住宿上限。报销填写目的地城市时会提示对应标准；未收录城市按「三线城市及以下」处理。
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveExpenseTravelPolicy(fd), "住宿标准已保存");
        }}
      >
        <h3 className="text-sm font-medium">住宿上限（元/晚）</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => {
            const name =
              tier === "TIER_1"
                ? "hotelCapTier1"
                : tier === "TIER_2"
                  ? "hotelCapTier2"
                  : "hotelCapTier3";
            const value =
              tier === "TIER_1"
                ? initial.hotelCapTier1
                : tier === "TIER_2"
                  ? initial.hotelCapTier2
                  : initial.hotelCapTier3;
            return (
              <div key={tier} className="space-y-2">
                <Label htmlFor={name}>{EXPENSE_CITY_TIER_LABELS[tier]}</Label>
                <Input
                  id={name}
                  name={name}
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={value}
                  required
                />
              </div>
            );
          })}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存住宿标准"}
        </Button>
      </form>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">城市线级名单</h3>
        <div className="grid gap-4 lg:grid-cols-3">
          {TIERS.map((tier) => {
            const cities = initial.cities.filter((c) => c.tier === tier);
            return (
              <div key={tier} className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">{EXPENSE_CITY_TIER_LABELS[tier]}</p>
                <ul className="mb-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                  {cities.length === 0 ? (
                    <li className="text-muted-foreground">暂无城市</li>
                  ) : (
                    cities.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                      >
                        <span>{c.cityName}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => removeExpenseCityTierMapping(c.id),
                              `已移除 ${c.cityName}`
                            )
                          }
                        >
                          移除
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    fd.set("tier", tier);
                    run(() => addExpenseCityTierMapping(fd), "城市已添加");
                    e.currentTarget.reset();
                  }}
                >
                  <Input name="cityName" placeholder="城市名，如：武汉" required className="h-9" />
                  <Button type="submit" size="sm" disabled={pending}>
                    添加
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
      </div>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
