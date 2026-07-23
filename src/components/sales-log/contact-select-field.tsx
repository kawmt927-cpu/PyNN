"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectClearButton } from "@/components/ui/select-clear-button";
import {
  QuickContactDialog,
  contactOptionToQuickDraft,
  type QuickContactDraft,
} from "@/components/sales-log/quick-contact-dialog";
import type { ContactOption } from "@/components/sales-log/contact-select";
import { cn } from "@/lib/utils";

type BaseProps = {
  customerId: string;
  required?: boolean;
  initialName?: string;
  id?: string;
  className?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
};

type MultipleProps = BaseProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

type Props = SingleProps | MultipleProps;

function formatContactLabel(c: ContactOption) {
  const parts = [c.name];
  if (c.title) parts.push(c.title);
  let label = parts.join(" · ");
  if (c.isPrimary) label += "（主联系人）";
  return label;
}

function contactDetailParts(c: ContactOption) {
  const parts: string[] = [];
  if (c.title) parts.push(c.title);
  if (c.department) parts.push(c.department);
  if (c.phone) parts.push(c.phone);
  if (c.wechat) parts.push(c.wechat);
  if (c.isPrimary) parts.push("主联系人");
  return parts;
}

function ContactNameLabel({ contact }: { contact: ContactOption }) {
  const parts = contactDetailParts(contact);

  return (
    <span className="group/contact relative inline-flex min-w-0">
      <span>{contact.name}</span>
      {parts.length > 0 ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden rounded-md border border-border bg-background px-2 py-1 text-xs font-normal text-foreground shadow-lg group-hover/contact:inline-flex group-hover/contact:items-center group-hover/contact:gap-1 group-hover/contact:whitespace-nowrap"
        >
          {parts.map((part, index) => (
            <span key={`${part}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 ? <span className="text-muted-foreground">·</span> : null}
              <span>{part}</span>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function ContactSelectField(props: Props) {
  const {
    customerId,
    required = false,
    initialName = "",
    id = "interactionContact",
    className,
  } = props;
  const multiple = props.multiple === true;

  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [canWriteContent, setCanWriteContent] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [editingContact, setEditingContact] = useState<QuickContactDraft | null>(null);

  const loadContacts = useCallback(async () => {
    if (!customerId) {
      setContacts([]);
      setCanWriteContent(false);
      return;
    }
    try {
      const res = await fetch(`/api/customers/${customerId}/contacts`, { credentials: "include" });
      const data = (await res.json()) as { items: ContactOption[]; canWriteContent?: boolean };
      setContacts(
        (data.items ?? []).map((item) => ({
          ...item,
          role: item.role || "OTHER",
        }))
      );
      setCanWriteContent(Boolean(data.canWriteContent));
    } catch {
      setContacts([]);
      setCanWriteContent(false);
    }
  }, [customerId]);

  const prevCustomerIdRef = useRef(customerId);
  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;

  useEffect(() => {
    if (!customerId) {
      setContacts([]);
      return;
    }
    void loadContacts();
  }, [customerId, loadContacts]);

  useEffect(() => {
    if (prevCustomerIdRef.current === customerId) return;
    prevCustomerIdRef.current = customerId;
    if (multiple) {
      (onChangeRef.current as MultipleProps["onChange"])([]);
    } else {
      (onChangeRef.current as SingleProps["onChange"])("");
    }
  }, [customerId, multiple]);

  function openCreateContact(name = "") {
    setEditingContact(null);
    setNewContactName(name);
    setDialogOpen(true);
  }

  function openEditContact(contact: ContactOption) {
    setNewContactName("");
    setEditingContact(contactOptionToQuickDraft(contact));
    setDialogOpen(true);
  }

  function toggleContact(contactId: string) {
    if (!multiple) return;
    const current = props.value;
    if (current.includes(contactId)) {
      props.onChange(current.filter((id) => id !== contactId));
    } else {
      props.onChange([...current, contactId]);
    }
  }

  if (!customerId) {
    return (
      <div className={cn("space-y-2", className)}>
        <Label>联系人{required ? " *" : ""}</Label>
        <select disabled className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm">
          <option>请先选择客户</option>
        </select>
      </div>
    );
  }

  const multipleHint =
    multiple && required
      ? !canWriteContent
        ? "您无权为该客户新增联系人，请从已有联系人中选择或联系销售管理。"
        : contacts.length === 0
        ? "该客户暂无联系人，请点击「新增联系人」添加。"
        : props.value.length === 0
          ? "请至少选择一位联系人。"
          : ""
      : "";

  return (
    <>
      <div className={cn("space-y-2", className)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor={multiple ? undefined : id}>
            联系人{required ? " *" : ""}
            {multiple ? <span className="ml-1 font-normal text-muted-foreground">（可多选）</span> : null}
          </Label>
          {canWriteContent ? (
            <Button type="button" variant="outline" size="sm" onClick={() => openCreateContact()}>
              新增联系人
            </Button>
          ) : null}
        </div>

        {!canWriteContent ? (
          <p className="text-xs text-muted-foreground">您无权为该客户新增联系人。</p>
        ) : null}

        {multiple ? (
          contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无联系人</p>
          ) : (
            <div className="divide-y divide-border/60 rounded-md border bg-background/60">
              {contacts.map((c) => {
                const checked = props.value.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5"
                  >
                    <label className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm leading-none">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-input"
                        checked={checked}
                        onChange={() => toggleContact(c.id)}
                      />
                      <ContactNameLabel contact={c} />
                    </label>
                    {canWriteContent ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                        onClick={() => openEditContact(c)}
                      >
                        编辑
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="relative">
            <select
              id={id}
              value={props.value}
              onChange={(e) => props.onChange(e.target.value)}
              required={required}
              className={cn(
                "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                !required && props.value && "pr-9"
              )}
            >
              <option value="">{required ? "请选择联系人" : "不指定联系人"}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatContactLabel(c)}
                </option>
              ))}
            </select>
            {!required ? (
              <SelectClearButton
                value={props.value}
                ariaLabel="清除联系人"
                onClear={() => props.onChange("")}
              />
            ) : null}
          </div>
        )}

        {multiple && required ? (
          <p
            className={cn(
              "min-h-5 text-xs leading-5",
              multipleHint
                ? contacts.length === 0
                  ? "text-orange-600"
                  : "text-muted-foreground"
                : "text-transparent"
            )}
            aria-live="polite"
          >
            {multipleHint || "占位"}
          </p>
        ) : null}
      </div>

      {canWriteContent ? (
        <QuickContactDialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setEditingContact(null);
          }}
          customerId={customerId}
          contact={editingContact}
          initialName={newContactName || initialName}
          onSaved={(contact) => {
            void loadContacts().then(() => {
              if (editingContact) return;
              if (multiple) {
                const current = props.value;
                if (!current.includes(contact.id)) {
                  props.onChange([...current, contact.id]);
                }
              } else {
                props.onChange(contact.id);
              }
            });
          }}
        />
      ) : null}
    </>
  );
}
