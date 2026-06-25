"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckInForm } from "@/components/sales-log/check-in-form";
import { InteractionLogForm } from "@/components/sales-log/interaction-log-form";
import type { ConfigOptionItem } from "@/lib/config-options";

export { CheckInForm };

export function ManualLogForm({
  formOptions,
}: {
  formOptions: { stageOptions: ConfigOptionItem[]; gradeOptions: ConfigOptionItem[] };
}) {
  return <InteractionLogForm formOptions={formOptions} />;
}

export function AiLogLink() {
  return (
    <Button asChild>
      <Link href="/mobile/log">结束一天 · AI 完善日志</Link>
    </Button>
  );
}
