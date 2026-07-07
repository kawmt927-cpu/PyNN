"use client";

import { useEffect, useState } from "react";
import { SelectClearButton } from "@/components/ui/select-clear-button";
import { cn } from "@/lib/utils";

export type ContactOption = {
  id: string;
  name: string;
  title: string | null;
  department: string | null;
  phone: string | null;
  wechat: string | null;
  isPrimary: boolean;
};

export function ContactSelect({
  customerId,
  value,
  onChange,
  required,
}: {
  customerId: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  useEffect(() => {
    if (!customerId) {
      setContacts([]);
      onChange("");
      return;
    }
    fetch(`/api/customers/${customerId}/contacts`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items: ContactOption[] }) => {
        setContacts(data.items ?? []);
        if (value) return;
        const primary = data.items?.find((c) => c.isPrimary);
        if (primary) onChange(primary.id);
      })
      .catch(() => setContacts([]));
  }, [customerId]);

  if (!customerId) {
    return (
      <select disabled className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
        <option>请先选择客户</option>
      </select>
    );
  }

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          !required && value && "pr-9"
        )}
      >
        {!required && <option value="">不指定联系人</option>}
        {required && !value && (
          <option value="" disabled>
            请选择联系人
          </option>
        )}
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.title ? ` · ${c.title}` : ""}
            {c.isPrimary ? "（主联系人）" : ""}
          </option>
        ))}
      </select>
      {!required ? (
        <SelectClearButton
          value={value}
          ariaLabel="清除联系人"
          onClear={() => onChange("")}
        />
      ) : null}
    </div>
  );
}
