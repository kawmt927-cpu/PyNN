"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function MobileSearchForm({
  action,
  placeholder,
  defaultValue = "",
  paramName = "q",
  trailing,
}: {
  action: string;
  placeholder: string;
  defaultValue?: string;
  paramName?: string;
  /** 放在搜索按钮右侧，例如「新增」 */
  trailing?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex items-center gap-2"
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
        className="h-9 min-w-0 flex-1"
        enterKeyHint="search"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="shrink-0">
        {pending ? "…" : "搜索"}
      </Button>
      {trailing}
    </form>
  );
}
