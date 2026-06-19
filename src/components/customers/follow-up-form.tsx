"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { createFollowUp } from "@/app/(dashboard)/customers/actions";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { Contact } from "@prisma/client";

type Props = {
  customerId: string;
  contacts?: Contact[];
  gradeOptions: ConfigOptionItem[];
};

const methodOptions = Object.entries(FOLLOW_UP_METHOD_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function todayLocalDatetime() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function FollowUpForm({ customerId, contacts = [], gradeOptions }: Props) {
  const [method, setMethod] = useState("PHONE");
  const isFaceVisit = method === "FACE_VISIT";

  const contactOptions = [
    { value: "", label: "不指定联系人" },
    ...contacts.map((c) => ({ value: c.id, label: c.name })),
  ];

  const gradeSelectOptions = [
    { value: "", label: "不更新等级" },
    ...gradeOptions.map((o) => ({ value: o.value, label: o.label })),
  ];

  return (
    <form action={createFollowUp} className="space-y-4 border-t pt-6">
      <input type="hidden" name="customerId" value={customerId} />

      <h3 className="font-semibold">新增跟进</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="method">跟进方式 *</Label>
          <select
            id="method"
            name="method"
            required
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {methodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {contacts.length > 0 && (
          <SelectField
            id="contactId"
            label="联系人"
            name="contactId"
            options={contactOptions}
          />
        )}

        <div className="space-y-2">
          <Label htmlFor="followUpAt">跟进时间 *</Label>
          <Input
            id="followUpAt"
            name="followUpAt"
            type="datetime-local"
            defaultValue={todayLocalDatetime()}
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="content">跟进内容 *</Label>
          <Textarea id="content" name="content" required rows={3} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="result">跟进结果</Label>
          <Textarea id="result" name="result" rows={2} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nextFollowUpAt">下次跟进时间</Label>
          <Input id="nextFollowUpAt" name="nextFollowUpAt" type="datetime-local" />
        </div>

        <SelectField
          id="suggestedGrade"
          label="建议更新客户等级"
          name="suggestedGrade"
          options={gradeSelectOptions}
        />

        <div className="flex items-center gap-2 md:col-span-2">
          <input type="checkbox" id="applyGrade" name="applyGrade" value="true" />
          <Label htmlFor="applyGrade" className="font-normal">
            确认应用建议等级到客户档案
          </Label>
        </div>

        {isFaceVisit && (
          <>
            <div className="space-y-2 md:col-span-2">
              <p className="text-sm font-medium text-muted-foreground">面访详情</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">地点 *</Label>
              <Input id="location" name="location" required={isFaceVisit} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">科室</Label>
              <Input id="department" name="department" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="companions">同行人员</Label>
              <Input id="companions" name="companions" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="detailedNotes">详细纪要 *</Label>
              <Textarea id="detailedNotes" name="detailedNotes" required={isFaceVisit} rows={4} />
            </div>
          </>
        )}
      </div>

      <Button type="submit">保存跟进</Button>
    </form>
  );
}
