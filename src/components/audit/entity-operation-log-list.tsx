type LogItem = {
  id: string;
  action: string;
  summary: string;
  detail: string | null;
  createdAt: Date | string;
  user: { name: string };
};

function formatWhen(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EntityOperationLogList({ logs }: { logs: LogItem[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无操作记录</p>;
  }

  return (
    <ul className="space-y-3">
      {logs.map((log) => (
        <li key={log.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{log.summary}</p>
            <time className="text-xs text-muted-foreground">{formatWhen(log.createdAt)}</time>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {log.user.name}
            <span className="mx-1.5">·</span>
            {log.action}
          </p>
          {log.detail ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{log.detail}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
