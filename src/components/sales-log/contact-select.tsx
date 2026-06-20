"use client";

import { useEffect, useState } from "react";

export type ContactOption = {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  isPrimary: boolean;
};

export function ContactSelect({
  customerId,
  value,
  onChange,
}: {
  customerId: string;
  value: string;
  onChange: (value: string) => void;
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
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      <option value="">不指定联系人</option>
      {contacts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.title ? ` · ${c.title}` : ""}
          {c.isPrimary ? "（主联系人）" : ""}
        </option>
      ))}
    </select>
  );
}
