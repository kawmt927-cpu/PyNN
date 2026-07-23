"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxField } from "@/components/ui/combobox-field";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { ContactOption } from "@/components/sales-log/contact-select";

const fieldLabelClass = "flex min-h-9 items-center";

export type QuickContactDraft = {
  id: string;
  name: string;
  title: string | null;
  department: string | null;
  phone: string | null;
  wechat: string | null;
  role: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  /** 编辑时传入；为空则为新增 */
  contact?: QuickContactDraft | null;
  initialName?: string;
  titleOptions?: ConfigOptionItem[];
  departmentOptions?: ConfigOptionItem[];
  roleOptions?: ConfigOptionItem[];
  onSaved: (contact: { id: string; name: string }) => void;
};

function toDraft(contact: ContactOption): QuickContactDraft {
  return {
    id: contact.id,
    name: contact.name,
    title: contact.title,
    department: contact.department,
    phone: contact.phone,
    wechat: contact.wechat,
    role: contact.role || "OTHER",
  };
}

export { toDraft as contactOptionToQuickDraft };

export function QuickContactDialog({
  open,
  onOpenChange,
  customerId,
  contact = null,
  initialName = "",
  titleOptions = [],
  departmentOptions = [],
  roleOptions = [],
  onSaved,
}: Props) {
  const isEdit = Boolean(contact);
  const [name, setName] = useState(initialName);
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [wechat, setWechat] = useState("");
  const [role, setRole] = useState("OTHER");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadedTitleOptions, setLoadedTitleOptions] = useState(titleOptions);
  const [loadedDeptOptions, setLoadedDeptOptions] = useState(departmentOptions);
  const [loadedRoleOptions, setLoadedRoleOptions] = useState(roleOptions);

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setName(contact.name);
      setTitle(contact.title ?? "");
      setDepartment(contact.department ?? "");
      setPhone(contact.phone ?? "");
      setWechat(contact.wechat ?? "");
      setRole(contact.role || "OTHER");
    } else {
      setName(initialName);
      setTitle("");
      setDepartment("");
      setPhone("");
      setWechat("");
      setRole(
        loadedRoleOptions.find((opt) => opt.value === "OTHER")?.value ??
          loadedRoleOptions[0]?.value ??
          "OTHER"
      );
    }
    setError(null);
  }, [open, initialName, contact]);

  useEffect(() => {
    if (titleOptions.length > 0) setLoadedTitleOptions(titleOptions);
    if (departmentOptions.length > 0) setLoadedDeptOptions(departmentOptions);
    if (roleOptions.length > 0) setLoadedRoleOptions(roleOptions);
  }, [titleOptions, departmentOptions, roleOptions]);

  useEffect(() => {
    if (!open || (loadedTitleOptions.length > 0 && loadedDeptOptions.length > 0 && loadedRoleOptions.length > 0)) {
      return;
    }
    void fetch("/api/config/contact-options", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            titleOptions?: ConfigOptionItem[];
            departmentOptions?: ConfigOptionItem[];
            roleOptions?: ConfigOptionItem[];
          } | null
        ) => {
          if (!data) return;
          if (data.titleOptions?.length) setLoadedTitleOptions(data.titleOptions);
          if (data.departmentOptions?.length) setLoadedDeptOptions(data.departmentOptions);
          if (data.roleOptions?.length) setLoadedRoleOptions(data.roleOptions);
        }
      )
      .catch(() => {});
  }, [open, loadedTitleOptions.length, loadedDeptOptions.length, loadedRoleOptions.length]);

  useEffect(() => {
    if (!open || !contact || loadedRoleOptions.length === 0) return;
    const exists = loadedRoleOptions.some((opt) => opt.value === contact.role);
    if (!exists) {
      setRole(
        loadedRoleOptions.find((opt) => opt.value === "OTHER")?.value ??
          loadedRoleOptions[0]?.value ??
          contact.role
      );
    }
  }, [open, contact, loadedRoleOptions]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim() && !wechat.trim()) {
      setError("手机和微信至少填写一项");
      return;
    }
    startTransition(async () => {
      try {
        const payload = {
          name,
          title,
          department,
          phone,
          wechat,
          role,
          ...(isEdit && contact ? { contactId: contact.id } : {}),
        };
        const res = await fetch(`/api/customers/${customerId}/contacts`, {
          method: isEdit ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as { id?: string; name?: string; error?: string };
        if (!res.ok || !data.id || !data.name) {
          setError(data.error || (isEdit ? "更新联系人失败" : "创建联系人失败"));
          return;
        }
        onSaved({ id: data.id, name: data.name });
        onOpenChange(false);
      } catch {
        setError(isEdit ? "更新联系人失败，请稍后重试" : "创建联系人失败，请稍后重试");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑联系人" : "新增联系人"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "保存后列表将刷新显示最新信息。" : "保存后将自动选中该联系人。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quickContactName" className={fieldLabelClass}>
              姓名 *
            </Label>
            <Input
              id="quickContactName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <SelectField
            id="quickContactRole"
            label="角色"
            name="role"
            options={loadedRoleOptions}
            value={role}
            onValueChange={setRole}
            labelClassName={fieldLabelClass}
          />
          <ComboboxField
            id="quickContactTitle"
            label="职务"
            name="title"
            options={loadedTitleOptions}
            value={title}
            onValueChange={setTitle}
            placeholder="选择或输入职务"
          />
          <ComboboxField
            id="quickContactDept"
            label="科室/部门"
            name="department"
            options={loadedDeptOptions}
            value={department}
            onValueChange={setDepartment}
            placeholder="选择或输入科室/部门"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quickContactPhone" className={fieldLabelClass}>
                手机
              </Label>
              <Input id="quickContactPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quickContactWechat" className={fieldLabelClass}>
                微信
              </Label>
              <Input id="quickContactWechat" value={wechat} onChange={(e) => setWechat(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">手机和微信至少填写一项。</p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "保存中…" : isEdit ? "保存" : "保存并选中"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
