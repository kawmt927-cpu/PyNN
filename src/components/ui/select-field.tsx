import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type Option = { value: string; label: string };

type Props = {
  id: string;
  label: string;
  name: string;
  options: Option[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  className?: string;
};

export function SelectField({
  id,
  label,
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  required,
  className,
}: Props) {
  const controlled = value !== undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        {...(controlled
          ? { value, onChange: (e) => onValueChange?.(e.target.value) }
          : { defaultValue })}
        required={required}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
