"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { CONTACT_ROLE_LABELS } from "@/lib/permissions";
import { createContact, updateContact } from "@/app/(dashboard)/customers/actions";
import type { Contact, ContactRole } from "@prisma/client";

const roleOptions = Object.entries(CONTACT_ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

type Props = {
  customerId: string;
  contact?: Contact;
  onCancel?: () => void;
};

export function ContactForm({ customerId, contact, onCancel }: Props) {
  const [open, setOpen] = useState(!contact);
  const isEdit = Boolean(contact);
  const action = isEdit && contact ? updateContact.bind(null, contact.id) : createContact;

  if (!open && !isEdit) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        添加联系人
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-md border p-4">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm font-medium">{isEdit ? "编辑联系人" : "新增联系人"}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">姓名 *</Label>
          <Input id="contact-name" name="name" defaultValue={contact?.name ?? ""} required />
        </div>
        <SelectField
          id="contact-role"
          label="角色"
          name="role"
          options={roleOptions}
          defaultValue={contact?.role ?? "OTHER"}
        />
        <div className="space-y-2">
          <Label htmlFor="contact-title">职务</Label>
          <Input id="contact-title" name="title" defaultValue={contact?.title ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-dept">科室/部门</Label>
          <Input id="contact-dept" name="department" defaultValue={contact?.department ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-phone">手机</Label>
          <Input id="contact-phone" name="phone" defaultValue={contact?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">邮箱</Label>
          <Input id="contact-email" name="email" type="email" defaultValue={contact?.email ?? ""} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPrimary"
          value="true"
          defaultChecked={contact?.isPrimary ?? false}
        />
        设为主要联系人
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {isEdit ? "保存" : "添加"}
        </Button>
        {(onCancel || !isEdit) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => (onCancel ? onCancel() : setOpen(false))}
          >
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
