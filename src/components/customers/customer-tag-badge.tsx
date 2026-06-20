import { cn } from "@/lib/utils";
import { getTagTextColor } from "@/lib/customers/tag-colors";
import type { CustomerTagDefinition } from "@/lib/customers/tags";

type Props = {
  label: string;
  color: string;
  textColor?: string;
  className?: string;
};

export function CustomerTagBadge({ label, color, textColor, className }: Props) {
  const fg = textColor ?? getTagTextColor(color);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{ backgroundColor: color, color: fg }}
    >
      {label}
    </span>
  );
}

export function CustomerTagList({
  tags,
  definitions,
  className,
}: {
  tags: string[];
  definitions: CustomerTagDefinition[];
  className?: string;
}) {
  if (!tags.length) return null;

  const definitionMap = new Map(definitions.map((item) => [item.value, item]));

  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {tags.map((value) => {
        const definition = definitionMap.get(value);
        if (!definition) return null;
        return (
          <CustomerTagBadge
            key={value}
            label={definition.label}
            color={definition.color}
            textColor={definition.textColor}
          />
        );
      })}
    </span>
  );
}
