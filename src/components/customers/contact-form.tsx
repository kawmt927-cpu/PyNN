"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { SelectField } from "@/components/ui/select-field";
import { createContact, updateContact } from "@/app/(dashboard)/customers/actions";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { Contact } from "@prisma/client";

const fieldLabelClass = "flex min-h-9 items-center";

type Props = {
  customerId: string;
  contact?: Contact;
  onCancel?: () => void;
  titleOptions: ConfigOptionItem[];
  departmentOptions: ConfigOptionItem[];
  roleOptions: ConfigOptionItem[];
};

export function ContactForm({
  customerId,
  contact,
  onCancel,
  titleOptions,
  departmentOptions,
  roleOptions,
}: Props) {
  const [open, setOpen] = useState(!contact);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isEdit = Boolean(contact);

  if (!open && !isEdit) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        添加联系人
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const phone = (formData.get("phone") as string | null)?.trim() ?? "";
    const wechat = (formData.get("wechat") as string | null)?.trim() ?? "";
    if (!phone && !wechat) {
      setError("手机和微信至少填写一项");
      return;
    }

    startTransition(async () => {
      const result =
        isEdit && contact
          ? await updateContact(contact.id, formData)
          : await createContact(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (onCancel) {
        onCancel();
      } else {
        setOpen(false);
        form.reset();
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border p-4">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm font-medium">{isEdit ? "编辑联系人" : "新增联系人"}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name" className={fieldLabelClass}>
            姓名 *
          </Label>
          <Input id="contact-name" name="name" defaultValue={contact?.name ?? ""} required />
        </div>
        <SelectField
          id="contact-role"
          label="角色"
          name="role"
          options={roleOptions}
          defaultValue={contact?.role ?? roleOptions[0]?.value ?? "OTHER"}
          labelClassName={fieldLabelClass}
        />
        <ComboboxField
          id="contact-title"
          label="职务"
          name="title"
          options={titleOptions}
          defaultValue={contact?.title ?? ""}
          placeholder="选择或输入职务"
        />
        <ComboboxField
          id="contact-dept"
          label="科室/部门"
          name="department"
          options={departmentOptions}
          defaultValue={contact?.department ?? ""}
          placeholder="选择或输入科室/部门"
        />
        <div className="space-y-2">
          <Label htmlFor="contact-phone" className={fieldLabelClass}>
            手机
          </Label>
          <Input id="contact-phone" name="phone" defaultValue={contact?.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-wechat" className={fieldLabelClass}>
            微信
          </Label>
          <Input id="contact-wechat" name="wechat" defaultValue={contact?.wechat ?? ""} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">手机和微信至少填写一项。</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPrimary"
          value="true"
          defaultChecked={contact?.isPrimary ?? false}
        />
        设为主要联系人
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "保存中…" : isEdit ? "保存" : "添加"}
        </Button>
        {(onCancel || !isEdit) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => (onCancel ? onCancel() : setOpen(false))}
          >
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
