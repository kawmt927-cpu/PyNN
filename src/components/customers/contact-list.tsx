"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { labelForConfig } from "@/lib/config-options";
import { CONTACT_ROLE_LABELS } from "@/lib/permissions";
import { ContactForm } from "./contact-form";
import { deleteContact } from "@/app/(dashboard)/customers/actions";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { Contact } from "@prisma/client";

type Props = {
  customerId: string;
  contacts: Contact[];
  readOnly?: boolean;
  titleOptions: ConfigOptionItem[];
  departmentOptions: ConfigOptionItem[];
  roleOptions: ConfigOptionItem[];
};

export function ContactList({
  customerId,
  contacts,
  readOnly,
  titleOptions,
  departmentOptions,
  roleOptions,
}: Props) {
  const roleLabelMap = Object.fromEntries(roleOptions.map((opt) => [opt.value, opt.label]));
  for (const [value, label] of Object.entries(CONTACT_ROLE_LABELS)) {
    if (!roleLabelMap[value]) roleLabelMap[value] = label;
  }
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无联系人</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id}>
                <ContactForm
                  customerId={customerId}
                  contact={c}
                  onCancel={() => setEditingId(null)}
                  titleOptions={titleOptions}
                  departmentOptions={departmentOptions}
                  roleOptions={roleOptions}
                />
              </li>
            ) : (
              <li key={c.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {c.name}
                      {c.isPrimary && (
                        <span className="ml-2 text-xs text-primary">主要</span>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {labelForConfig(roleLabelMap, c.role)}
                      {[c.title, c.department].filter(Boolean).length > 0 &&
                        ` · ${[c.title, c.department].filter(Boolean).join(" · ")}`}
                    </p>
                    <p>
                      {[c.phone, c.wechat].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!readOnly && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingId(c.id)}
                        >
                          编辑
                        </Button>
                        <form action={deleteContact}>
                          <input type="hidden" name="contactId" value={c.id} />
                          <input type="hidden" name="customerId" value={customerId} />
                          <Button type="submit" variant="ghost" size="sm">
                            删除
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </li>
            )
          )}
        </ul>
      )}

      {!readOnly && !editingId && (
        <ContactForm
          customerId={customerId}
          titleOptions={titleOptions}
          departmentOptions={departmentOptions}
          roleOptions={roleOptions}
        />
      )}
    </div>
  );
}
