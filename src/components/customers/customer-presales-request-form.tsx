import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPresalesRequest } from "@/app/(dashboard)/projects/presales-actions";
import { format } from "date-fns";

type PresalesUser = { id: string; name: string };

type Props = {
  customerId: string;
  presalesUsers: PresalesUser[];
};

/** 客户详情：销售申请售前支援 */
export function CustomerPresalesRequestForm({ customerId, presalesUsers }: Props) {
  return (
    <form action={createPresalesRequest} className="space-y-3 rounded-md border p-4">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm font-medium">申请售前支援</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="presales-start">开始日期</Label>
          <Input
            id="presales-start"
            name="startDate"
            type="date"
            required
            defaultValue={format(new Date(), "yyyy-MM-dd")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="presales-end">结束日期（可选）</Label>
          <Input id="presales-end" name="endDate" type="date" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="presales-user">期望售前人员（可选）</Label>
          <select
            id="presales-user"
            name="preferredPresalesUserId"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue=""
          >
            <option value="">不指定</option>
            {presalesUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="presales-notes">说明</Label>
          <Textarea id="presales-notes" name="notes" rows={2} placeholder="支援内容、现场要求等" />
        </div>
      </div>
      <Button type="submit" size="sm">
        提交申请
      </Button>
    </form>
  );
}
