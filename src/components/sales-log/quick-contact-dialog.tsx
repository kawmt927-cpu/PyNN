"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CONTACT_ROLE_LABELS } from "@/lib/permissions";

const roleOptions = Object.entries(CONTACT_ROLE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  initialName?: string;
  onCreated: (contact: { id: string; name: string }) => void;
};

export function QuickContactDialog({
  open,
  onOpenChange,
  customerId,
  initialName = "",
  onCreated,
}: Props) {
  const [name, setName] = useState(initialName);
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("OTHER");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setTitle("");
    setPhone("");
    setRole("OTHER");
    setError(null);
  }, [open, initialName]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/customers/${customerId}/contacts`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, title, phone, role }),
        });
        const data = (await res.json()) as { id?: string; name?: string; error?: string };
        if (!res.ok || !data.id || !data.name) {
          setError(data.error || "创建联系人失败");
          return;
        }
        onCreated({ id: data.id, name: data.name });
        onOpenChange(false);
      } catch {
        setError("创建联系人失败，请稍后重试");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>新增联系人</DialogTitle>
          <DialogDescription>保存后将自动选中该联系人。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quickContactName">姓名 *</Label>
            <Input id="quickContactName" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quickContactTitle">职务</Label>
            <Input id="quickContactTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quickContactPhone">手机</Label>
            <Input id="quickContactPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <SelectField
            id="quickContactRole"
            label="角色"
            name="role"
            options={roleOptions}
            value={role}
            onValueChange={setRole}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "保存中…" : "保存并选中"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
