"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DailyReportBody } from "@/components/daily-reports/daily-report-body";
import { DailyReportRiskReason } from "@/components/daily-reports/daily-report-risk-reason";

type Props = {
  userName: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  content: string;
  preview: string;
  riskFlag?: boolean;
  riskNotes?: string | null;
  /** 深链打开时默认弹出详情 */
  defaultOpen?: boolean;
};

export function DailyReportPreviewWithDialog({
  userName,
  title,
  subtitle,
  meta,
  content,
  preview,
  riskFlag,
  riskNotes,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const description = [subtitle, meta].filter(Boolean).join(" · ");

  return (
    <div className="space-y-1.5">
      <DailyReportRiskReason riskFlag={riskFlag} riskNotes={riskNotes} compact />
      <p className="line-clamp-3 text-sm text-muted-foreground">{preview}</p>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 py-0 text-sm"
        onClick={() => setOpen(true)}
      >
        查看详情
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          scrollable
          className="max-h-[85vh] max-w-lg"
        >
          <DialogHeader className="pr-8">
            <DialogTitle className="text-base">
              {userName} · {title}
            </DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">日报全文</DialogDescription>
            )}
          </DialogHeader>
          <DailyReportRiskReason
            riskFlag={riskFlag}
            riskNotes={riskNotes}
            className="mt-3"
          />
          <DailyReportBody content={content} className="mt-4" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
