"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import {
  DEAL_EXTRA_PARTY_ROLES,
  DEAL_PARTY_ROLE_LABELS,
  type DealPartyDraft,
} from "@/lib/deals/party-roles";
import type { DealPartyRole } from "@prisma/client";
import { nextClientKey } from "@/lib/ui/stable-client-key";

type Props = {
  parties: DealPartyDraft[];
  onChange: (parties: DealPartyDraft[]) => void;
  /** 主要客户等已占用 id，搜索时排除 */
  excludeCustomerIds?: string[];
  title?: string;
  description?: string;
};

export function DealPartiesEditor({
  parties,
  onChange,
  excludeCustomerIds = [],
  title = "关联其他客户",
  description = "用于渠道、第三方等；与主要客户分开维护，同一客户不可重复。",
}: Props) {
  const excludeIds = [
    ...excludeCustomerIds,
    ...parties.map((p) => p.customerId).filter(Boolean),
  ];

  function updateAt(index: number, patch: Partial<DealPartyDraft>) {
    onChange(parties.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeAt(index: number) {
    onChange(parties.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([
      ...parties,
      {
        key: nextClientKey("party"),
        customerId: "",
        customerName: "",
        role: "CHANNEL",
        note: "",
      },
    ]);
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      {parties.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未添加渠道/第三方等关联客户</p>
      ) : (
        <ul className="space-y-4">
          {parties.map((row, index) => (
            <li key={row.key} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm">关联 {index + 1}</Label>
                <Button type="button" size="sm" variant="ghost" onClick={() => removeAt(index)}>
                  移除
                </Button>
              </div>
              <CustomerSearchSelect
                id={`party-customer-${row.key}`}
                name={`partyCustomer-${row.key}`}
                label="客户 *"
                required
                value={row.customerId}
                selectedLabel={row.customerName}
                excludeIds={excludeIds.filter((id) => id !== row.customerId)}
                onValueChange={(customerId, option) =>
                  updateAt(index, {
                    customerId,
                    customerName: option?.label ?? "",
                  })
                }
              />
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`party-role-${row.key}`}>角色 *</Label>
                  <select
                    id={`party-role-${row.key}`}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={row.role}
                    onChange={(e) =>
                      updateAt(index, { role: e.target.value as DealPartyRole })
                    }
                  >
                    {DEAL_EXTRA_PARTY_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {DEAL_PARTY_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`party-note-${row.key}`}>备注</Label>
                  <Input
                    id={`party-note-${row.key}`}
                    value={row.note}
                    onChange={(e) => updateAt(index, { note: e.target.value })}
                    placeholder="可选"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" size="sm" variant="outline" onClick={addRow}>
        添加关联客户
      </Button>
    </div>
  );
}

export function partiesToJson(parties: DealPartyDraft[]): string {
  return JSON.stringify(
    parties
      .filter((p) => p.customerId.trim())
      .map((p) => ({
        customerId: p.customerId,
        role: p.role,
        note: p.note.trim() || null,
      }))
  );
}
