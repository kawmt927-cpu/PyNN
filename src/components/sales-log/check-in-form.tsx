"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import type { EntitySearchSelectHandle } from "@/components/ui/entity-search-select";
import { NextFollowUpPlanFields } from "@/components/sales-log/next-follow-up-plan-fields";
import { SALES_LOG_METHOD_OPTIONS, type SalesLogMethod } from "@/lib/sales-log/methods";
import type { CheckInMode } from "@/lib/validations/sales-log";
import { validateNextFollowUpPlan } from "@/lib/sales-log/next-follow-up-plan";
import {
  customerGradeFormValue,
  customerGradeSubmitValue,
} from "@/lib/customers/grade";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomerPendingFollowPlansPanel } from "@/components/customers/customer-pending-follow-plans-panel";
import {
  CompletePendingFollowUpDialog,
} from "@/components/customers/complete-pending-follow-up-dialog";
import type { SerializedCustomerPendingFollowPlan } from "@/lib/follow-ups/unified";
import type { ConfigOptionItem } from "@/lib/config-options";
import { cn } from "@/lib/utils";
import type { CustomerTagDefinition } from "@/lib/customers/tags";
import { useCheckInDialogClose } from "@/components/today-work/check-in-dialog-context";
import {
  CHECK_IN_GUIDE_TIPS,
  CheckInGuideBanner,
  CheckInGuideSection,
  type CheckInGuideStepId,
} from "@/components/sales-log/check-in-guide";

type EntryTiming = "later" | "now";

const disabledFieldClass =
  "cursor-not-allowed bg-muted text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";
const alignedFieldLabelClass = "flex min-h-9 items-center";

export type CheckInCustomerContext = {
  customerId: string;
  customerLabel: string;
  customerGrade?: string | null;
  initialContactIds?: string[];
  initialOpportunityId?: string;
  initialOpportunityLabel?: string;
  pendingPlans?: SerializedCustomerPendingFollowPlan[];
  returnPath?: string;
};

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
  customerContext,
  guided = false,
  guidePortalId,
}: {
  mapKey: string | null;
  geocodeReady: boolean;
  customerFormOptions: CheckInCustomerFormOptions;
  customerContext?: CheckInCustomerContext;
  /** 手机端分步高亮引导 */
  guided?: boolean;
  /** 将引导条渲染到页面顶部插槽（滚动区外固定显示） */
  guidePortalId?: string;
}) {
  const router = useRouter();
  const closeCheckInDialog = useCheckInDialogClose();
  const customerSelectRef = useRef<EntitySearchSelectHandle>(null);
  const lockedCustomer = Boolean(customerContext);
  const [pendingPlans, setPendingPlans] = useState<SerializedCustomerPendingFollowPlan[]>(
    customerContext?.pendingPlans ?? []
  );
  const [pendingPlansLoading, setPendingPlansLoading] = useState(false);
  const hasPendingPlans = pendingPlans.length > 0;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checkInMode, setCheckInMode] = useState<CheckInMode>("interaction");
  const [entryTiming, setEntryTiming] = useState<EntryTiming>("now");
  const [customerId, setCustomerId] = useState(customerContext?.customerId ?? "");
  const [customerLabel, setCustomerLabel] = useState(customerContext?.customerLabel ?? "");
  const [currentCustomerGrade, setCurrentCustomerGrade] = useState<string | null>(
    customerContext?.customerGrade ?? null
  );
  const [contactIds, setContactIds] = useState<string[]>(customerContext?.initialContactIds ?? []);
  const [location, setLocation] = useState<CheckInLocationValue | null>(null);
  const [method, setMethod] = useState<SalesLogMethod>("FACE_VISIT");
  const [content, setContent] = useState("");
  const [opportunityId, setOpportunityId] = useState(customerContext?.initialOpportunityId ?? "");
  const [opportunityLabel, setOpportunityLabel] = useState(
    customerContext?.initialOpportunityLabel ?? ""
  );
  const [opportunityDialogOpen, setOpportunityDialogOpen] = useState(false);
  const [suggestedGrade, setSuggestedGrade] = useState(() =>
    customerGradeFormValue(customerContext?.customerGrade)
  );
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [nextFollowUpMethod, setNextFollowUpMethod] = useState<SalesLogMethod | "">("");
  const [nextFollowUpContent, setNextFollowUpContent] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [noLocationConfirmOpen, setNoLocationConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedPendingKeys, setSelectedPendingKeys] = useState<string[]>([]);
  const [queuedPayload, setQueuedPayload] = useState<Record<string, unknown> | null>(null);
  const [guideDismissed, setGuideDismissed] = useState(false);
  const [modeAcknowledged, setModeAcknowledged] = useState(lockedCustomer);
  const [entryAcknowledged, setEntryAcknowledged] = useState(lockedCustomer);
  const [locationSkipped, setLocationSkipped] = useState(false);
  const [guidePortalEl, setGuidePortalEl] = useState<HTMLElement | null>(null);
  const submittingRef = useRef(false);

  const isInteraction = checkInMode === "interaction";
  const completeNow = isInteraction && entryTiming === "now";
  const customerReady = Boolean(customerId);
  /** 客户 + 至少一位联系人就绪后，才可操作下方字段 */
  const partyReady = customerReady && contactIds.length > 0;
  const belowLocked = isInteraction && !partyReady;
  const contentReady = !completeNow || Boolean(content.trim());
  const nextPlanError = completeNow
    ? validateNextFollowUpPlan(
        suggestedGrade,
        nextFollowUpAt,
        nextFollowUpMethod,
        currentCustomerGrade,
        nextFollowUpContent
      )
    : null;
  const nextPlanReady = !nextPlanError;
  /** 往来内容/下次计划未完成前，不可操作定位及之后 */
  const afterContentLocked = completeNow && (!contentReady || !nextPlanReady);

  const guideActive = guided && !guideDismissed;

  useEffect(() => {
    if (!guidePortalId) {
      setGuidePortalEl(null);
      return;
    }
    setGuidePortalEl(document.getElementById(guidePortalId));
  }, [guidePortalId, guideActive]);

  const guideSteps = useMemo((): CheckInGuideStepId[] => {
    if (lockedCustomer) {
      const steps: CheckInGuideStepId[] = [];
      if (completeNow) steps.push("content", "nextPlan");
      steps.push("location", "submit");
      return steps;
    }
    if (!isInteraction) {
      return ["mode", "location", "submit"];
    }
    const steps: CheckInGuideStepId[] = ["mode", "customer", "entry"];
    if (completeNow) steps.push("content", "nextPlan");
    steps.push("location", "submit");
    return steps;
  }, [lockedCustomer, isInteraction, completeNow]);

  const activeGuideStep = useMemo((): CheckInGuideStepId | null => {
    if (!guideActive) return null;
    for (const step of guideSteps) {
      if (step === "mode" && !modeAcknowledged) return "mode";
      if (step === "customer" && (!customerId || contactIds.length === 0)) return "customer";
      if (step === "entry" && !entryAcknowledged) return "entry";
      if (step === "content" && !contentReady) return "content";
      if (step === "nextPlan" && !nextPlanReady) return "nextPlan";
      if (step === "location" && !location && !locationSkipped && isInteraction) return "location";
      if (step === "location" && !location && !isInteraction) return "location";
      if (step === "submit") return "submit";
    }
    return "submit";
  }, [
    guideActive,
    guideSteps,
    modeAcknowledged,
    customerId,
    contactIds.length,
    entryAcknowledged,
    contentReady,
    nextPlanReady,
    location,
    locationSkipped,
    isInteraction,
  ]);

  const guideStepIndex =
    activeGuideStep && guideSteps.includes(activeGuideStep)
      ? guideSteps.indexOf(activeGuideStep) + 1
      : 0;

  /** 用户跳过已默认的前置步骤、直接操作后续区块时，自动推进引导 */
  function advanceGuideTo(step: CheckInGuideStepId) {
    if (!guideActive) return;
    const targetIdx = guideSteps.indexOf(step);
    if (targetIdx <= 0) return;

    // 未选好客户+联系人前，只确认打卡类型，不跳过客户步骤
    if (belowLocked) {
      const customerIdx = guideSteps.indexOf("customer");
      if (customerIdx >= 0 && targetIdx > customerIdx) {
        if (!modeAcknowledged) setModeAcknowledged(true);
        return;
      }
    }

    // 往来内容 / 下次计划未完成前，不允许跳到定位之后
    if (afterContentLocked) {
      const contentIdx = guideSteps.indexOf("content");
      const nextPlanIdx = guideSteps.indexOf("nextPlan");
      const gateIdx = !contentReady
        ? contentIdx
        : nextPlanIdx >= 0
          ? nextPlanIdx
          : contentIdx;
      if (gateIdx >= 0 && targetIdx > gateIdx) {
        if (!modeAcknowledged) setModeAcknowledged(true);
        if (!entryAcknowledged) setEntryAcknowledged(true);
        return;
      }
    }

    const prior = guideSteps.slice(0, targetIdx);
    if (prior.includes("mode") && !modeAcknowledged) setModeAcknowledged(true);
    if (prior.includes("entry") && !entryAcknowledged) setEntryAcknowledged(true);
    // 定位不自动跳过：须获取定位或点「暂时跳过定位」
  }

  useEffect(() => {
    if (!partyReady) return;
    if (!modeAcknowledged) setModeAcknowledged(true);
    if (!entryAcknowledged) setEntryAcknowledged(true);
  }, [partyReady, modeAcknowledged, entryAcknowledged]);

  useEffect(() => {
    if (!isInteraction || !customerId) {
      setPendingPlans([]);
      setSelectedPendingKeys([]);
      setPendingPlansLoading(false);
      return;
    }

    let cancelled = false;
    setPendingPlansLoading(true);
    void fetch(`/api/customers/${encodeURIComponent(customerId)}/pending-follow-plans`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: SerializedCustomerPendingFollowPlan[] }) => {
        if (cancelled) return;
        setPendingPlans(data.items ?? []);
        setSelectedPendingKeys([]);
      })
      .catch(() => {
        if (!cancelled) setPendingPlans([]);
      })
      .finally(() => {
        if (!cancelled) setPendingPlansLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, isInteraction]);

  useEffect(() => {
    if (!customerId) return;
    setSuggestedGrade(customerGradeFormValue(currentCustomerGrade));
  }, [customerId, currentCustomerGrade]);

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
    if (lockedCustomer && customerContext) {
      setCheckInMode("interaction");
      setEntryTiming("now");
      setCustomerId(customerContext.customerId);
      setCustomerLabel(customerContext.customerLabel);
      setCurrentCustomerGrade(customerContext.customerGrade ?? null);
      setContactIds(customerContext.initialContactIds ?? []);
      setOpportunityId(customerContext.initialOpportunityId ?? "");
      setOpportunityLabel(customerContext.initialOpportunityLabel ?? "");
      setSuggestedGrade(customerGradeFormValue(customerContext.customerGrade));
    } else {
      setCheckInMode("interaction");
      setEntryTiming("now");
      setCustomerId("");
      setCustomerLabel("");
      setCurrentCustomerGrade(null);
      setContactIds([]);
      setOpportunityId("");
      setOpportunityLabel("");
      setSuggestedGrade("");
    }
    setLocation(null);
    setMethod("FACE_VISIT");
    setContent("");
    setNextFollowUpAt("");
    setNextFollowUpMethod("");
    setNextFollowUpContent("");
    setSelectedPendingKeys([]);
    setQueuedPayload(null);
  }

  function buildPayload(notes: string | null, completedKeys: string[] = []) {
    return {
      checkInMode,
      customerId: isInteraction ? customerId : null,
      contactIds: isInteraction ? contactIds : [],
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      locationText: location?.locationText ?? null,
      addressProvince: location?.addressProvince ?? null,
      addressCity: location?.addressCity ?? null,
      addressDistrict: location?.addressDistrict ?? null,
      addressStreet: location?.addressStreet ?? null,
      notes,
      completeInteractionNow: completeNow,
      completedPendingKeys: completedKeys,
      followUp: completeNow
        ? {
            method,
            content: content.trim(),
            suggestedGrade: customerGradeSubmitValue(suggestedGrade, currentCustomerGrade),
            opportunityId: opportunityId || null,
            nextFollowUpAt: nextFollowUpAt || null,
            nextFollowUpMethod: nextFollowUpMethod || null,
            nextFollowUpContent: nextFollowUpContent.trim() || null,
          }
        : null,
    };
  }

  function finishSubmitSuccess() {
    submittingRef.current = false;
    setNoLocationConfirmOpen(false);
    setPendingPayload(null);
    setCompleteDialogOpen(false);
    setQueuedPayload(null);
    resetForm();
    closeCheckInDialog?.();
    if (customerContext?.returnPath) {
      router.push(customerContext.returnPath);
    }
    router.refresh();
  }

  function runSubmit(
    payload: Record<string, unknown>,
    updateCheckInId?: string,
    completedKeys: string[] = []
  ) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        await submitCheckIn({ ...payload, completedPendingKeys: completedKeys }, updateCheckInId);
      } catch (err) {
        submittingRef.current = false;
        setError(err instanceof Error ? err.message : "打卡失败，请稍后重试");
        return;
      }
      finishSubmitSuccess();
    });
  }

  function proceedSubmit(payload: Record<string, unknown>, completedKeys: string[] = []) {
    if (submittingRef.current) return;
    if (pendingPlansLoading) return;
    if (hasPendingPlans && completeNow && completedKeys.length === 0) {
      setQueuedPayload(payload);
      setCompleteDialogOpen(true);
      return;
    }
    runSubmit(payload, undefined, completedKeys);
  }

  function handleConfirmCompletePending() {
    if (submittingRef.current) return;
    if (!queuedPayload || selectedPendingKeys.length === 0) return;
    runSubmit(queuedPayload, undefined, selectedPendingKeys);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current || pending) return;
    setError(null);
    if (!isInteraction && !location) {
      setError("请先获取定位并解析地址");
      return;
    }
    if (isInteraction && !customerId) {
      setError("请选择客户，或新增客户");
      return;
    }
    if (isInteraction && contactIds.length === 0) {
      setError("请至少选择一位联系人，或新增联系人");
      return;
    }
    if (completeNow && !content.trim()) {
      setError("请填写往来内容");
      return;
    }
    if (completeNow) {
      const planError = validateNextFollowUpPlan(
        suggestedGrade,
        nextFollowUpAt,
        nextFollowUpMethod,
        currentCustomerGrade,
        nextFollowUpContent
      );
      if (planError) {
        setError(planError);
        return;
      }
    }

    const notes = (new FormData(e.currentTarget).get("notes") as string | null)?.trim() || null;
    const payload = buildPayload(notes);

    // 已点「暂时跳过定位」则不再弹确认窗；未跳过且无定位时二次确认
    if (isInteraction && !location && !locationSkipped) {
      setPendingPayload(payload);
      setNoLocationConfirmOpen(true);
      return;
    }

    proceedSubmit(payload);
  }

  function handleConfirmNoLocation() {
    if (submittingRef.current || pending) return;
    if (!pendingPayload) return;
    setNoLocationConfirmOpen(false);
    proceedSubmit(pendingPayload);
  }

  const guideBanner =
    guideActive && activeGuideStep ? (
      <CheckInGuideBanner
        tip={
          activeGuideStep === "location" && !isInteraction
            ? "下一步：请获取定位（无客户打卡必填）"
            : activeGuideStep === "nextPlan" && nextPlanError
              ? `请先完善下次往来计划：${nextPlanError}`
              : CHECK_IN_GUIDE_TIPS[activeGuideStep]
        }
        stepIndex={guideStepIndex}
        stepCount={guideSteps.length}
        onSkip={() => setGuideDismissed(true)}
      >
        {activeGuideStep === "location" && isInteraction ? (
          <div className="flex justify-end px-3 pb-2">
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => setLocationSkipped(true)}
            >
              暂时跳过定位
            </button>
          </div>
        ) : null}
      </CheckInGuideBanner>
    ) : null;

  return (
    <>
      {guideBanner
        ? guidePortalEl
          ? createPortal(guideBanner, guidePortalEl)
          : (
              <div className="sticky top-0 z-30 -mx-4 mb-1">{guideBanner}</div>
            )
        : null}

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        {!lockedCustomer ? (
          <CheckInGuideSection
            stepId="mode"
            active={activeGuideStep === "mode"}
            className="space-y-2 md:col-span-2"
          >
            <Label>打卡类型</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="checkInModeRadio"
                  checked={isInteraction}
                  onChange={() => {
                    setCheckInMode("interaction");
                    setModeAcknowledged(true);
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
                    setModeAcknowledged(true);
                    setCustomerId("");
                    setCustomerLabel("");
                    setContactIds([]);
                    setError(null);
                  }}
                  className="h-4 w-4"
                />
                无客户打卡（仅记录定位）
              </label>
            </div>
          </CheckInGuideSection>
        ) : null}

        {isInteraction ? (
          <>
            <CheckInGuideSection
              stepId="customer"
              active={activeGuideStep === "customer"}
              onEngage={() => advanceGuideTo("customer")}
              className="space-y-4 md:col-span-2"
            >
              <div className="space-y-2">
                {lockedCustomer ? (
                  <div className="space-y-2">
                    <Label>客户</Label>
                    <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                      {customerLabel}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="checkInCustomer">客户</Label>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <CustomerSearchSelect
                          ref={customerSelectRef}
                          id="checkInCustomer"
                          name="customerId"
                          label=""
                          required
                          writableOnly
                          value={customerId}
                          selectedLabel={customerLabel}
                          onValueChange={(id, option) => {
                            setCustomerId(id);
                            setCustomerLabel(option?.label ?? "");
                            const grade = option?.customerGrade ?? null;
                            setCurrentCustomerGrade(grade);
                            setSuggestedGrade(customerGradeFormValue(grade));
                            setContactIds([]);
                            setOpportunityId("");
                            setOpportunityLabel("");
                          }}
                          onCreateNew={openCreateCustomer}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0"
                        onClick={() => openCreateCustomer()}
                      >
                        新增客户
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {hasPendingPlans ? <CustomerPendingFollowPlansPanel items={pendingPlans} /> : null}

              <div className="space-y-2">
                <ContactSelectField
                  customerId={customerId}
                  multiple
                  value={contactIds}
                  onChange={setContactIds}
                  required
                />
              </div>
            </CheckInGuideSection>

            {!lockedCustomer ? (
              <CheckInGuideSection
                stepId="entry"
                active={activeGuideStep === "entry"}
                onEngage={() => advanceGuideTo("entry")}
                className={cn(
                  "space-y-2 md:col-span-2",
                  belowLocked && "pointer-events-none opacity-60"
                )}
              >
                <Label>往来录入</Label>
                <div className="flex flex-wrap gap-4">
                  <label
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      belowLocked ? "cursor-not-allowed" : "cursor-pointer"
                    )}
                  >
                    <input
                      type="radio"
                      name="entryTiming"
                      checked={entryTiming === "now"}
                      disabled={belowLocked}
                      onChange={() => {
                        setEntryTiming("now");
                        setEntryAcknowledged(true);
                      }}
                      className="h-4 w-4"
                    />
                    同时录入往来内容
                  </label>
                  <label
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      belowLocked ? "cursor-not-allowed" : "cursor-pointer"
                    )}
                  >
                    <input
                      type="radio"
                      name="entryTiming"
                      checked={entryTiming === "later"}
                      disabled={belowLocked}
                      onChange={() => {
                        setEntryTiming("later");
                        setEntryAcknowledged(true);
                      }}
                      className="h-4 w-4"
                    />
                    仅打卡，收工后与 AI 补全往来
                  </label>
                </div>
                {belowLocked ? (
                  <p className="text-xs text-muted-foreground">
                    请先选择客户并至少选择一位联系人后再操作
                  </p>
                ) : null}
              </CheckInGuideSection>
            ) : null}

            {completeNow && (
              <>
              <CheckInGuideSection
                stepId="content"
                active={activeGuideStep === "content"}
                onEngage={() => advanceGuideTo("content")}
                className={cn(
                  "space-y-4 rounded-md border bg-muted/30 p-4 md:col-span-2",
                  belowLocked && "pointer-events-none opacity-60"
                )}
              >
                <p className="text-sm font-medium">往来内容</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="checkInMethod">往来方式 *</Label>
                    <select
                      id="checkInMethod"
                      value={method}
                      disabled={belowLocked}
                      required={partyReady}
                      onChange={(e) => setMethod(e.target.value as SalesLogMethod)}
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm",
                        belowLocked ? disabledFieldClass : "bg-background"
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
                      disabled={belowLocked}
                      required={partyReady}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={
                        partyReady ? "沟通要点、客户反馈…" : "请先选择客户和联系人"
                      }
                      className={cn(belowLocked && disabledFieldClass)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className={cn("justify-between gap-2", alignedFieldLabelClass, "flex")}>
                      <Label>关联商机</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={belowLocked}
                        onClick={() => setOpportunityDialogOpen(true)}
                      >
                        新建商机
                      </Button>
                    </div>
                    {partyReady ? (
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
                        placeholder="点击选择关联商机（可选）"
                        className="relative"
                      />
                    ) : (
                      <div className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                        请先选择客户和联系人
                      </div>
                    )}
                  </div>
                  <CustomerGradeSelect
                    id="checkInGrade"
                    label="客户等级（如需调整）"
                    value={suggestedGrade}
                    onValueChange={setSuggestedGrade}
                    options={customerFormOptions.gradeOptions}
                    labelClassName={alignedFieldLabelClass}
                    disabled={belowLocked}
                  />
                </div>
              </CheckInGuideSection>

              <CheckInGuideSection
                stepId="nextPlan"
                active={activeGuideStep === "nextPlan"}
                onEngage={() => advanceGuideTo("nextPlan")}
                className={cn(
                  "space-y-3 rounded-md border bg-muted/30 p-4 md:col-span-2",
                  (belowLocked || !contentReady) && "pointer-events-none opacity-60"
                )}
              >
                <p className="text-sm font-medium">下次往来计划</p>
                {!contentReady ? (
                  <p className="text-xs text-muted-foreground">请先填写往来内容后再填写下次计划</p>
                ) : null}
                <NextFollowUpPlanFields
                  methodId="checkInNextMethod"
                  methodValue={nextFollowUpMethod}
                  onMethodChange={setNextFollowUpMethod}
                  dateId="checkInNextAt"
                  dateValue={nextFollowUpAt}
                  onDateChange={setNextFollowUpAt}
                  contentId="checkInNextContent"
                  contentValue={nextFollowUpContent}
                  onContentChange={setNextFollowUpContent}
                  suggestedGrade={suggestedGrade}
                  currentCustomerGrade={currentCustomerGrade}
                  gradeOptions={customerFormOptions.gradeOptions}
                  disabled={belowLocked || !contentReady}
                  methodSelectClassName={cn(
                    (belowLocked || !contentReady) && disabledFieldClass
                  )}
                  dateInputClassName={cn(
                    (belowLocked || !contentReady) && disabledFieldClass
                  )}
                />
              </CheckInGuideSection>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground md:col-span-2">
            无客户打卡仅记录当前位置与时间，无需绑定客户，也无需补全往来。
          </p>
        )}

        <CheckInGuideSection
          stepId="location"
          active={activeGuideStep === "location"}
          onEngage={() => advanceGuideTo("location")}
          className={cn(
            "md:col-span-2",
            (belowLocked || afterContentLocked) && "pointer-events-none opacity-60"
          )}
        >
          <CheckInLocationPicker
            value={location}
            onChange={(value) => {
              setLocation(value);
              if (value) setLocationSkipped(false);
            }}
            mapKey={mapKey}
            geocodeReady={geocodeReady}
            disabled={pending || belowLocked || afterContentLocked}
            optional={isInteraction}
            skipped={locationSkipped}
            onSkip={
              isInteraction
                ? () => {
                    setLocationSkipped(true);
                    setLocation(null);
                  }
                : undefined
            }
          />
        </CheckInGuideSection>
        <div
          className={cn(
            "space-y-2 md:col-span-2",
            (belowLocked || afterContentLocked) && "pointer-events-none opacity-60"
          )}
        >
          <Label htmlFor="checkInNotes">备注（可选）</Label>
          <Input
            id="checkInNotes"
            name="notes"
            placeholder="如：拜访目的、同行人员"
            disabled={belowLocked || afterContentLocked}
            onFocus={() => advanceGuideTo("submit")}
          />
        </div>
        {error && <p className="text-sm text-destructive md:col-span-2">{error}</p>}
        <CheckInGuideSection
          stepId="submit"
          active={activeGuideStep === "submit"}
          onEngage={() => advanceGuideTo("submit")}
          className={cn(
            "md:col-span-2",
            (belowLocked || afterContentLocked) && "pointer-events-none opacity-60"
          )}
        >
          <Button
            type="submit"
            disabled={
              pending ||
              pendingPlansLoading ||
              belowLocked ||
              afterContentLocked ||
              (!isInteraction && !location) ||
              (isInteraction && !partyReady) ||
              (completeNow && !content.trim())
            }
          >
            {pending ? "提交中…" : pendingPlansLoading ? "加载计划…" : completeNow ? "提交往来打卡" : "提交打卡"}
          </Button>
          {belowLocked ? (
            <p className="mt-2 text-xs text-muted-foreground">
              请先选择客户并至少选择一位联系人。
            </p>
          ) : afterContentLocked ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {completeNow && !content.trim()
                ? "请先填写往来内容。"
                : nextPlanError
                  ? `请完善下次往来计划：${nextPlanError}`
                  : "请先完善往来内容与下次计划。"}
            </p>
          ) : !isInteraction && !location ? (
            <p className="mt-2 text-xs text-muted-foreground">无客户打卡须先获取定位。</p>
          ) : isInteraction && !location && !locationSkipped ? (
            <p className="mt-2 text-xs text-muted-foreground">
              定位可选。可点「暂时跳过定位」，或直接提交后确认不记录地点。
            </p>
          ) : null}
        </CheckInGuideSection>
      </form>

      <Dialog open={noLocationConfirmOpen} onOpenChange={setNoLocationConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>未获取定位</DialogTitle>
            <DialogDescription>
              您尚未获取定位，本次往来打卡将不记录地点信息。确定继续提交吗？
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setNoLocationConfirmOpen(false);
                setPendingPayload(null);
              }}
            >
              返回定位
            </Button>
            <Button type="button" disabled={pending} onClick={handleConfirmNoLocation}>
              {pending ? "提交中…" : "确认提交"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
          setCurrentCustomerGrade(customer.customerGrade ?? null);
          setSuggestedGrade(customerGradeFormValue(customer.customerGrade));
          setContactIds([]);
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

      <CompletePendingFollowUpDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        items={pendingPlans}
        selectedKeys={selectedPendingKeys}
        onSelectedKeysChange={setSelectedPendingKeys}
        onConfirm={handleConfirmCompletePending}
        pending={pending}
      />
    </>
  );
}
