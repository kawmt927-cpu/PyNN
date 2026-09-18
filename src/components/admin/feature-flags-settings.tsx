"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveExpenseFeatureFlag } from "@/app/(dashboard)/admin/settings/actions";

type Props = {
  initial: {
    expenseReimbursementEnabled: boolean;
    updatedAt: Date | string;
    updatedByName: string | null;
    envOverride: boolean | null;
  };
};

export function FeatureFlagsSettings({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initial.expenseReimbursementEnabled);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lockedByEnv = initial.envOverride !== null;

  function handleSave() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("expenseReimbursementEnabled", enabled ? "1" : "0");
        await saveExpenseFeatureFlag(fd);
        setMessage("已保存");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">功能开关</p>
        <p className="mt-1">
          报销为正式能力，默认开启。此处可临时关闭；也可用环境变量{" "}
          <code className="text-xs">ENABLE_EXPENSE_REIMBURSEMENT=false</code>{" "}
          紧急关停。
        </p>
      </div>

      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">成本台账 · 外部财务对接（规划）</p>
        <p className="mt-1">
          当前「成本台账」汇总 CRM 内外部合同成本、已关账人力、已打款报销与销售费用，便于经营对账。后续可对接外部财务/ERP 做凭证同步与双向核对；在此之前以本系统台账为准。
        </p>
      </div>

      {lockedByEnv ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          当前被环境变量{" "}
          <code className="text-xs">ENABLE_EXPENSE_REIMBURSEMENT</code> 强制为{" "}
          {initial.envOverride ? "开启" : "关闭"}，后台开关暂不生效。清除该环境变量后以本页为准。
        </p>
      ) : null}

      <div className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label className="text-base">报销模块</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              关闭后侧栏与审批中心隐藏报销入口；含申请、审批、打款及差旅/费用细类配置。
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              disabled={lockedByEnv || pending}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {enabled ? "已开启" : "已关闭"}
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          上次更新：
          {initial.updatedByName ? `${initial.updatedByName} · ` : ""}
          {new Date(initial.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
        </p>
        <Button type="button" disabled={lockedByEnv || pending} onClick={handleSave}>
          {pending ? "保存中…" : "保存"}
        </Button>
        {message ? <p className="text-sm text-green-700">{message}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
