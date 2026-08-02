"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dailyLogId: string;
  date: string;
  dayLabel?: string;
};

export function DailyLogMakeupDialog({
  open,
  onOpenChange,
  dailyLogId,
  date,
  dayLabel,
}: Props) {
  const router = useRouter();
  const [dailyReport, setDailyReport] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/mobile/log/makeup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyLogId,
          date,
          dailyReport,
          tomorrowPlan,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
        conversationCleared?: boolean;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "补录失败，请稍后重试");
        return;
      }
      onOpenChange(false);
      setDailyReport("");
      setTomorrowPlan("");
      router.refresh();
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90dvh] max-w-lg overflow-y-auto sm:max-w-lg"
        scrollable
      >
        <DialogHeader>
          <DialogTitle>补录日报{dayLabel ? ` · ${dayLabel}` : ""}</DialogTitle>
          <DialogDescription>
            填写今日工作总结与明日计划后提交。补录后记为迟交，不改变已锁定的迟交统计。
            若该日已超出近 7 天对话保留期，提交后会清除 AI 对话记录。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="makeup-daily-report">今日工作总结</Label>
            <Textarea
              id="makeup-daily-report"
              value={dailyReport}
              onChange={(e) => setDailyReport(e.target.value)}
              placeholder="见了谁、沟通了什么、有何进展…"
              rows={6}
              required
              className="min-h-[120px] resize-y"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="makeup-tomorrow-plan">明日计划</Label>
            <Textarea
              id="makeup-tomorrow-plan"
              value={tomorrowPlan}
              onChange={(e) => setTomorrowPlan(e.target.value)}
              placeholder="具体事项与预计成果（必填）"
              rows={3}
              required
              className="min-h-[72px] resize-y"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "提交中…" : "提交补录"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
