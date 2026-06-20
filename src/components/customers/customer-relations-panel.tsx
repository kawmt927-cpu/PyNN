"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import { addCustomerRelation, removeCustomerRelation } from "@/app/(dashboard)/customers/actions";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import type { CustomerCategory } from "@prisma/client";
import { withReturnTo } from "@/lib/navigation/return-to";

type RelatedCustomer = {
  id: string;
  name: string;
  category: CustomerCategory;
  customerType: string | null;
};

type RelationItem = {
  relationId: string;
  customer: RelatedCustomer;
  relationNote: string | null;
};

type Props = {
  customerId: string;
  relations: RelationItem[];
  excludeIds: string[];
  typeLabels: Record<string, string>;
  readOnly?: boolean;
  linkReturnTo?: string;
};

export function CustomerRelationsPanel({
  customerId,
  relations,
  excludeIds,
  typeLabels,
  readOnly,
  linkReturnTo,
}: Props) {
  const customerHref = (id: string) =>
    linkReturnTo ? withReturnTo(`/customers/${id}`, linkReturnTo) : `/customers/${id}`;

  const [relatedCustomerId, setRelatedCustomerId] = useState("");
  const [relatedCustomerLabel, setRelatedCustomerLabel] = useState("");

  return (
    <div className="space-y-4">
      {relations.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无关联客户</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {relations.map((r) => (
            <li key={r.relationId} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Link href={customerHref(r.customer.id)} className="font-medium text-primary hover:underline">
                  {r.customer.name}
                </Link>
                <p className="text-muted-foreground">
                  {CUSTOMER_CATEGORY_LABELS[r.customer.category]}
                  {r.customer.customerType && ` · ${typeLabels[r.customer.customerType] ?? r.customer.customerType}`}
                  {r.relationNote && ` · ${r.relationNote}`}
                </p>
              </div>
              <form action={removeCustomerRelation}>
                <input type="hidden" name="relationId" value={r.relationId} />
                <input type="hidden" name="customerId" value={customerId} />
                {!readOnly && (
                  <Button type="submit" variant="ghost" size="sm">
                    移除
                  </Button>
                )}
              </form>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <form action={addCustomerRelation} className="space-y-3 rounded-md border p-4">
          <input type="hidden" name="customerId" value={customerId} />
          <p className="text-sm font-medium">添加关联客户</p>
          <div className="grid gap-3 md:grid-cols-2">
            <CustomerSearchSelect
              id="relatedCustomerId"
              name="relatedCustomerId"
              label="关联客户"
              required
              value={relatedCustomerId}
              selectedLabel={relatedCustomerLabel}
              excludeId={customerId}
              excludeIds={excludeIds}
              onValueChange={(id, option) => {
                setRelatedCustomerId(id);
                setRelatedCustomerLabel(option?.label ?? "");
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="relationNote">关系说明</Label>
              <Input id="relationNote" name="relationNote" placeholder="如：上级单位、渠道伙伴" />
            </div>
          </div>
          <Button type="submit" size="sm">
            添加关联
          </Button>
        </form>
      )}
    </div>
  );
}
