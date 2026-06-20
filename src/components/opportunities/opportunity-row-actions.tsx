"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { OpportunityAbandonDialog } from "@/components/opportunities/opportunity-abandon-dialog";
import { OpportunityRestoreStatusActions } from "@/components/opportunities/opportunity-restore-status-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  opportunityId: string;
  canEdit: boolean;
  canSign: boolean;
  canAbandon: boolean;
  canManageStatus: boolean;
  isAbandoned: boolean;
};

export function OpportunityRowActions({
  opportunityId,
  canEdit,
  canSign,
  canAbandon,
  canManageStatus,
  isAbandoned,
}: Props) {
  const [abandonOpen, setAbandonOpen] = useState(false);

  const detailHref = `/opportunities/${opportunityId}`;
  const followUpHref = `/opportunities/${opportunityId}/follow-ups`;
  const editHref = `/opportunities/${opportunityId}/edit`;
  const contractHref = `/opportunities/${opportunityId}/create-contract`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="操作菜单">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={detailHref}>查看详情</Link>
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem asChild>
              <Link href={followUpHref}>跟进商机</Link>
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem asChild>
              <Link href={editHref}>修改商机</Link>
            </DropdownMenuItem>
          )}
          {canSign && (
            <DropdownMenuItem asChild>
              <Link href={contractHref}>签订销售合同</Link>
            </DropdownMenuItem>
          )}
          {canAbandon && (
            <DropdownMenuItem onSelect={() => setAbandonOpen(true)}>
              放弃商机
            </DropdownMenuItem>
          )}
          {canManageStatus && isAbandoned && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>修改商机状态</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-40 p-2">
                <OpportunityRestoreStatusActions opportunityId={opportunityId} compact />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>新增报价单</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OpportunityAbandonDialog
        opportunityId={opportunityId}
        open={abandonOpen}
        onOpenChange={setAbandonOpen}
      />
    </>
  );
}
