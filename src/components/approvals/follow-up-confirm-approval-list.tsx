import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APPROVAL_TYPE_LABELS } from "@/lib/approvals/constants";
import {
  approveFollowUpConfirm,
  rejectFollowUpConfirm,
} from "@/app/(dashboard)/approvals/actions";
import { followUpConfirmStatusLabel } from "@/lib/follow-ups/confirm-status";
import { format } from "date-fns";
import type { FollowUpConfirmStatus, FollowUpMethod } from "@prisma/client";
import { FOLLOW_UP_METHOD_LABELS } from "@/lib/permissions";
import { formatAmount } from "@/lib/opportunities/funnel";
import { formatExpectedCloseMonth } from "@/lib/opportunities/expected-close-date";

export type PendingContactApprovalDetail = {
  id: string;
  name: string;
  title?: string | null;
  phone?: string | null;
  wechat?: string | null;
  role?: string | null;
};

export type PendingOpportunityApprovalDetail = {
  id: string;
  title: string;
  stage: string;
  expectedAmount: number;
  expectedCloseDate: Date | string;
  grade: string | null;
};

export type FollowUpConfirmApproval = {
  id: string;
  confirmStatus: FollowUpConfirmStatus;
  method: FollowUpMethod;
  content: string;
  followUpAt: Date;
  confirmRejectReason: string | null;
  confirmedAt: Date | null;
  user: { id: string; name: string };
  confirmedBy: { name: string } | null;
  customer: { id: string; name: string };
  opportunity: { id: string; title: string } | null;
  pendingContacts?: PendingContactApprovalDetail[];
  pendingOpportunities?: PendingOpportunityApprovalDetail[];
  stageLabels?: Record<string, string>;
};

type Props = {
  items: FollowUpConfirmApproval[];
  showActions?: boolean;
  stageLabels?: Record<string, string>;
};

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

function formatContactLine(contact: PendingContactApprovalDetail) {
  const parts = [
    contact.title,
    contact.role,
    contact.phone,
    contact.wechat ? `微信 ${contact.wechat}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function FollowUpConfirmApprovalList({ items, showActions, stageLabels }: Props) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无记录</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map((row) => {
        const pendingContacts = row.pendingContacts ?? [];
        const pendingOpportunities = row.pendingOpportunities ?? [];
        const labels = row.stageLabels ?? stageLabels;
        const hasBundle = pendingContacts.length > 0 || pendingOpportunities.length > 0;

        return (
          <li key={row.id} className="rounded-md border p-4 text-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b pb-3">
              <span className="rounded bg-muted px-2 py-0.5 text-xs">
                {APPROVAL_TYPE_LABELS.FOLLOW_UP_CONFIRM}
              </span>
              <span className="font-medium">{row.user.name}</span>
              <span className="text-muted-foreground">录入非本人客户</span>
              <Link
                href={`/customers/${row.customer.id}`}
                className="text-primary hover:underline"
              >
                {row.customer.name}
              </Link>
              <span className="ml-auto text-muted-foreground">
                {format(row.followUpAt, "yyyy-MM-dd HH:mm")}
              </span>
            </div>

            <div className="space-y-4">
              <section className="space-y-2">
                <SectionTitle>1. 新增往来（非本人客户）</SectionTitle>
                <div className="rounded-md border bg-background px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    状态：{followUpConfirmStatusLabel(row.confirmStatus)} ·{" "}
                    {FOLLOW_UP_METHOD_LABELS[row.method]}
                    {row.opportunity ? (
                      <>
                        {" · 关联商机 "}
                        <Link
                          href={`/opportunities/${row.opportunity.id}`}
                          className="text-primary hover:underline"
                        >
                          {row.opportunity.title}
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                    {row.content?.trim() ? row.content : "（无往来内容）"}
                  </p>
                </div>
              </section>

              {pendingContacts.length > 0 ? (
                <section className="space-y-2">
                  <SectionTitle>
                    2. 新增联系人
                    <span className="ml-1 font-normal text-muted-foreground">
                      （{pendingContacts.length}）
                    </span>
                  </SectionTitle>
                  <ul className="space-y-2">
                    {pendingContacts.map((contact) => {
                      const detail = formatContactLine(contact);
                      return (
                        <li
                          key={contact.id}
                          className="rounded-md border border-dashed px-3 py-2"
                        >
                          <p className="font-medium">{contact.name}</p>
                          {detail ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                          ) : (
                            <p className="mt-0.5 text-xs text-muted-foreground">暂无更多资料</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {pendingOpportunities.length > 0 ? (
                <section className="space-y-2">
                  <SectionTitle>
                    {pendingContacts.length > 0 ? "3" : "2"}. 新增商机
                    <span className="ml-1 font-normal text-muted-foreground">
                      （{pendingOpportunities.length}）
                    </span>
                  </SectionTitle>
                  <ul className="space-y-2">
                    {pendingOpportunities.map((opp) => {
                      const stage = labels?.[opp.stage] ?? opp.stage;
                      return (
                        <li key={opp.id} className="rounded-md border border-dashed px-3 py-2">
                          <Link
                            href={`/opportunities/${opp.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {opp.title}
                          </Link>
                          <dl className="mt-1.5 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                            <div>
                              <span className="text-foreground/70">阶段：</span>
                              {stage}
                            </div>
                            <div>
                              <span className="text-foreground/70">预计金额：</span>
                              {formatAmount(opp.expectedAmount)}
                            </div>
                            <div>
                              <span className="text-foreground/70">预计签约：</span>
                              {formatExpectedCloseMonth(opp.expectedCloseDate)}
                            </div>
                            {opp.grade ? (
                              <div>
                                <span className="text-foreground/70">等级：</span>
                                {opp.grade}
                              </div>
                            ) : null}
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {hasBundle
                ? "以上为同一次提交的非本人客户录入，确认或驳回将一并处理；并同步处理该录入人在此客户下的其他待确认联系人/商机。"
                : "确认或驳回时会一并处理该录入人在此客户下的待确认联系人/商机。"}
            </p>

            {row.confirmRejectReason ? (
              <p className="mt-2 text-muted-foreground">驳回原因：{row.confirmRejectReason}</p>
            ) : null}
            {row.confirmedBy && row.confirmedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {row.confirmedBy.name} 于 {format(row.confirmedAt, "yyyy-MM-dd HH:mm")} 处理
              </p>
            ) : null}

            {showActions && row.confirmStatus === "PENDING_MANAGER" ? (
              <div className="mt-4 space-y-2 border-t pt-3">
                <form action={approveFollowUpConfirm} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="followUpId" value={row.id} />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="addAsAssistant" value="true" className="rounded" />
                    同时加为协助负责人
                  </label>
                  <Button type="submit" size="sm">
                    {hasBundle ? "确认全部入库" : "确认入库"}
                  </Button>
                </form>
                <form action={rejectFollowUpConfirm} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="followUpId" value={row.id} />
                  <Input name="reason" placeholder="驳回原因（可选）" className="h-8 w-48" />
                  <Button type="submit" size="sm" variant="outline">
                    {hasBundle ? "全部驳回" : "驳回"}
                  </Button>
                </form>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
