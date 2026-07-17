"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function MobileSearchForm({
  action,
  placeholder,
  defaultValue = "",
  paramName = "q",
}: {
  action: string;
  placeholder: string;
  defaultValue?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const q = String(fd.get(paramName) ?? "").trim();
        const url = q ? `${action}?${paramName}=${encodeURIComponent(q)}` : action;
        startTransition(() => router.push(url));
      }}
    >
      <Input
        name={paramName}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-9"
        enterKeyHint="search"
      />
      <Button type="submit" size="sm" disabled={pending} className="shrink-0">
        搜索
      </Button>
    </form>
  );
}
