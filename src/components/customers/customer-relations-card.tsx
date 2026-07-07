"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerRelationsPanel } from "@/components/customers/customer-relations-panel";
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

type Props = {
  customerId: string;
  relations: RelationItem[];
  excludeIds: string[];
  typeLabels: Record<string, string>;
  readOnly?: boolean;
  linkReturnTo?: string;
};

export function CustomerRelationsCard({
  customerId,
  relations,
  excludeIds,
  typeLabels,
  readOnly,
  linkReturnTo,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">
          关联客户
          <span className="ml-2 text-sm font-normal text-muted-foreground">({relations.length})</span>
        </CardTitle>
        {!readOnly ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            添加关联
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <CustomerRelationsPanel
          customerId={customerId}
          relations={relations}
          excludeIds={excludeIds}
          typeLabels={typeLabels}
          readOnly={readOnly}
          linkReturnTo={linkReturnTo}
          addOpen={addOpen}
          onAddOpenChange={setAddOpen}
        />
      </CardContent>
    </Card>
  );
}
