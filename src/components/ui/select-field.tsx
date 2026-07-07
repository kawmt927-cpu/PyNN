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
  labelClassName?: string;
  disabled?: boolean;
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
  labelClassName,
  disabled,
}: Props) {
  const controlled = value !== undefined;
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id} className={cn("block min-h-5 leading-5", labelClassName)}>
        {label}
      </Label>
      <select
        id={id}
        name={name}
        {...(controlled
          ? { value, onChange: (e) => onValueChange?.(e.target.value) }
          : { defaultValue })}
        required={required}
        disabled={disabled}
        className={cn(
          "flex h-10 w-full rounded-md border border-input px-3 py-0 text-sm leading-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled ? "cursor-not-allowed bg-muted text-muted-foreground" : "bg-background"
        )}
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
