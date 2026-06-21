"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { QuickContactDialog } from "@/components/sales-log/quick-contact-dialog";
import type { ContactOption } from "@/components/sales-log/contact-select";

export function ContactSelectField({
  customerId,
  value,
  onChange,
  required = false,
  initialName = "",
}: {
  customerId: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  initialName?: string;
}) {
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");

  const loadContacts = useCallback(async () => {
    if (!customerId) {
      setContacts([]);
      return;
    }
    try {
      const res = await fetch(`/api/customers/${customerId}/contacts`, { credentials: "include" });
      const data = (await res.json()) as { items: ContactOption[] };
      setContacts(data.items ?? []);
    } catch {
      setContacts([]);
    }
  }, [customerId]);

  useEffect(() => {
    if (!customerId) {
      setContacts([]);
      onChange("");
      return;
    }
    onChange("");
    void loadContacts();
  }, [customerId, loadContacts, onChange]);

  function openCreateContact(name = "") {
    setNewContactName(name);
    setDialogOpen(true);
  }

  if (!customerId) {
    return (
      <div className="space-y-2">
        <Label>联系人{required ? " *" : ""}</Label>
        <select disabled className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
          <option>请先选择客户</option>
        </select>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="interactionContact">联系人{required ? " *" : ""}</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => openCreateContact()}>
            新增联系人
          </Button>
        </div>
        <select
          id="interactionContact"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">{required ? "请选择联系人" : "不指定联系人"}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.title ? ` · ${c.title}` : ""}
              {c.phone ? ` · ${c.phone}` : ""}
              {c.isPrimary ? "（主联系人）" : ""}
            </option>
          ))}
        </select>
        {required && contacts.length === 0 ? (
          <p className="text-xs text-orange-600">
            该客户暂无联系人，请点击「新增联系人」添加。
          </p>
        ) : null}
      </div>

      <QuickContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customerId={customerId}
        initialName={newContactName || initialName}
        onCreated={(contact) => {
          void loadContacts().then(() => onChange(contact.id));
        }}
      />
    </>
  );
}
