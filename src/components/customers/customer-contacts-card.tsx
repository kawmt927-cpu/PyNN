"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactList } from "@/components/customers/contact-list";
import type { ConfigOptionItem } from "@/lib/config-options";
import type { Contact } from "@prisma/client";

type Props = {
  customerId: string;
  contacts: Contact[];
  readOnly?: boolean;
  titleOptions: ConfigOptionItem[];
  departmentOptions: ConfigOptionItem[];
  roleOptions: ConfigOptionItem[];
};

export function CustomerContactsCard({
  customerId,
  contacts,
  readOnly,
  titleOptions,
  departmentOptions,
  roleOptions,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">
          联系人
          <span className="ml-2 text-sm font-normal text-muted-foreground">({contacts.length})</span>
        </CardTitle>
        {!readOnly ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            新增联系人
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <ContactList
          customerId={customerId}
          contacts={contacts}
          readOnly={readOnly}
          titleOptions={titleOptions}
          departmentOptions={departmentOptions}
          roleOptions={roleOptions}
          addOpen={addOpen}
          onAddOpenChange={setAddOpen}
        />
      </CardContent>
    </Card>
  );
}
