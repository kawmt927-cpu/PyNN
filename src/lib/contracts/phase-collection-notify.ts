import { prisma } from "@/lib/prisma";
import {
  createAppNotification,
  NOTIFICATION_TYPES,
} from "@/lib/notifications/app-notifications";
import { formatAmount } from "@/lib/opportunities/funnel";

export type PromotedInstallmentInfo = {
  id: string;
  periodNumber: number;
  amount: number;
  condition: string | null;
};

/**
 * 阶段完成后通知全体销管 + 管理员：
 * - 有分期升为可催款 → 「可催款」
 * - 否则 → 「可准备下一笔沟通」
 */
export async function notifySalesManagersOnPhaseCompleted(input: {
  phaseId: string;
  promotedInstallments: PromotedInstallmentInfo[];
}) {
  const phase = await prisma.projectPhase.findUnique({
    where: { id: input.phaseId },
    select: {
      id: true,
      name: true,
      project: {
        select: {
          id: true,
          name: true,
          contract: {
            select: {
              id: true,
              title: true,
              contractNo: true,
              signCustomer: { select: { name: true } },
              endUserCustomer: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const contract = phase?.project.contract;
  if (!phase || !contract) return;

  const recipients = await prisma.user.findMany({
    where: {
      role: { in: ["SALES_MANAGER", "ADMIN"] },
      OR: [{ personnelProfile: null }, { personnelProfile: { enabled: true } }],
    },
    select: { id: true },
  });
  if (recipients.length === 0) return;

  const customerLabel =
    contract.endUserCustomer.name || contract.signCustomer.name || "客户";
  const contractLabel = contract.contractNo
    ? `${contract.title}（${contract.contractNo}）`
    : contract.title;
  const linkHref = `/contracts/${contract.id}`;

  if (input.promotedInstallments.length > 0) {
    const periods = input.promotedInstallments
      .map((row) => {
        const cond = row.condition ? ` · ${row.condition}` : "";
        return `第 ${row.periodNumber} 期 ${formatAmount(row.amount)}${cond}`;
      })
      .join("；");

    await createAppNotification({
      type: NOTIFICATION_TYPES.PHASE_COLLECTION_READY,
      title: "分期已可催款",
      body: `${customerLabel} · ${contractLabel}：项目阶段「${phase.name}」已完成，${periods} 已变为可催款。`,
      linkHref,
      meta: {
        contractId: contract.id,
        projectId: phase.project.id,
        phaseId: phase.id,
        installmentIds: input.promotedInstallments.map((row) => row.id),
      },
      recipientUserIds: recipients.map((u) => u.id),
    });
    return;
  }

  await createAppNotification({
    type: NOTIFICATION_TYPES.PHASE_COLLECTION_PREPARE,
    title: "项目阶段完成，可准备回款沟通",
    body: `${customerLabel} · ${contractLabel}：项目「${phase.project.name}」阶段「${phase.name}」已完成，可准备下一笔回款沟通（该阶段未绑定可升期的分期）。`,
    linkHref,
    meta: {
      contractId: contract.id,
      projectId: phase.project.id,
      phaseId: phase.id,
    },
    recipientUserIds: recipients.map((u) => u.id),
  });
}
