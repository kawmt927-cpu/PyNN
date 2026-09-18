"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateHrEmployeeProfile } from "@/app/(dashboard)/hr/employees/actions";
import { formatDateInput } from "@/lib/personnel/hr-documents";

type Props = {
  userId: string;
  hiredAt: Date | null;
  idNumber: string | null;
  idExpiresAt: Date | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  address: string | null;
  notes: string | null;
};

export function HrEmployeeProfileForm({
  userId,
  hiredAt,
  idNumber,
  idExpiresAt,
  emergencyName,
  emergencyPhone,
  address,
  notes,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateHrEmployeeProfile({
        userId,
        hiredAt: String(formData.get("hiredAt") ?? ""),
        idNumber: String(formData.get("idNumber") ?? ""),
        idExpiresAt: String(formData.get("idExpiresAt") ?? ""),
        emergencyName: String(formData.get("emergencyName") ?? ""),
        emergencyPhone: String(formData.get("emergencyPhone") ?? ""),
        address: String(formData.get("address") ?? ""),
        notes: String(formData.get("notes") ?? ""),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="hiredAt">入职日期</Label>
        <Input
          id="hiredAt"
          name="hiredAt"
          type="date"
          defaultValue={formatDateInput(hiredAt)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="idNumber">身份证号</Label>
        <Input
          id="idNumber"
          name="idNumber"
          defaultValue={idNumber ?? ""}
          placeholder="上传身份证后可自动回填"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="idExpiresAt">身份证到期日</Label>
        <Input
          id="idExpiresAt"
          name="idExpiresAt"
          type="date"
          defaultValue={formatDateInput(idExpiresAt)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="emergencyName">紧急联系人</Label>
        <Input id="emergencyName" name="emergencyName" defaultValue={emergencyName ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="emergencyPhone">紧急联系电话</Label>
        <Input id="emergencyPhone" name="emergencyPhone" defaultValue={emergencyPhone ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="address">住址</Label>
        <Input id="address" name="address" defaultValue={address ?? ""} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="notes">备注</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={notes ?? ""} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "保存中…" : "保存档案"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved && !error ? <p className="text-sm text-muted-foreground">已保存</p> : null}
      </div>
    </form>
  );
}
