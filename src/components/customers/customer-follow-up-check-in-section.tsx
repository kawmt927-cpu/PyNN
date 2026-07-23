import { canManageCustomerOwner, listCustomerAssignableUsers } from "@/lib/customers/access";
import { getEffectiveAmapConfig } from "@/lib/amap/config";
import { loadInteractionFormOptions } from "@/lib/config-options";
import {
  CheckInForm,
  type CheckInCustomerContext,
} from "@/components/sales-log/check-in-form";
import {
  type SerializedCustomerPendingFollowPlan,
} from "@/lib/follow-ups/unified";
import type { UserRole } from "@prisma/client";

type Props = {
  role: UserRole;
  customer: {
    id: string;
    name: string;
    customerGrade: string | null;
    contacts: Array<{ id: string; isPrimary: boolean }>;
  };
  pendingPlans: SerializedCustomerPendingFollowPlan[];
  returnPath: string;
  initialContactId?: string;
  initialOpportunityId?: string;
  initialOpportunityLabel?: string;
};

export async function CustomerFollowUpCheckInSection({
  role,
  customer,
  pendingPlans,
  returnPath,
  initialContactId,
  initialOpportunityId,
  initialOpportunityLabel,
}: Props) {
  const [interactionFormOptions, salesUsers, amap] = await Promise.all([
    loadInteractionFormOptions(),
    canManageCustomerOwner(role) ? listCustomerAssignableUsers() : Promise.resolve([]),
    getEffectiveAmapConfig(),
  ]);

  const primaryContact =
    customer.contacts.find((contact) => contact.isPrimary) ?? customer.contacts[0];

  const customerContext: CheckInCustomerContext = {
    customerId: customer.id,
    customerLabel: customer.name,
    customerGrade: customer.customerGrade,
    initialContactIds: initialContactId
      ? [initialContactId]
      : primaryContact?.id
        ? [primaryContact.id]
        : [],
    initialOpportunityId,
    initialOpportunityLabel,
    pendingPlans,
    returnPath,
  };

  return (
    <div className="space-y-4">
      {!amap.webServiceKey ? (
        <p className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          打卡地址解析尚未配置，定位功能可能不可用。请联系管理员在系统配置中填写高德 Web 服务 Key。
        </p>
      ) : null}
      <CheckInForm
        mapKey={amap.jsKey}
        geocodeReady={Boolean(amap.webServiceKey)}
        customerFormOptions={{
          ...interactionFormOptions,
          showOwnerSelect: canManageCustomerOwner(role),
          salesUsers,
        }}
        customerContext={customerContext}
      />
    </div>
  );
}
