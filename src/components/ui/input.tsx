import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, autoComplete, ...props }, ref) => {
    const resolvedAutoComplete = autoComplete ?? "off";
    const suppressAutofill = resolvedAutoComplete === "off";

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-0 text-sm leading-10 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          type === "number" &&
            "[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          type === "date" &&
            [
              "min-w-[10.5rem] shrink-0 px-2",
              "[&::-webkit-date-and-time-value]:min-h-[1.25rem]",
              "[&::-webkit-datetime-edit]:min-w-0 [&::-webkit-datetime-edit]:p-0 [&::-webkit-datetime-edit]:leading-normal",
              "[&::-webkit-calendar-picker-indicator]:ml-0.5 [&::-webkit-calendar-picker-indicator]:shrink-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer",
            ].join(" "),
          className
        )}
        ref={ref}
        autoComplete={resolvedAutoComplete}
        {...(suppressAutofill
          ? {
              "data-1p-ignore": true,
              "data-lpignore": "true",
              "data-bwignore": true,
              "data-form-type": "other",
            }
          : {})}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
