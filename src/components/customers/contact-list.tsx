"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { labelForConfig } from "@/lib/config-options";
import { CONTACT_ROLE_LABELS } from "@/lib/permissions";
import { ContactForm } from "./contact-form";
import { deleteContact } from "@/app/(dashboard)/customers/contact-actions";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { Contact } from "@prisma/client";

type Props = {
  customerId: string;
  contacts: Contact[];
  readOnly?: boolean;
  titleOptions: ConfigOptionItem[];
  departmentOptions: ConfigOptionItem[];
  roleOptions: ConfigOptionItem[];
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
};

export function ContactList({
  customerId,
  contacts,
  readOnly,
  titleOptions,
  departmentOptions,
  roleOptions,
  addOpen: addOpenProp,
  onAddOpenChange,
}: Props) {
  const router = useRouter();
  const roleLabelMap = Object.fromEntries(roleOptions.map((opt) => [opt.value, opt.label]));
  for (const [value, label] of Object.entries(CONTACT_ROLE_LABELS)) {
    if (!roleLabelMap[value]) roleLabelMap[value] = label;
  }

  const [addOpenInternal, setAddOpenInternal] = useState(false);
  const addOpen = addOpenProp ?? addOpenInternal;
  const setAddOpen = onAddOpenChange ?? setAddOpenInternal;
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  function closeDialogs() {
    setAddOpen(false);
    setEditingContact(null);
  }

  function handleDeleteClick(contact: Contact) {
    if (deletePending || deletingId) return;
    setDeleteError(null);
    setPendingDelete(contact);
  }

  function confirmDelete() {
    if (!pendingDelete || deletePending || deletingId) return;

    const contact = pendingDelete;
    setDeletingId(contact.id);
    startDeleteTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("contactId", contact.id);
        formData.set("customerId", customerId);
        await deleteContact(formData);
        setPendingDelete(null);
        router.refresh();
      } catch (error) {
        setDeleteError(error instanceof Error ? error.message : "删除失败，请重试");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无联系人</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {c.name}
                    {c.isPrimary ? (
                      <span className="ml-2 text-xs text-primary">主要</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground">
                    {labelForConfig(roleLabelMap, c.role)}
                    {[c.title, c.department].filter(Boolean).length > 0 &&
                      ` · ${[c.title, c.department].filter(Boolean).join(" · ")}`}
                  </p>
                  <p>{[c.phone, c.wechat].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!readOnly ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletePending}
                        onClick={() => setEditingContact(c)}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletePending}
                        onClick={() => handleDeleteClick(c)}
                      >
                        {deletingId === c.id ? "删除中…" : "删除"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}

      <ConfirmDestructiveDialog
        open={Boolean(pendingDelete)}
        title="删除联系人"
        message={
          pendingDelete
            ? `确定删除联系人「${pendingDelete.name}」吗？此操作不可撤销。`
            : ""
        }
        confirmLabel="删除"
        pending={deletePending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg" showCloseButton scrollable>
          <DialogHeader>
            <DialogTitle>新增联系人</DialogTitle>
          </DialogHeader>
          <ContactForm
            key="add-contact"
            customerId={customerId}
            embedded
            titleOptions={titleOptions}
            departmentOptions={departmentOptions}
            roleOptions={roleOptions}
            onCancel={() => setAddOpen(false)}
            onSuccess={closeDialogs}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingContact)} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent className="max-w-lg" showCloseButton scrollable>
          <DialogHeader>
            <DialogTitle>编辑联系人</DialogTitle>
          </DialogHeader>
          {editingContact ? (
            <ContactForm
              key={editingContact.id}
              customerId={customerId}
              contact={editingContact}
              embedded
              titleOptions={titleOptions}
              departmentOptions={departmentOptions}
              roleOptions={roleOptions}
              onCancel={() => setEditingContact(null)}
              onSuccess={closeDialogs}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
