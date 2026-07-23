"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type CheckInGuideStepId =
  | "mode"
  | "customer"
  | "entry"
  | "content"
  | "nextPlan"
  | "location"
  | "submit";

export const CHECK_IN_GUIDE_TIPS: Record<CheckInGuideStepId, string> = {
  mode: "第 1 步：请先选择打卡类型",
  customer: "第 2 步：请选择客户，并至少选择一位联系人",
  entry: "第 3 步：请选择往来录入方式",
  content: "第 4 步：请填写往来方式与往来内容",
  nextPlan: "请填写下次往来计划（方式、时间、目的和内容）后再继续",
  location: "下一步：请获取定位（可选；也可点下方「暂时跳过定位」）",
  submit: "最后一步：检查无误后点击提交",
};

type GuideSectionProps = {
  stepId: CheckInGuideStepId;
  active: boolean;
  className?: string;
  /** 用户开始操作本区块时回调（用于自动跳过已默认的前置步骤） */
  onEngage?: () => void;
  children: React.ReactNode;
};

/** 当前步骤外框高亮，并在切入时滚入视野 */
export function CheckInGuideSection({
  stepId,
  active,
  className,
  onEngage,
  children,
}: GuideSectionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [active, stepId]);

  return (
    <div
      ref={ref}
      data-guide-step={stepId}
      onPointerDownCapture={onEngage}
      onFocusCapture={onEngage}
      className={cn(
        "rounded-xl transition-[box-shadow,background-color,padding] duration-200",
        active && "bg-primary/5 p-3 ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CheckInGuideBanner({
  tip,
  stepIndex,
  stepCount,
  onSkip,
  className,
  children,
}: {
  tip: string;
  stepIndex: number;
  stepCount: number;
  onSkip?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-b border-primary/30 bg-primary/10 text-sm text-primary shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <p className="min-w-0 font-medium">
          <span className="mr-1 tabular-nums opacity-80">
            {stepIndex}/{stepCount}
          </span>
          {tip}
        </p>
        {onSkip ? (
          <button
            type="button"
            className="shrink-0 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
            onClick={onSkip}
          >
            关闭引导
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
