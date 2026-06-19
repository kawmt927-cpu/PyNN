"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import { addCustomerRelation, removeCustomerRelation } from "@/app/(dashboard)/customers/actions";
import type { CustomerCategory } from "@prisma/client";

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

type Candidate = RelatedCustomer;

type Props = {
  customerId: string;
  relations: RelationItem[];
  candidates: Candidate[];
  typeLabels: Record<string, string>;
  readOnly?: boolean;
};

export function CustomerRelationsPanel({
  customerId,
  relations,
  candidates,
  typeLabels,
  readOnly,
}: Props) {
  return (
    <div className="space-y-4">
      {relations.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无关联客户</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {relations.map((r) => (
            <li key={r.relationId} className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Link href={`/customers/${r.customer.id}`} className="font-medium text-primary hover:underline">
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
            <div className="space-y-2">
              <Label htmlFor="relatedCustomerId">关联客户</Label>
              <select
                id="relatedCustomerId"
                name="relatedCustomerId"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">请选择</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{CUSTOMER_CATEGORY_LABELS[c.category]}）
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationNote">关系说明</Label>
              <Input id="relationNote" name="relationNote" placeholder="如：上级单位、渠道伙伴" />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={candidates.length === 0}>
            添加关联
          </Button>
        </form>
      )}
    </div>
  );
}
