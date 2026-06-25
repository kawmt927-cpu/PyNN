"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
};

export function CopyWeComUserIdButton({ userId }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopy()}>
      {copied ? "已复制" : "复制 UserID"}
    </Button>
  );
}
