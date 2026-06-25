import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { assignCustomerToSales } from "@/app/(dashboard)/customers/actions";
import { POOL_OWNER_VALUE } from "@/lib/customers/constants";
import { canManageCustomerOwner } from "@/lib/customers/access";
import type { UserRole } from "@prisma/client";

type SalesUser = { id: string; name: string };

type Props = {
  customerId: string;
  ownerId: string | null;
  ownerName: string | null;
  assistantNames?: string[];
  role: UserRole;
  salesUsers: SalesUser[];
};

export function CustomerOwnerPanel({
  customerId,
  ownerId,
  ownerName,
  assistantNames = [],
  role,
  salesUsers,
}: Props) {
  const inPool = ownerId === null;
  const canManage = canManageCustomerOwner(role);
  const showPoolOption = canManage && !inPool;
  const showAssignForm = canManage && (salesUsers.length > 0 || showPoolOption);

  if (!canManage && !inPool) return null;

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">负责人：</span>
          <span className="font-medium">{ownerName ?? "公海池（未分配）"}</span>
        </div>
        {assistantNames.length > 0 ? (
          <div className="text-sm">
            <span className="text-muted-foreground">协助负责人：</span>
            <span className="font-medium">{assistantNames.join("、")}</span>
          </div>
        ) : null}
      </div>

      {showAssignForm && (
        <form action={assignCustomerToSales} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="customerId" value={customerId} />
          <Label htmlFor={`assign-${customerId}`} className="shrink-0 text-sm">
            分配给
          </Label>
          <select
            id={`assign-${customerId}`}
            name="salesUserId"
            required
            defaultValue=""
            className="h-9 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="" disabled>
              请选择
            </option>
            {showPoolOption && (
              <option value={POOL_OWNER_VALUE}>公海池（未分配）</option>
            )}
            {salesUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="secondary">
            确认
          </Button>
        </form>
      )}
    </div>
  );
}
