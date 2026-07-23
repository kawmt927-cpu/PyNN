"use client";

import { Button } from "@/components/ui/button";
import { switchToMobileUi, switchToPcUi } from "@/app/(dashboard)/ui-mode-actions";

type Props = {
  target: "mobile" | "pc";
  className?: string;
  variant?: "ghost" | "outline" | "link" | "default" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
};

export function ClientModeSwitch({
  target,
  className,
  variant = "outline",
  size = "sm",
}: Props) {
  const label = target === "mobile" ? "切换到手机端" : "切换到电脑端";
  const action = target === "mobile" ? switchToMobileUi : switchToPcUi;

  return (
    <form action={action} className={className}>
      <Button type="submit" variant={variant} size={size} className="w-full">
        {label}
      </Button>
    </form>
  );
}
