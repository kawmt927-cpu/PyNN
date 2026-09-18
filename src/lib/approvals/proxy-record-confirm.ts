import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** 同一次代录提交：往来关联的待确认联系人 / 商机一并确认或驳回 */
export async function applyProxyRecordBundleStatus(
  tx: Tx,
  input: {
    followUpId: string;
    confirmStatus: "CONFIRMED" | "REJECTED";
    confirmedById: string;
    confirmRejectReason?: string | null;
  }
) {
  const now = new Date();
  const followUp = await tx.followUp.findUnique({
    where: { id: input.followUpId },
    select: {
      id: true,
      userId: true,
      customerId: true,
      confirmStatus: true,
      contactId: true,
      opportunityId: true,
      linkedContacts: { select: { contactId: true } },
      linkedOpportunities: { select: { opportunityId: true } },
    },
  });
  if (!followUp || followUp.confirmStatus !== "PENDING_MANAGER") {
    throw new Error("往来不存在或已处理");
  }

  await tx.followUp.update({
    where: { id: followUp.id },
    data: {
      confirmStatus: input.confirmStatus,
      confirmedAt: now,
      confirmedById: input.confirmedById,
      confirmRejectReason:
        input.confirmStatus === "REJECTED" ? input.confirmRejectReason ?? null : null,
      ...(input.confirmStatus === "REJECTED"
        ? {
            nextFollowUpAt: null,
            nextFollowUpMethod: null,
            nextFollowUpContent: null,
          }
        : {}),
    },
  });

  const contactIds = [
    ...new Set(
      [
        followUp.contactId,
        ...followUp.linkedContacts.map((row) => row.contactId),
      ].filter((id): id is string => Boolean(id))
    ),
  ];
  const opportunityIds = [
    ...new Set(
      [
        followUp.opportunityId,
        ...followUp.linkedOpportunities.map((row) => row.opportunityId),
      ].filter((id): id is string => Boolean(id))
    ),
  ];

  if (contactIds.length > 0) {
    await tx.contact.updateMany({
      where: {
        id: { in: contactIds },
        customerId: followUp.customerId,
        confirmStatus: "PENDING_MANAGER",
        OR: [{ createdById: followUp.userId }, { createdById: null }],
      },
      data: {
        confirmStatus: input.confirmStatus,
        confirmedAt: now,
        confirmedById: input.confirmedById,
        confirmRejectReason:
          input.confirmStatus === "REJECTED" ? input.confirmRejectReason ?? null : null,
        ...(input.confirmStatus === "REJECTED" ? { isPrimary: false } : {}),
      },
    });
  }

  if (opportunityIds.length > 0) {
    await tx.opportunity.updateMany({
      where: {
        id: { in: opportunityIds },
        confirmStatus: "PENDING_MANAGER",
        OR: [
          { ownerId: followUp.userId },
          { createdById: followUp.userId },
          { createdById: null },
        ],
      },
      data: {
        confirmStatus: input.confirmStatus,
        confirmedAt: now,
        confirmedById: input.confirmedById,
        confirmRejectReason:
          input.confirmStatus === "REJECTED" ? input.confirmRejectReason ?? null : null,
        ...(input.confirmStatus === "REJECTED" ? { status: "ABANDONED" as const } : {}),
      },
    });
  }

  // 同客户、同录入人的其余待确认联系人/商机一并处理（避免拆分确认矛盾）
  await tx.contact.updateMany({
    where: {
      customerId: followUp.customerId,
      createdById: followUp.userId,
      confirmStatus: "PENDING_MANAGER",
    },
    data: {
      confirmStatus: input.confirmStatus,
      confirmedAt: now,
      confirmedById: input.confirmedById,
      confirmRejectReason:
        input.confirmStatus === "REJECTED" ? input.confirmRejectReason ?? null : null,
      ...(input.confirmStatus === "REJECTED" ? { isPrimary: false } : {}),
    },
  });
  await tx.opportunity.updateMany({
    where: {
      customerId: followUp.customerId,
      confirmStatus: "PENDING_MANAGER",
      OR: [{ ownerId: followUp.userId }, { createdById: followUp.userId }],
    },
    data: {
      confirmStatus: input.confirmStatus,
      confirmedAt: now,
      confirmedById: input.confirmedById,
      confirmRejectReason:
        input.confirmStatus === "REJECTED" ? input.confirmRejectReason ?? null : null,
      ...(input.confirmStatus === "REJECTED" ? { status: "ABANDONED" as const } : {}),
    },
  });

  return followUp;
}

export async function loadFollowUpProxyBundle(followUpId: string, db: Tx) {
  const followUp = await db.followUp.findUnique({
    where: { id: followUpId },
    select: {
      linkedContacts: {
        select: {
          contact: {
            select: {
              id: true,
              name: true,
              confirmStatus: true,
            },
          },
        },
      },
      linkedOpportunities: {
        select: {
          opportunity: {
            select: {
              id: true,
              title: true,
              confirmStatus: true,
            },
          },
        },
      },
      contact: { select: { id: true, name: true, confirmStatus: true } },
      opportunity: { select: { id: true, title: true, confirmStatus: true } },
    },
  });
  if (!followUp) return { contacts: [], opportunities: [] };

  const contacts = [
    ...(followUp.contact ? [followUp.contact] : []),
    ...followUp.linkedContacts.map((row) => row.contact),
  ].filter(
    (c, index, arr) =>
      c.confirmStatus === "PENDING_MANAGER" && arr.findIndex((x) => x.id === c.id) === index
  );

  const opportunities = [
    ...(followUp.opportunity ? [followUp.opportunity] : []),
    ...followUp.linkedOpportunities.map((row) => row.opportunity),
  ].filter(
    (o, index, arr) =>
      o.confirmStatus === "PENDING_MANAGER" && arr.findIndex((x) => x.id === o.id) === index
  );

  return { contacts, opportunities };
}
