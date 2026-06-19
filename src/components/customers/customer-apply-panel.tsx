import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyForCustomer } from "@/app/(dashboard)/approvals/actions";

type Props = {
  customerId: string;
  hasPendingRequest: boolean;
};

export function CustomerApplyPanel({ customerId, hasPendingRequest }: Props) {
  if (hasPendingRequest) {
    return (
      <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
        已提交认领申请，请等待销售管理或管理员审批。
      </div>
    );
  }

  return (
    <form action={applyForCustomer} className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-4">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="min-w-[200px] flex-1 space-y-2">
        <Label htmlFor={`apply-msg-${customerId}`}>申请说明（可选）</Label>
        <Textarea
          id={`apply-msg-${customerId}`}
          name="message"
          rows={2}
          placeholder="简要说明申请理由…"
          className="resize-none"
        />
      </div>
      <Button type="submit" size="sm">
        申请客户
      </Button>
    </form>
  );
}
