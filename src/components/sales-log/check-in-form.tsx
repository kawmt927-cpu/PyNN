"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import type { EntitySearchSelectHandle } from "@/components/ui/entity-search-select";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import type { CheckInMode } from "@/lib/validations/sales-log";
import { formatCheckInLocation } from "@/lib/sales-log/format-location";
import {
  CheckInLocationPicker,
  type CheckInLocationValue,
} from "@/components/sales-log/check-in-location-picker";
import { ContactSelect } from "@/components/sales-log/contact-select";
import { QuickCustomerDialog } from "@/components/sales-log/quick-customer-dialog";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { CustomerTagDefinition } from "@/lib/customers/tags";

type EntryTiming = "later" | "now";

export type CheckInCustomerFormOptions = {
  sourceOptions: ConfigOptionItem[];
  typeOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  tagOptions: CustomerTagDefinition[];
  showOwnerSelect?: boolean;
  salesUsers?: Array<{ id: string; name: string }>;
};

export function CheckInForm({
  mapKey,
  customerFormOptions,
}: {
  mapKey: string | null;
  customerFormOptions: CheckInCustomerFormOptions;
}) {
  const router = useRouter();
  const customerSelectRef = useRef<EntitySearchSelectHandle>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checkInMode, setCheckInMode] = useState<CheckInMode>("interaction");
  const [entryTiming, setEntryTiming] = useState<EntryTiming>("later");
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [contactId, setContactId] = useState("");
  const [location, setLocation] = useState<CheckInLocationValue | null>(null);
  const [method, setMethod] = useState<SalesLogMethod>("FACE_VISIT");
  const [content, setContent] = useState("");
  const [result, setResult] = useState("");
  const [detailedNotes, setDetailedNotes] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");

  const isInteraction = checkInMode === "interaction";
  const completeNow = isInteraction && entryTiming === "now";

  function openCreateCustomer(name?: string) {
    const draft = (name ?? customerSelectRef.current?.getDraftQuery() ?? "").trim();
    setNewCustomerName(draft);
    setCustomerDialogOpen(true);
  }

  function resetForm() {
    setCheckInMode("interaction");
    setEntryTiming("later");
    setCustomerId("");
    setCustomerLabel("");
    setContactId("");
    setLocation(null);
    setMethod("FACE_VISIT");
    setContent("");
    setResult("");
    setDetailedNotes("");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!location) {
      setError("请先获取定位并解析地址");
      return;
    }
    if (isInteraction && !customerId) {
      setError("请选择客户，或新增客户");
      return;
    }
    if (completeNow && !content.trim()) {
      setError("请填写往来内容");
      return;
    }

    const notes = (new FormData(e.currentTarget).get("notes") as string | null)?.trim() || null;
    const locationLabel = formatCheckInLocation(location);

    startTransition(async () => {
      try {
        const res = await fetch("/api/sales-log/check-ins", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkInMode,
            customerId: isInteraction ? customerId : null,
            contactId: isInteraction ? contactId || null : null,
            latitude: location.latitude,
            longitude: location.longitude,
            locationText: location.locationText,
            addressProvince: location.addressProvince,
            addressCity: location.addressCity,
            addressDistrict: location.addressDistrict,
            addressStreet: location.addressStreet,
            notes,
            completeInteractionNow: completeNow,
            followUp: completeNow
              ? {
                  method,
                  content: content.trim(),
                  result: result.trim() || null,
                  location: method === "FACE_VISIT" ? locationLabel : null,
                  detailedNotes: method === "FACE_VISIT" ? detailedNotes.trim() || null : null,
                }
              : null,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          setError(data.error || "打卡失败");
          return;
        }
      } catch {
        setError("打卡失败，请稍后重试");
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>打卡类型</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="checkInModeRadio"
                checked={isInteraction}
                onChange={() => {
                  setCheckInMode("interaction");
                  setError(null);
                }}
                className="h-4 w-4"
              />
              往来打卡（关联客户与往来）
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="checkInModeRadio"
                checked={!isInteraction}
                onChange={() => {
                  setCheckInMode("without_customer");
                  setCustomerId("");
                  setCustomerLabel("");
                  setContactId("");
                  setError(null);
                }}
                className="h-4 w-4"
              />
              无客户打卡（仅记录定位）
            </label>
          </div>
        </div>

        {isInteraction ? (
          <>
            <div className="space-y-2 md:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-[240px] flex-1">
                  <CustomerSearchSelect
                    ref={customerSelectRef}
                    id="checkInCustomer"
                    name="customerId"
                    label="客户"
                    required
                    value={customerId}
                    selectedLabel={customerLabel}
                    onValueChange={(id, option) => {
                      setCustomerId(id);
                      setCustomerLabel(option?.label ?? "");
                      setContactId("");
                    }}
                    onCreateNew={openCreateCustomer}
                  />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => openCreateCustomer()}>
                  新增客户
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkInContact">联系人</Label>
              <ContactSelect customerId={customerId} value={contactId} onChange={setContactId} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>往来录入</Label>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="entryTiming"
                    checked={entryTiming === "later"}
                    onChange={() => setEntryTiming("later")}
                    className="h-4 w-4"
                  />
                  仅打卡，收工后与 AI 补全往来
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="entryTiming"
                    checked={entryTiming === "now"}
                    onChange={() => setEntryTiming("now")}
                    className="h-4 w-4"
                  />
                  同时录入往来内容
                </label>
              </div>
            </div>

            {completeNow && (
              <div className="space-y-4 rounded-md border bg-muted/30 p-4 md:col-span-2">
                <p className="text-sm font-medium">往来内容</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="checkInMethod">往来方式</Label>
                    <select
                      id="checkInMethod"
                      value={method}
                      onChange={(e) => setMethod(e.target.value as SalesLogMethod)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {SALES_LOG_METHOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="checkInContent">往来内容 *</Label>
                    <Textarea
                      id="checkInContent"
                      rows={3}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="沟通要点、客户反馈…"
                      required
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="checkInResult">结果/意向（可选）</Label>
                    <Input
                      id="checkInResult"
                      value={result}
                      onChange={(e) => setResult(e.target.value)}
                      placeholder="如意向等级、下一步计划"
                    />
                  </div>
                  {method === "FACE_VISIT" && (
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="checkInDetail">面访纪要（可选）</Label>
                      <Textarea
                        id="checkInDetail"
                        rows={2}
                        value={detailedNotes}
                        onChange={(e) => setDetailedNotes(e.target.value)}
                      />
                      {location ? (
                        <p className="text-xs text-muted-foreground">
                          面访地点将使用打卡地点：{formatCheckInLocation(location)}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground md:col-span-2">
            无客户打卡仅记录当前位置与时间，无需绑定客户，也无需补全往来。
          </p>
        )}

        <CheckInLocationPicker
          value={location}
          onChange={setLocation}
          mapKey={mapKey}
          disabled={pending}
        />
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="checkInNotes">备注（可选）</Label>
          <Input id="checkInNotes" name="notes" placeholder="如：拜访目的、同行人员" />
        </div>
        {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}
        <div className="md:col-span-2">
          <Button
            type="submit"
            disabled={pending || !location || (isInteraction && !customerId) || (completeNow && !content.trim())}
          >
            {pending ? "提交中…" : completeNow ? "提交往来打卡" : "提交打卡"}
          </Button>
        </div>
      </form>

      <QuickCustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        initialName={newCustomerName}
        initialProvince={location?.addressProvince ?? ""}
        initialCity={location?.addressCity ?? ""}
        initialDistrict={location?.addressDistrict ?? ""}
        sourceOptions={customerFormOptions.sourceOptions}
        typeOptions={customerFormOptions.typeOptions}
        gradeOptions={customerFormOptions.gradeOptions}
        tagOptions={customerFormOptions.tagOptions}
        showOwnerSelect={customerFormOptions.showOwnerSelect}
        salesUsers={customerFormOptions.salesUsers}
        onCreated={(customer) => {
          setCustomerId(customer.id);
          setCustomerLabel(customer.name);
          setContactId("");
          setError(null);
        }}
      />
    </>
  );
}
