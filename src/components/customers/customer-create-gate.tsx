"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import type { CustomerCategory } from "@prisma/client";
import { cn } from "@/lib/utils";

export type CustomerCreateGateHit = {
  id: string;
  name: string;
  category?: string;
  writable?: boolean;
  ownerName?: string | null;
  matchedContactName?: string | null;
  matchedContactTitle?: string | null;
};

type Props = {
  initialQuery?: string;
  /** 选中已有客户（本人可写） */
  onSelectExisting: (hit: CustomerCreateGateHit) => void;
  /** 确认无匹配后进入新建 */
  onContinueCreate: (name: string) => void;
  className?: string;
};

async function searchCustomers(q: string): Promise<CustomerCreateGateHit[]> {
  const params = new URLSearchParams({ q, mode: "form", scope: "writable" });
  const res = await fetch(`/api/customers/suggest?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: CustomerCreateGateHit[] };
  return data.items ?? [];
}

/** 新建客户前强制全库搜索，避免重复建档 */
export function CustomerCreateGate({
  initialQuery = "",
  onSelectExisting,
  onContinueCreate,
  className,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<CustomerCreateGateHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  function runSearch(nextQuery?: string) {
    const q = (nextQuery ?? query).trim();
    setError(null);
    if (q.length < 2) {
      setError("请至少输入 2 个字再搜索");
      setHits([]);
      setSearched(false);
      return;
    }
    startTransition(async () => {
      const items = await searchCustomers(q);
      setHits(items);
      setSearched(true);
    });
  }

  function requestCreate() {
    const q = query.trim();
    if (q.length < 2) {
      setError("请至少输入 2 个字");
      return;
    }
    if (!searched) {
      setError("请先搜索，确认库中无匹配后再新建");
      return;
    }
    const exactWritable = hits.find(
      (h) => h.name.trim() === q && h.writable !== false
    );
    if (exactWritable) {
      onSelectExisting(exactWritable);
      return;
    }
    if (
      hits.some(
        (h) =>
          h.writable === false && (h.name.trim() === q || similarName(h.name, q))
      )
    ) {
      setError("已存在同名或相近客户且非你负责，请勿重复建档；可联系销管协调协助负责人。");
      return;
    }
    setConfirmOpen(true);
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        新建前请先全库搜索。已有客户请直接打开；他人负责的不可再建档。
      </div>

      <div className="space-y-2">
        <Label htmlFor="customer-create-gate-q">客户名称</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="customer-create-gate-q"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearched(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
            placeholder="输入医院 / 公司 / 个人名称"
            className="min-w-[12rem] flex-1"
          />
          <Button type="button" disabled={pending} onClick={() => runSearch()}>
            {pending ? "搜索中…" : "搜索"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {searched ? (
        hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">未找到匹配客户，可继续新建。</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
            {hits.map((hit) => {
              const writable = hit.writable !== false;
              const categoryLabel = hit.category
                ? CUSTOMER_CATEGORY_LABELS[hit.category as CustomerCategory]
                : null;
              const contactHint = hit.matchedContactName
                ? hit.matchedContactTitle
                  ? `联系人：${hit.matchedContactName}（${hit.matchedContactTitle}）`
                  : `联系人：${hit.matchedContactName}`
                : null;
              return (
                <li
                  key={hit.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-2 rounded-md px-2 py-2",
                    writable ? "hover:bg-muted/50" : "bg-muted/30 opacity-90"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{hit.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        categoryLabel,
                        writable
                          ? null
                          : hit.ownerName
                            ? `负责人：${hit.ownerName}`
                            : "他人负责",
                        contactHint,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {writable ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => onSelectExisting(hit)}
                    >
                      选择
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">不可再建</span>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending || query.trim().length < 2}
          onClick={requestCreate}
        >
          未找到，继续新建
        </Button>
        {!searched ? (
          <p className="self-center text-xs text-muted-foreground">请先搜索再新建</p>
        ) : null}
      </div>

      <ConfirmDestructiveDialog
        open={confirmOpen}
        title="确认新建客户"
        message={`确认库中没有「${query.trim()}」后继续新建？若已有同名客户将被系统拦截。`}
        confirmLabel="继续新建"
        variant="default"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onContinueCreate(query.trim());
        }}
      />
    </div>
  );
}

function similarName(a: string, b: string) {
  const left = a.replace(/\s+/g, "");
  const right = b.replace(/\s+/g, "");
  return left.includes(right) || right.includes(left);
}

/** 新建页：先搜后表单 */
export function CustomerNewGateShell({
  form,
  detailHrefPrefix = "/customers",
}: {
  form: (lockedName: string) => ReactNode;
  detailHrefPrefix?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"search" | "create">("search");
  const [lockedName, setLockedName] = useState("");

  if (step === "create") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            已确认搜索无匹配，正在新建「{lockedName}」
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setStep("search")}>
            返回搜索
          </Button>
        </div>
        {form(lockedName)}
      </div>
    );
  }

  return (
    <CustomerCreateGate
      onSelectExisting={(hit) => {
        router.push(`${detailHrefPrefix}/${hit.id}`);
      }}
      onContinueCreate={(name) => {
        setLockedName(name);
        setStep("create");
      }}
    />
  );
}
