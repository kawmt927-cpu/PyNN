"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { ScrollChainList } from "@/components/ui/scroll-chain";
import { ProvinceCityPicker } from "@/components/geo/province-city-picker";

type Props = {
  initial: ExpenseTravelPolicyAdminView;
};

/** 仅配置一、二线；未列入名单的城市一律按三线 */
const LIST_TIERS: ExpenseCityTier[] = ["TIER_1", "TIER_2"];
const CAP_TIERS: ExpenseCityTier[] = ["TIER_1", "TIER_2", "TIER_3"];

export function ExpenseTravelSettings({ initial }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addCity, setAddCity] = useState<Record<string, string>>({
    TIER_1: "",
    TIER_2: "",
  });

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
    <div className="space-y-8">
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">城市划分与住宿标准</p>
        <p className="mt-1">
          指定一线、二线城市名单；未列入的城市均按三线处理。各线级设置每晚住宿最高标准后，差旅报销中住宿类费用合计若超过「行程晚数
          × 对应城市每晚上限」，须填写备注说明原因，经二次确认仍可提交，审核人将看到超标提示。
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">1. 城市划分</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            只需维护一线、二线城市；其余城市自动为三线。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {LIST_TIERS.map((tier) => {
            const cities = initial.cities.filter((c) => c.tier === tier && c.enabled);
            return (
              <div key={tier} className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">{EXPENSE_CITY_TIER_LABELS[tier]}</p>
                <ScrollChainList className="mb-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                  {cities.length === 0 ? (
                    <li className="text-muted-foreground">暂无，请下方添加</li>
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
                          className="text-destructive"
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
                </ScrollChainList>
                <form
                  className="flex flex-col gap-2 sm:flex-row sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const cityName = addCity[tier]?.trim();
                    if (!cityName) return;
                    const fd = new FormData();
                    fd.set("tier", tier);
                    fd.set("cityName", cityName);
                    run(async () => {
                      await addExpenseCityTierMapping(fd);
                      setAddCity((prev) => ({ ...prev, [tier]: "" }));
                    }, `已加入${EXPENSE_CITY_TIER_LABELS[tier]}：${cityName}`);
                  }}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">添加城市</Label>
                    <ProvinceCityPicker
                      name="cityName"
                      value={addCity[tier] ?? ""}
                      placeholder="省市选择"
                      onValueChange={(city) =>
                        setAddCity((prev) => ({ ...prev, [tier]: city }))
                      }
                    />
                  </div>
                  <Button type="submit" size="sm" className="h-9 shrink-0" disabled={pending}>
                    添加
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">2. 住宿标准（元/晚）</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            按线级设置每晚最高可报金额；住宿类报销不得超过行程对应标准合计。
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
          <div className="grid gap-4 md:grid-cols-3">
            {CAP_TIERS.map((tier) => {
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
      </section>

      {message ? <p className="text-sm text-green-600">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
