"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import {
  CONFIG_MODULES,
  CONFIG_CATEGORY_LABELS,
  type ConfigCategory,
} from "@/lib/config-options";
import { CustomerFieldOptionsPanel } from "@/components/admin/customer-field-options-panel";

type ConfigOptionRow = {
  id: string;
  category: string;
  value: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
};

type Props = {
  optionsByCategory: Record<string, ConfigOptionRow[]>;
  initialModule?: string;
  initialField?: string;
};

export function ConfigFieldsSettings({
  optionsByCategory,
  initialModule,
  initialField,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const defaultModule = initialModule ?? CONFIG_MODULES[0]?.id ?? "customer";
  const defaultField =
    initialField ?? CONFIG_MODULES.find((m) => m.id === defaultModule)?.fields[0]?.category ?? "";

  const [moduleId, setModuleId] = useState(defaultModule);
  const [fieldCategory, setFieldCategory] = useState(defaultField);

  const activeModule = useMemo(
    () => CONFIG_MODULES.find((m) => m.id === moduleId) ?? CONFIG_MODULES[0],
    [moduleId]
  );

  const activeField = useMemo(() => {
    const found = activeModule.fields.find((f) => f.category === fieldCategory);
    return found ?? activeModule.fields[0];
  }, [activeModule, fieldCategory]);

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

  function handleModuleChange(nextModuleId: string) {
    const mod = CONFIG_MODULES.find((m) => m.id === nextModuleId) ?? CONFIG_MODULES[0];
    const nextField = mod.fields[0]?.category ?? "";
    setModuleId(mod.id);
    setFieldCategory(nextField);
    updateUrl(mod.id, nextField);
  }

  function handleFieldChange(nextField: string) {
    setFieldCategory(nextField);
    updateUrl(moduleId, nextField);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-md border bg-muted/30 p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="config-module">配置模块</Label>
          <select
            id="config-module"
            value={moduleId}
            onChange={(e) => handleModuleChange(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {CONFIG_MODULES.map((mod) => (
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

      <CustomerFieldOptionsPanel
        key={`${moduleId}-${activeField.category}`}
        category={activeField.category}
        title={fieldTitle}
        options={activeOptions}
      />
    </div>
  );
}
