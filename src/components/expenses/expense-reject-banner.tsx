import { format } from "date-fns";

type Props = {
  reason: string;
  actorName?: string | null;
  at?: Date | null;
};

export function ExpenseRejectBanner({ reason, actorName, at }: Props) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
      <p className="font-medium text-destructive">驳回原因：{reason}</p>
      <p className="mt-1 text-destructive/90">
        本次申请未通过审批。请按原因修改后重新提交。
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {actorName ? `驳回人：${actorName}` : "已驳回"}
        {at ? ` · ${format(at, "yyyy-MM-dd HH:mm")}` : ""}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        重新提交将再次走完整审批流程；驳回原因已保存，申请人及各环节审批人均可查看；已填内容与凭证会保留，可继续编辑。
      </p>
    </div>
  );
}
