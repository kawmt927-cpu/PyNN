"use client";

import { SelectField } from "@/components/ui/select-field";
import { getCustomerGradeOptions } from "@/lib/customers/grade";

type Props = {
  id?: string;
  name?: string;
  label?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  className?: string;
};

function withEmptyOption(options: { value: string; label: string }[]) {
  return [{ value: "", label: "请选择" }, ...options];
}

export function CustomerGradeSelect({
  id = "customerGrade",
  name = "customerGrade",
  label = "客户等级",
  value,
  defaultValue = "",
  onValueChange,
  required = false,
  className,
}: Props) {
  const gradeOptions = getCustomerGradeOptions();
  const options = withEmptyOption(gradeOptions);
  const displayLabel = required ? `${label} *` : label;

  return (
    <SelectField
      id={id}
      label={displayLabel}
      name={name}
      options={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      required={required}
      className={className}
    />
  );
}
