export type IntegrationStatusTone = "ready" | "warning" | "muted" | "error";

export type IntegrationStatusItem = {
  title: string;
  label: string;
  tone: IntegrationStatusTone;
  hint?: string;
};

const TONE_CLASS: Record<IntegrationStatusTone, string> = {
  ready: "text-green-600 dark:text-green-400",
  warning: "text-orange-600 dark:text-orange-400",
  muted: "text-muted-foreground",
  error: "text-destructive",
};

type Props = {
  items: IntegrationStatusItem[];
  columns?: 2 | 3;
};

export function IntegrationStatusGrid({ items, columns = 2 }: Props) {
  const gridClass =
    columns === 3
      ? "grid gap-3 text-sm md:grid-cols-3"
      : "grid gap-3 text-sm md:grid-cols-2";

  return (
    <div className={gridClass}>
      {items.map((item) => (
        <div key={item.title} className="rounded-md border p-3">
          <p className="font-medium">{item.title}</p>
          <p className="mt-1 text-muted-foreground">
            状态：
            <span className={TONE_CLASS[item.tone]}>{item.label}</span>
          </p>
          {item.hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function integrationTone(ready: boolean, warning = true): IntegrationStatusTone {
  if (ready) return "ready";
  return warning ? "warning" : "muted";
}
