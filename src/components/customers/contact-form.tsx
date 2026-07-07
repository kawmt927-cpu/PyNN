"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { SelectField } from "@/components/ui/select-field";
import {
  createContactFormAction,
  updateContactFormAction,
} from "@/app/(dashboard)/customers/contact-actions";
import type { ActionResult } from "@/lib/action-result";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { Contact } from "@prisma/client";
import { cn } from "@/lib/utils";

const fieldLabelClass = "flex min-h-9 items-center";

type Props = {
  customerId: string;
  contact?: Contact;
  onCancel?: () => void;
  onSuccess?: () => void;
  titleOptions: ConfigOptionItem[];
  departmentOptions: ConfigOptionItem[];
  roleOptions: ConfigOptionItem[];
  embedded?: boolean;
};

export function ContactForm({
  customerId,
  contact,
  onCancel,
  onSuccess,
  titleOptions,
  departmentOptions,
  roleOptions,
  embedded = false,
}: Props) {
  const router = useRouter();
  const isEdit = Boolean(contact);
  const [isPrimaryChecked, setIsPrimaryChecked] = useState(contact?.isPrimary ?? false);

  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    isEdit && contact
      ? updateContactFormAction.bind(null, contact.id)
      : createContactFormAction,
    null
  );

  useEffect(() => {
    if (pending || state === null) return;
    if (state.error) return;
    onSuccess?.();
    onCancel?.();
    router.refresh();
  }, [pending, state, onSuccess, onCancel, router]);

  return (
    <form
      action={formAction}
      className={cn("space-y-3", !embedded && "rounded-md border p-4")}
    >
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="isPrimary" value={isPrimaryChecked ? "true" : "false"} />
      {!embedded ? (
        <p className="text-sm font-medium">{isEdit ? "编辑联系人" : "新增联系人"}</p>
      ) : null}
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
          checked={isPrimaryChecked}
          onChange={(event) => setIsPrimaryChecked(event.target.checked)}
        />
        设为主要联系人
      </label>
      {isPrimaryChecked ? (
        <p className="text-xs text-muted-foreground">
          保存后将取消其他联系人的「主要」标记。
        </p>
      ) : null}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "保存中…" : isEdit ? "保存" : "添加"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            取消
          </Button>
        ) : null}
      </div>
    </form>
  );
}
