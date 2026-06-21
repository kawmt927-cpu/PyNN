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
import { ContactSelectField } from "@/components/sales-log/contact-select-field";
import { QuickCustomerDialog } from "@/components/sales-log/quick-customer-dialog";
import { QuickOpportunityDialog } from "@/components/sales-log/quick-opportunity-dialog";
import { CustomerGradeSelect } from "@/components/customers/customer-grade-select";
import { OpportunitySearchSelect } from "@/components/opportunities/opportunity-search-select";
import {
  CheckInDuplicateDialog,
  type TodayCustomerCheckInItem,
} from "@/components/sales-log/check-in-duplicate-dialog";
import type { ConfigOptionItem } from "@/lib/config-options";
import { cn } from "@/lib/utils";
import type { CustomerTagDefinition } from "@/lib/customers/tags";

type EntryTiming = "later" | "now";

const disabledFieldClass =
  "cursor-not-allowed bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
const alignedFieldLabelClass = "flex min-h-9 items-center";

export type CheckInCustomerFormOptions = {
  sourceOptions: ConfigOptionItem[];
  typeOptions: ConfigOptionItem[];
  gradeOptions: ConfigOptionItem[];
  tagOptions: CustomerTagDefinition[];
  stageOptions: ConfigOptionItem[];
  showOwnerSelect?: boolean;
  salesUsers?: Array<{ id: string; name: string }>;
};

export function CheckInForm({
  mapKey,
  geocodeReady,
  customerFormOptions,
}: {
  mapKey: string | null;
  geocodeReady: boolean;
  customerFormOptions: CheckInCustomerFormOptions;
}) {
  const router = useRouter();
  const customerSelectRef = useRef<EntitySearchSelectHandle>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checkInMode, setCheckInMode] = useState<CheckInMode>("interaction");
  const [entryTiming, setEntryTiming] = useState<EntryTiming>("now");
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [contactId, setContactId] = useState("");
  const [location, setLocation] = useState<CheckInLocationValue | null>(null);
  const [method, setMethod] = useState<SalesLogMethod>("FACE_VISIT");
  const [content, setContent] = useState("");
  const [detailedNotes, setDetailedNotes] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [opportunityLabel, setOpportunityLabel] = useState("");
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [suggestedGrade, setSuggestedGrade] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [nextFollowUpMethod, setNextFollowUpMethod] = useState<SalesLogMethod | "">("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateItems, setDuplicateItems] = useState<TodayCustomerCheckInItem[]>([]);
  const [duplicatePayload, setDuplicatePayload] = useState<Record<string, unknown> | null>(null);

  const isInteraction = checkInMode === "interaction";
  const completeNow = isInteraction && entryTiming === "now";
  const customerReady = Boolean(customerId);

  async function submitCheckIn(payload: Record<string, unknown>, updateCheckInId?: string) {
    const res = await fetch("/api/sales-log/check-ins", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        updateCheckInId: updateCheckInId ?? null,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      throw new Error(data.error || "打卡失败");
    }
  }

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
    setDetailedNotes("");
    setOpportunityId("");
    setOpportunityLabel("");
    setSuggestedGrade("");
    setNextFollowUpAt("");
    setNextFollowUpMethod("");
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
    if (isInteraction && !contactId) {
      setError("请选择联系人，或新增联系人");
      return;
    }
    if (completeNow && !content.trim()) {
      setError("请填写往来内容");
      return;
    }

    const notes = (new FormData(e.currentTarget).get("notes") as string | null)?.trim() || null;
    const locationLabel = formatCheckInLocation(location);

    const payload = {
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
            suggestedGrade: suggestedGrade || null,
            opportunityId: opportunityId || null,
            nextFollowUpAt: nextFollowUpAt || null,
            nextFollowUpMethod: nextFollowUpMethod || null,
            location: method === "FACE_VISIT" ? locationLabel : null,
            detailedNotes: method === "FACE_VISIT" ? detailedNotes.trim() || null : null,
          }
        : null,
    };

    startTransition(async () => {
      try {
        if (isInteraction && customerId) {
          const dupRes = await fetch(
            `/api/sales-log/check-ins/today?customerId=${encodeURIComponent(customerId)}`,
            { credentials: "include" }
          );
          if (dupRes.ok) {
            const dupData = (await dupRes.json()) as { items?: TodayCustomerCheckInItem[] };
            const items = dupData.items ?? [];
            if (items.length > 0) {
              setDuplicateItems(items);
              setDuplicatePayload(payload);
              setDuplicateOpen(true);
              return;
            }
          }
        }

        await submitCheckIn(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "打卡失败，请稍后重试");
        return;
      }
      setDuplicateOpen(false);
      setDuplicatePayload(null);
      resetForm();
      router.refresh();
    });
  }

  function handleDuplicateModify(checkInId: string) {
    if (!duplicatePayload) return;
    setError(null);
    startTransition(async () => {
      try {
        await submitCheckIn(duplicatePayload, checkInId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "打卡失败，请稍后重试");
        return;
      }
      setDuplicateOpen(false);
      setDuplicatePayload(null);
      resetForm();
      router.refresh();
    });
  }

  function handleDuplicateCreateNew() {
    if (!duplicatePayload) return;
    setError(null);
    startTransition(async () => {
      try {
        await submitCheckIn(duplicatePayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "打卡失败，请稍后重试");
        return;
      }
      setDuplicateOpen(false);
      setDuplicatePayload(null);
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
                      setOpportunityId("");
                      setOpportunityLabel("");
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
              <ContactSelectField
                customerId={customerId}
                value={contactId}
                onChange={setContactId}
                required
              />
            </div>

            <div className={cn("space-y-2 md:col-span-2", !customerReady && "opacity-60")}>
              <Label>往来录入</Label>
              <div className="flex flex-wrap gap-4">
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    customerReady ? "cursor-pointer" : "cursor-not-allowed"
                  )}
                >
                  <input
                    type="radio"
                    name="entryTiming"
                    checked={entryTiming === "now"}
                    disabled={!customerReady}
                    onChange={() => setEntryTiming("now")}
                    className="h-4 w-4"
                  />
                  同时录入往来内容
                </label>
                <label
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    customerReady ? "cursor-pointer" : "cursor-not-allowed"
                  )}
                >
                  <input
                    type="radio"
                    name="entryTiming"
                    checked={entryTiming === "later"}
                    disabled={!customerReady}
                    onChange={() => setEntryTiming("later")}
                    className="h-4 w-4"
                  />
                  仅打卡，收工后与 AI 补全往来
                </label>
              </div>
              {!customerReady ? (
                <p className="text-xs text-muted-foreground">请先选择客户后再选择往来录入方式</p>
              ) : null}
            </div>

            {completeNow && (
              <div
                className={cn(
                  "space-y-4 rounded-md border bg-muted/30 p-4 md:col-span-2",
                  !customerReady && "opacity-60"
                )}
              >
                <p className="text-sm font-medium">往来内容</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="checkInMethod">往来方式 *</Label>
                    <select
                      id="checkInMethod"
                      value={method}
                      disabled={!customerReady}
                      required={customerReady}
                      onChange={(e) => setMethod(e.target.value as SalesLogMethod)}
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm",
                        customerReady ? "bg-background" : disabledFieldClass
                      )}
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
                      disabled={!customerReady}
                      required={customerReady}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={customerReady ? "沟通要点、客户反馈…" : "请先选择客户"}
                      className={cn(!customerReady && disabledFieldClass)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className={cn("justify-between gap-2", alignedFieldLabelClass, "flex")}>
                      <Label>关联商机</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!customerReady}
                        onClick={() => setOpportunityDialogOpen(true)}
                      >
                        新建商机
                      </Button>
                    </div>
                    {customerReady ? (
                      <OpportunitySearchSelect
                        id="checkInOpportunity"
                        name="opportunityId"
                        label=""
                        customerId={customerId}
                        value={opportunityId}
                        selectedLabel={opportunityLabel}
                        onValueChange={(id, option) => {
                          setOpportunityId(id);
                          setOpportunityLabel(option?.label ?? "");
                        }}
                        placeholder="无关联商机"
                        className="relative"
                      />
                    ) : (
                      <div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                        请先选择客户
                      </div>
                    )}
                  </div>
                  <CustomerGradeSelect
                    id="checkInGrade"
                    label="客户等级（可选）"
                    value={suggestedGrade}
                    onValueChange={setSuggestedGrade}
                    labelClassName={alignedFieldLabelClass}
                    disabled={!customerReady}
                  />
                  <div className="space-y-4 rounded-md border bg-background/60 p-3 md:col-span-2">
                    <p className="text-sm font-medium">下次往来计划</p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="checkInNextMethod">计划方式</Label>
                        <select
                          id="checkInNextMethod"
                          value={nextFollowUpMethod}
                          disabled={!customerReady}
                          onChange={(e) => setNextFollowUpMethod(e.target.value as SalesLogMethod | "")}
                          className={cn(
                            "flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm",
                            customerReady ? "bg-background" : disabledFieldClass
                          )}
                        >
                          <option value="">请选择</option>
                          {SALES_LOG_METHOD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="checkInNextAt">计划时间</Label>
                        <Input
                          id="checkInNextAt"
                          type="datetime-local"
                          value={nextFollowUpAt}
                          disabled={!customerReady}
                          onChange={(e) => setNextFollowUpAt(e.target.value)}
                          className={cn(!customerReady && disabledFieldClass)}
                        />
                      </div>
                    </div>
                  </div>
                  {method === "FACE_VISIT" && (
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="checkInDetail">面访纪要（可选）</Label>
                      <Textarea
                        id="checkInDetail"
                        rows={2}
                        value={detailedNotes}
                        disabled={!customerReady}
                        onChange={(e) => setDetailedNotes(e.target.value)}
                        placeholder={customerReady ? undefined : "请先选择客户"}
                        className={cn(!customerReady && disabledFieldClass)}
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
          geocodeReady={geocodeReady}
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
            disabled={pending || !location || (isInteraction && (!customerId || !contactId)) || (completeNow && !content.trim())}
          >
            {pending ? "提交中…" : completeNow ? "提交往来打卡" : "提交打卡"}
          </Button>
        </div>
      </form>

      <CheckInDuplicateDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        customerName={customerLabel}
        items={duplicateItems}
        pending={pending}
        onModify={handleDuplicateModify}
        onCreateNew={handleDuplicateCreateNew}
      />

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
          setOpportunityId("");
          setOpportunityLabel("");
          setError(null);
        }}
      />

      <QuickOpportunityDialog
        open={opportunityDialogOpen}
        onOpenChange={setOpportunityDialogOpen}
        customerId={customerId}
        customerName={customerLabel}
        stageOptions={customerFormOptions.stageOptions}
        onCreated={(opp) => {
          setOpportunityId(opp.id);
          setOpportunityLabel(opp.title);
        }}
      />
    </>
  );
}
