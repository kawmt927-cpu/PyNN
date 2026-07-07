"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import { CUSTOMER_CATEGORY_LABELS } from "@/lib/permissions";
import { addCustomerRelation, removeCustomerRelation } from "@/app/(dashboard)/customers/actions";
import { CustomerSearchSelect } from "@/components/customers/customer-search-select";
import type { CustomerCategory } from "@prisma/client";
import { withReturnTo } from "@/lib/navigation/return-to";
import { confirmDestructiveAction } from "@/lib/ui/confirm-action";

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
  addOpen?: boolean;
  onAddOpenChange?: (open: boolean) => void;
};

export function CustomerRelationsPanel({
  customerId,
  relations,
  excludeIds,
  typeLabels,
  readOnly,
  linkReturnTo,
  addOpen: addOpenProp,
  onAddOpenChange,
}: Props) {
  const customerHref = (id: string) =>
    linkReturnTo ? withReturnTo(`/customers/${id}`, linkReturnTo) : `/customers/${id}`;

  const [addOpenInternal, setAddOpenInternal] = useState(false);
  const addOpen = addOpenProp ?? addOpenInternal;
  const setAddOpen = onAddOpenChange ?? setAddOpenInternal;
  const [relatedCustomerId, setRelatedCustomerId] = useState("");
  const [relatedCustomerLabel, setRelatedCustomerLabel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removePending, startRemoveTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const router = useRouter();

  function resetForm() {
    setRelatedCustomerId("");
    setRelatedCustomerLabel("");
    setFormError(null);
  }

  function closeDialog() {
    setAddOpen(false);
    resetForm();
  }

  function handleAddRelation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!relatedCustomerId.trim()) {
      setFormError("请从搜索结果中点击选择关联客户，不能只输入名称直接提交");
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("relatedCustomerId", relatedCustomerId.trim());
    setFormError(null);

    startTransition(async () => {
      try {
        await addCustomerRelation(formData);
        closeDialog();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "添加关联失败");
      }
    });
  }

  function handleRemoveRelation(relation: RelationItem) {
    if (removePending || removingId) return;
    if (
      !confirmDestructiveAction(
        `确定移除与「${relation.customer.name}」的关联吗？此操作不可撤销。`
      )
    ) {
      return;
    }

    setRemovingId(relation.relationId);
    startRemoveTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("relationId", relation.relationId);
        formData.set("customerId", customerId);
        await removeCustomerRelation(formData);
        router.refresh();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "移除关联失败");
      } finally {
        setRemovingId(null);
      }
    });
  }

  function handleAddOpenChange(open: boolean) {
    setAddOpen(open);
    if (!open) resetForm();
  }

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
              {!readOnly ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removePending}
                  onClick={() => handleRemoveRelation(r)}
                >
                  {removingId === r.relationId ? "移除中…" : "移除"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
        <DialogContent className="max-w-lg" showCloseButton scrollable>
          <DialogHeader>
            <DialogTitle>添加关联客户</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddRelation} className="space-y-3">
            <input type="hidden" name="customerId" value={customerId} />
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
                if (id) setFormError(null);
              }}
            />
            <div className="space-y-2">
              <Label htmlFor="relationNote">关系说明</Label>
              <Input id="relationNote" name="relationNote" placeholder="如：上级单位、渠道伙伴" />
            </div>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                输入名称后须从下拉列表中点击选中客户
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending || !relatedCustomerId.trim()}>
                {pending ? "添加中…" : "确认添加"}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={closeDialog}>
                取消
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
