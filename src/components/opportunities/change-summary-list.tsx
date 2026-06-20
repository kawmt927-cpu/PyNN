function splitChangeSummary(summary: string) {
  return summary
    .split(/;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type Props = {
  summary: string;
  title?: string;
  className?: string;
};

export function ChangeSummaryList({
  summary,
  title = "同步更新商机",
  className = "mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground",
}: Props) {
  const items = splitChangeSummary(summary);
  if (items.length === 0) return null;

  return (
    <div className={className}>
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, index) => (
          <li key={index} className="leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
