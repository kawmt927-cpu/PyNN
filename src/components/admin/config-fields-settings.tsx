"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  CONFIG_CATEGORY,
  CONFIG_CATEGORY_LABELS,
  type ConfigCategory,
  type ConfigModuleDef,
} from "@/lib/config-options";
import { CustomerFieldOptionsPanel } from "@/components/admin/customer-field-options-panel";
import { CustomerGradeOptionsPanel } from "@/components/admin/customer-grade-options-panel";
import { CustomerTagOptionsPanel } from "@/components/admin/customer-tag-options-panel";

type ConfigOptionRow = {
  id: string;
  category: string;
  value: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  color?: string | null;
  followUpIntervalDays?: number | null;
};

type Props = {
  modules: ConfigModuleDef[];
  optionsByCategory: Record<string, ConfigOptionRow[]>;
  initialModule?: string;
  initialField?: string;
};

type PendingNavigation = {
  moduleId: string;
  fieldCategory: string;
};

function UnsavedChangesDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="unsaved-changes-title" className="text-lg font-semibold">
          未保存的修改
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          当前字段有未保存的修改，切换后将丢失这些更改。确定继续吗？
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            留在此页
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            放弃修改
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ConfigFieldsSettings({
  modules,
  optionsByCategory,
  initialModule,
  initialField,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const defaultModule = initialModule ?? modules[0]?.id ?? "";
  const defaultField =
    initialField ?? modules.find((mod) => mod.id === defaultModule)?.fields[0]?.category ?? "";

  const [moduleId, setModuleId] = useState(defaultModule);
  const [fieldCategory, setFieldCategory] = useState(defaultField);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  const activeModule = useMemo(
    () => modules.find((mod) => mod.id === moduleId) ?? modules[0],
    [modules, moduleId]
  );

  const activeField = useMemo(() => {
    const found = activeModule?.fields.find((field) => field.category === fieldCategory);
    return found ?? activeModule?.fields[0];
  }, [activeModule, fieldCategory]);

  if (!activeModule || !activeField) {
    return <p className="text-sm text-muted-foreground">暂无可配置的字段选项。</p>;
  }

  const activeOptions = optionsByCategory[activeField.category] ?? [];
  const fieldTitle =
    CONFIG_CATEGORY_LABELS[activeField.category as ConfigCategory] ?? activeField.label;

  function updateUrl(nextModule: string, nextField: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "fields");
    params.set("module", nextModule);
    params.set("field", nextField);
    router.replace(`/admin/settings?${params.toString()}`, { scroll: false });
  }

  function applyNavigation(nextModuleId: string, nextField: string) {
    setModuleId(nextModuleId);
    setFieldCategory(nextField);
    setIsDirty(false);
    setPendingNavigation(null);
    updateUrl(nextModuleId, nextField);
  }

  function requestNavigation(nextModuleId: string, nextField: string) {
    if (isDirty) {
      setPendingNavigation({ moduleId: nextModuleId, fieldCategory: nextField });
      return;
    }
    applyNavigation(nextModuleId, nextField);
  }

  function handleModuleChange(nextModuleId: string) {
    const mod = modules.find((item) => item.id === nextModuleId) ?? modules[0];
    const nextField = mod?.fields[0]?.category ?? "";
    requestNavigation(mod.id, nextField);
  }

  function handleFieldChange(nextField: string) {
    requestNavigation(moduleId, nextField);
  }

  return (
    <div className="space-y-4">
      {pendingNavigation && (
        <UnsavedChangesDialog
          onCancel={() => setPendingNavigation(null)}
          onConfirm={() =>
            applyNavigation(pendingNavigation.moduleId, pendingNavigation.fieldCategory)
          }
        />
      )}

      <div className="grid gap-4 rounded-md border bg-muted/30 p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="config-module">配置模块</Label>
          <select
            id="config-module"
            value={activeModule.id}
            onChange={(e) => handleModuleChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {modules.map((mod) => (
              <option key={mod.id} value={mod.id}>
                {mod.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="config-field">字段类型</Label>
          <select
            id="config-field"
            value={activeField.category}
            onChange={(e) => handleFieldChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {activeModule.fields.map((field) => (
              <option key={field.category} value={field.category}>
                {field.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeField.category === CONFIG_CATEGORY.CUSTOMER_TAG ? (
        <CustomerTagOptionsPanel
          key={`${activeModule.id}-${activeField.category}`}
          options={activeOptions}
          onDirtyChange={setIsDirty}
        />
      ) : activeField.category === CONFIG_CATEGORY.CUSTOMER_GRADE ||
        activeField.category === CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE ? (
        <CustomerGradeOptionsPanel
          key={`${activeModule.id}-${activeField.category}`}
          options={activeOptions}
          category={activeField.category}
          tone={
            activeField.category === CONFIG_CATEGORY.CHANNEL_CUSTOMER_GRADE
              ? "blue"
              : "amber"
          }
          onDirtyChange={setIsDirty}
        />
      ) : (
        <CustomerFieldOptionsPanel
          key={`${activeModule.id}-${activeField.category}`}
          category={activeField.category}
          title={fieldTitle}
          options={activeOptions}
          onDirtyChange={setIsDirty}
        />
      )}
    </div>
  );
}
