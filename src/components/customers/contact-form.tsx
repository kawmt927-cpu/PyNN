"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
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
  /** 仅医院客户显示科室/部门 */
  showDepartment?: boolean;
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
  showDepartment = true,
  embedded = false,
}: Props) {
  const router = useRouter();
  const isEdit = Boolean(contact);
  const [isPrimaryChecked, setIsPrimaryChecked] = useState(contact?.isPrimary ?? false);
  const [name, setName] = useState(contact?.name ?? "");
  const [role, setRole] = useState(contact?.role ?? roleOptions[0]?.value ?? "OTHER");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [department, setDepartment] = useState(contact?.department ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [wechat, setWechat] = useState(contact?.wechat ?? "");
  const [clientError, setClientError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    if (!phone.trim() && !wechat.trim()) {
      setClientError("手机和微信至少填写一项");
      return;
    }
    const formData = new FormData(e.currentTarget);
    // 不绑 form action，避免 React 19 在 action 结束后 reset 非受控字段导致已填姓名被清空
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
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
          <Input
            id="contact-name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <SelectField
          id="contact-role"
          label="角色"
          name="role"
          options={roleOptions}
          value={role}
          onValueChange={setRole}
          labelClassName={fieldLabelClass}
        />
        <ComboboxField
          id="contact-title"
          label="职务"
          name="title"
          options={titleOptions}
          value={title}
          onValueChange={setTitle}
          placeholder="选择或输入职务"
        />
        {showDepartment ? (
          <ComboboxField
            id="contact-dept"
            label="科室/部门"
            name="department"
            options={departmentOptions}
            value={department}
            onValueChange={setDepartment}
            placeholder="选择或输入科室/部门"
          />
        ) : (
          <input type="hidden" name="department" value="" />
        )}
        <div className="space-y-2">
          <Label htmlFor="contact-phone" className={fieldLabelClass}>
            手机
          </Label>
          <Input
            id="contact-phone"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-wechat" className={fieldLabelClass}>
            微信
          </Label>
          <Input
            id="contact-wechat"
            name="wechat"
            value={wechat}
            onChange={(e) => setWechat(e.target.value)}
          />
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
      {clientError || state?.error ? (
        <p className="text-sm text-destructive">{clientError || state?.error}</p>
      ) : null}
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
