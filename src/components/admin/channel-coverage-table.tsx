"use client";

import Link from "next/link";
import type { ProvinceChannelRow } from "@/lib/admin/channel-dashboard";
import {
  CHANNEL_KIND_COVERAGE_KEYS,
  type ChannelCoverageKind,
} from "@/lib/customers/channel-kind";
import { cn } from "@/lib/utils";

type Props = {
  rows: ProvinceChannelRow[];
  kindLabels: Record<string, string>;
  gradeLabels: Record<string, string>;
};

const KIND_ORDER: ChannelCoverageKind[] = [...CHANNEL_KIND_COVERAGE_KEYS];

export function ChannelCoverageTable({ rows, kindLabels }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="sticky left-0 bg-muted/50 px-3 py-2 font-medium">省份</th>
            {KIND_ORDER.map((k) => (
              <th key={k} className="px-3 py-2 font-medium whitespace-nowrap">
                {kindLabels[k] ?? k}
                <span className="block text-xs font-normal text-muted-foreground">
                  实际/目标
                </span>
              </th>
            ))}
            <th className="px-3 py-2 font-medium">覆盖</th>
            <th className="px-3 py-2 font-medium">其他</th>
            <th className="px-3 py-2 font-medium">合计</th>
            <th className="px-3 py-2 font-medium">活跃</th>
            <th className="px-3 py-2 font-medium">沉寂</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                暂无渠道客户
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.province} className="border-t">
                <td className="sticky left-0 bg-background px-3 py-2 font-medium">
                  <Link
                    href={`/customers?type=CHANNEL&province=${encodeURIComponent(row.province === "未填省份" ? "" : row.province)}`}
                    className="text-primary hover:underline"
                  >
                    {row.province}
                  </Link>
                </td>
                {KIND_ORDER.map((k) => {
                  const c = row.coverage[k];
                  return (
                    <td
                      key={k}
                      className={cn(
                        "px-3 py-2 tabular-nums",
                        !c.met && "text-red-600 font-medium"
                      )}
                    >
                      {c.actual}/{c.target}
                      {!c.met ? (
                        <span className="ml-1 text-xs text-red-500">差{c.gap}</span>
                      ) : null}
                    </td>
                  );
                })}
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs",
                      row.isCovered
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-900"
                    )}
                  >
                    {row.metKinds}/3
                    {row.isCovered ? " 达标" : " 缺口"}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums">{row.otherCount}</td>
                <td className="px-3 py-2 tabular-nums">{row.total}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-700">
                  {row.activeCount}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {row.inactiveCount}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        「其他」含原运营商口径，不计入覆盖目标。先看三类是否达标，再看活跃/沉寂。
      </p>
    </div>
  );
}
