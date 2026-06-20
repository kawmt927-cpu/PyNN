export type CustomerTagColorOption = {
  value: string;
  label: string;
  textColor: string;
};

/** 柔和预设色（中等饱和度），供标签配置选用 */
export const CUSTOMER_TAG_COLOR_OPTIONS: CustomerTagColorOption[] = [
  { value: "#bfdbfe", label: "灰蓝", textColor: "#1e40af" },
  { value: "#bae6fd", label: "雾蓝", textColor: "#0369a1" },
  { value: "#a7f3d0", label: "青灰", textColor: "#047857" },
  { value: "#bbf7d0", label: "苔藓", textColor: "#15803d" },
  { value: "#fde68a", label: "沙棕", textColor: "#b45309" },
  { value: "#fecdd3", label: "藕粉", textColor: "#be123c" },
  { value: "#ddd6fe", label: "淡紫", textColor: "#6d28d9" },
  { value: "#cbd5e1", label: "石板", textColor: "#334155" },
];

export const DEFAULT_TAG_COLOR = CUSTOMER_TAG_COLOR_OPTIONS[0].value;

const LEGACY_COLOR_MAP: Record<string, string> = {
  "#64748b": DEFAULT_TAG_COLOR,
  "#2563eb": CUSTOMER_TAG_COLOR_OPTIONS[1].value,
  "#7c3aed": CUSTOMER_TAG_COLOR_OPTIONS[6].value,
  "#dc2626": CUSTOMER_TAG_COLOR_OPTIONS[5].value,
  // 旧版低饱和色 → 新预设（按同名标签映射）
  "#d4dce4": CUSTOMER_TAG_COLOR_OPTIONS[0].value,
  "#cfd9e6": CUSTOMER_TAG_COLOR_OPTIONS[1].value,
  "#ccdad4": CUSTOMER_TAG_COLOR_OPTIONS[2].value,
  "#d6dcc8": CUSTOMER_TAG_COLOR_OPTIONS[3].value,
  "#e0d5c8": CUSTOMER_TAG_COLOR_OPTIONS[4].value,
  "#e2d0d0": CUSTOMER_TAG_COLOR_OPTIONS[5].value,
  "#d8d0e0": CUSTOMER_TAG_COLOR_OPTIONS[6].value,
  "#d0d8dc": CUSTOMER_TAG_COLOR_OPTIONS[7].value,
};

export function isCustomerTagColor(color: string): boolean {
  return CUSTOMER_TAG_COLOR_OPTIONS.some(
    (option) => option.value.toLowerCase() === color.toLowerCase()
  );
}

export function normalizeTagColor(color: string | null | undefined): string {
  const trimmed = color?.trim();
  if (!trimmed) return DEFAULT_TAG_COLOR;

  const preset = CUSTOMER_TAG_COLOR_OPTIONS.find(
    (option) => option.value.toLowerCase() === trimmed.toLowerCase()
  );
  if (preset) return preset.value;

  const legacy = LEGACY_COLOR_MAP[trimmed.toLowerCase()];
  if (legacy) return legacy;

  return DEFAULT_TAG_COLOR;
}

export function getTagTextColor(backgroundColor: string): string {
  const normalized = normalizeTagColor(backgroundColor);
  return (
    CUSTOMER_TAG_COLOR_OPTIONS.find((option) => option.value === normalized)?.textColor ??
    "#475569"
  );
}

export function getTagColorLabel(backgroundColor: string): string | null {
  const normalized = normalizeTagColor(backgroundColor);
  return CUSTOMER_TAG_COLOR_OPTIONS.find((option) => option.value === normalized)?.label ?? null;
}

export function pickAvailableTagColor(usedColors: string[]): string | null {
  const used = new Set(usedColors.map((color) => color.toLowerCase()));
  return (
    CUSTOMER_TAG_COLOR_OPTIONS.find((option) => !used.has(option.value.toLowerCase()))?.value ??
    null
  );
}

export function hasDuplicateTagColors(colors: string[]): boolean {
  const normalized = colors.map((color) => normalizeTagColor(color).toLowerCase());
  return new Set(normalized).size !== normalized.length;
}

export function isTagColorAvailable(color: string, usedColors: string[]): boolean {
  const normalized = normalizeTagColor(color).toLowerCase();
  return !usedColors.some((used) => used.toLowerCase() === normalized);
}
