"use server";

import { getPrismaClient } from "@/lib/prisma";
import { requireRole, requireSession } from "@/lib/session";
import { getCustomerForUser } from "@/lib/customers/access";
import { countPendingApprovals } from "@/lib/approvals/pending-count";
import { revalidateApprovalSurfaces } from "@/lib/approvals/revalidate";
import { hasPermission } from "@/lib/rbac/has-permission";
import { ALL_AUTHED_ROLES } from "@/lib/expenses/labels";

function revalidateApprovalPaths(customerId?: string) {
  revalidateApprovalSurfaces(customerId);
}

async function requireSalesApprovalActor() {
  const session = await requireRole([...ALL_AUTHED_ROLES]);
  if (!(await hasPermission(session.user.role, "approvals.sales"))) {
    throw new Error("无权进行销售类审批");
  }
  return session;
}

export async function applyForCustomer(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSession();
  if (!(await hasPermission(session.user.role, "customers.claim"))) {
    throw new Error("无权申请认领客户");
  }
  const customerId = formData.get("customerId") as string;
  const message = (formData.get("message") as string)?.trim() || undefined;

  if (!customerId) throw new Error("参数不完整");

  const customer = await getCustomerForUser(customerId, session.user.role, session.user.id);
  if (!customer) throw new Error("无权访问该客户");
  if (customer.ownerId !== null) throw new Error("该客户已不在公海池");

  const existing = await db.customerClaimRequest.findFirst({
    where: {
      customerId,
      requesterId: session.user.id,
      status: "PENDING",
    },
  });
  if (existing) throw new Error("您已提交申请，请等待审批");

  await db.customerClaimRequest.create({
    data: {
      customerId,
      requesterId: session.user.id,
      message,
    },
  });

  revalidateApprovalPaths(customerId);
}

export async function approveCustomerClaim(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSalesApprovalActor();
  const requestId = formData.get("requestId") as string;
  const reviewNote = (formData.get("reviewNote") as string)?.trim() || undefined;

  if (!requestId) throw new Error("参数不完整");

  const request = await db.customerClaimRequest.findUnique({
    where: { id: requestId },
    include: { customer: true },
  });

  if (!request || request.status !== "PENDING") throw new Error("申请不存在或已处理");
  if (request.customer.ownerId !== null) throw new Error("该客户已不在公海池");

  await db.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: request.customerId },
      data: { ownerId: request.requesterId },
    });

    await tx.customerClaimRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewerId: session.user.id,
        reviewNote,
        reviewedAt: new Date(),
      },
    });

    await tx.customerClaimRequest.updateMany({
      where: {
        customerId: request.customerId,
        status: "PENDING",
        id: { not: requestId },
      },
      data: {
        status: "REJECTED",
        reviewerId: session.user.id,
        reviewNote: "客户已被其他销售认领",
        reviewedAt: new Date(),
      },
    });
  });

  revalidateApprovalPaths(request.customerId);
}

export async function rejectCustomerClaim(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSalesApprovalActor();
  const requestId = formData.get("requestId") as string;
  const reviewNote = (formData.get("reviewNote") as string)?.trim() || undefined;

  if (!requestId) throw new Error("参数不完整");

  const request = await db.customerClaimRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PENDING") throw new Error("申请不存在或已处理");

  await db.customerClaimRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      reviewerId: session.user.id,
      reviewNote,
      reviewedAt: new Date(),
    },
  });

  revalidateApprovalPaths(request.customerId);
}

export async function approveFollowUpConfirm(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSalesApprovalActor();
  const followUpId = formData.get("followUpId") as string;
  const addAsAssistant =
    formData.get("addAsAssistant") === "true" || formData.get("addAsAssistant") === "on";

  if (!followUpId) throw new Error("参数不完整");

  const followUp = await db.followUp.findUnique({
    where: { id: followUpId },
    include: {
      customer: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
  });
  if (!followUp || followUp.confirmStatus !== "PENDING_MANAGER") {
    throw new Error("往来不存在或已处理");
  }

  const { applyProxyRecordBundleStatus } = await import("@/lib/approvals/proxy-record-confirm");
  await db.$transaction(async (tx) => {
    await applyProxyRecordBundleStatus(tx, {
      followUpId,
      confirmStatus: "CONFIRMED",
      confirmedById: session.user.id,
    });
  });

  if (addAsAssistant) {
    const { addCustomerAssistant } = await import("@/lib/customers/assistants");
    await addCustomerAssistant(followUp.customerId, followUp.userId);
  }

  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );
  await createAppNotification({
    type: NOTIFICATION_TYPES.FOLLOW_UP_CONFIRM_RESULT,
    title: "非本人客户录入已确认入库",
    body: `${followUp.customer.name}：你提交的往来及相关联系人/商机已确认${
      addAsAssistant ? "，并已加为协助负责人" : ""
    }`,
    linkHref: `/customers/${followUp.customerId}/follow-ups`,
    recipientUserIds: [followUp.userId],
    pushWeCom: true,
    meta: { followUpId, customerId: followUp.customerId, result: "CONFIRMED" },
  });

  revalidateApprovalPaths(followUp.customerId);
}

export async function rejectFollowUpConfirm(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSalesApprovalActor();
  const followUpId = formData.get("followUpId") as string;
  const reason = (formData.get("reason") as string)?.trim() || undefined;

  if (!followUpId) throw new Error("参数不完整");

  const followUp = await db.followUp.findUnique({
    where: { id: followUpId },
    include: {
      customer: { select: { id: true, name: true } },
    },
  });
  if (!followUp || followUp.confirmStatus !== "PENDING_MANAGER") {
    throw new Error("往来不存在或已处理");
  }

  const { applyProxyRecordBundleStatus } = await import("@/lib/approvals/proxy-record-confirm");
  await db.$transaction(async (tx) => {
    await applyProxyRecordBundleStatus(tx, {
      followUpId,
      confirmStatus: "REJECTED",
      confirmedById: session.user.id,
      confirmRejectReason: reason,
    });
  });

  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );
  await createAppNotification({
    type: NOTIFICATION_TYPES.FOLLOW_UP_CONFIRM_RESULT,
    title: "非本人客户录入未通过确认",
    body: `${followUp.customer.name}：你提交的往来及相关联系人/商机已被驳回${
      reason ? `（${reason}）` : ""
    }`,
    linkHref: `/customers/${followUp.customerId}/follow-ups`,
    recipientUserIds: [followUp.userId],
    pushWeCom: true,
    meta: { followUpId, customerId: followUp.customerId, result: "REJECTED" },
  });

  revalidateApprovalPaths(followUp.customerId);
}

export async function approveContactConfirm(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSalesApprovalActor();
  const contactId = formData.get("contactId") as string;
  if (!contactId) throw new Error("参数不完整");

  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!contact || contact.confirmStatus !== "PENDING_MANAGER") {
    throw new Error("联系人不存在或已处理");
  }

  await db.contact.update({
    where: { id: contactId },
    data: {
      confirmStatus: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedById: session.user.id,
      confirmRejectReason: null,
    },
  });

  if (contact.createdById) {
    const { createAppNotification, NOTIFICATION_TYPES } = await import(
      "@/lib/notifications/app-notifications"
    );
    await createAppNotification({
      type: NOTIFICATION_TYPES.CONTACT_CONFIRM_RESULT,
      title: "联系人已确认入库",
      body: `${contact.customer.name}：联系人「${contact.name}」已确认入库`,
      linkHref: `/customers/${contact.customerId}`,
      recipientUserIds: [contact.createdById],
      pushWeCom: true,
      meta: { contactId, customerId: contact.customerId, result: "CONFIRMED" },
    });
  }

  revalidateApprovalPaths(contact.customerId);
}

export async function rejectContactConfirm(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSalesApprovalActor();
  const contactId = formData.get("contactId") as string;
  const reason = (formData.get("reason") as string)?.trim() || undefined;
  if (!contactId) throw new Error("参数不完整");

  const contact = await db.contact.findUnique({
    where: { id: contactId },
    include: {
      customer: { select: { id: true, name: true } },
    },
  });
  if (!contact || contact.confirmStatus !== "PENDING_MANAGER") {
    throw new Error("联系人不存在或已处理");
  }

  await db.contact.update({
    where: { id: contactId },
    data: {
      confirmStatus: "REJECTED",
      confirmedAt: new Date(),
      confirmedById: session.user.id,
      confirmRejectReason: reason,
      isPrimary: false,
    },
  });

  if (contact.createdById) {
    const { createAppNotification, NOTIFICATION_TYPES } = await import(
      "@/lib/notifications/app-notifications"
    );
    await createAppNotification({
      type: NOTIFICATION_TYPES.CONTACT_CONFIRM_RESULT,
      title: "联系人未通过确认",
      body: `${contact.customer.name}：联系人「${contact.name}」已被驳回${
        reason ? `（${reason}）` : ""
      }`,
      linkHref: `/customers/${contact.customerId}`,
      recipientUserIds: [contact.createdById],
      pushWeCom: true,
      meta: { contactId, customerId: contact.customerId, result: "REJECTED" },
    });
  }

  revalidateApprovalPaths(contact.customerId);
}

export async function approveOpportunityConfirm(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSalesApprovalActor();
  const opportunityId = formData.get("opportunityId") as string;
  if (!opportunityId) throw new Error("参数不完整");

  const opportunity = await db.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      customer: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  if (!opportunity || opportunity.confirmStatus !== "PENDING_MANAGER") {
    throw new Error("商机不存在或已处理");
  }

  await db.opportunity.update({
    where: { id: opportunityId },
    data: {
      confirmStatus: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedById: session.user.id,
      confirmRejectReason: null,
    },
  });

  const notifyUserId = opportunity.createdById ?? opportunity.ownerId;
  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );
  await createAppNotification({
    type: NOTIFICATION_TYPES.OPPORTUNITY_CONFIRM_RESULT,
    title: "商机已确认入库",
    body: `${opportunity.customer?.name ?? "客户"}：商机「${opportunity.title}」已确认入库`,
    linkHref: `/opportunities/${opportunityId}`,
    recipientUserIds: [notifyUserId],
    pushWeCom: true,
    meta: {
      opportunityId,
      customerId: opportunity.customerId,
      result: "CONFIRMED",
    },
  });

  revalidateApprovalPaths(opportunity.customerId ?? undefined);
}

export async function rejectOpportunityConfirm(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireSalesApprovalActor();
  const opportunityId = formData.get("opportunityId") as string;
  const reason = (formData.get("reason") as string)?.trim() || undefined;
  if (!opportunityId) throw new Error("参数不完整");

  const opportunity = await db.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      customer: { select: { id: true, name: true } },
    },
  });
  if (!opportunity || opportunity.confirmStatus !== "PENDING_MANAGER") {
    throw new Error("商机不存在或已处理");
  }

  await db.opportunity.update({
    where: { id: opportunityId },
    data: {
      confirmStatus: "REJECTED",
      confirmedAt: new Date(),
      confirmedById: session.user.id,
      confirmRejectReason: reason,
      status: "ABANDONED",
    },
  });

  const notifyUserId = opportunity.createdById ?? opportunity.ownerId;
  const { createAppNotification, NOTIFICATION_TYPES } = await import(
    "@/lib/notifications/app-notifications"
  );
  await createAppNotification({
    type: NOTIFICATION_TYPES.OPPORTUNITY_CONFIRM_RESULT,
    title: "商机未通过确认",
    body: `${opportunity.customer?.name ?? "客户"}：商机「${opportunity.title}」已被驳回${
      reason ? `（${reason}）` : ""
    }`,
    linkHref: `/opportunities/${opportunityId}`,
    recipientUserIds: [notifyUserId],
    pushWeCom: true,
    meta: {
      opportunityId,
      customerId: opportunity.customerId,
      result: "REJECTED",
    },
  });

  revalidateApprovalPaths(opportunity.customerId ?? undefined);
}

export async function getPendingApprovalCount() {
  const session = await requireRole([
    "SALES",
    "SALES_MANAGER",
    "PROJECT_ADMIN",
    "PROJECT_MANAGER",
    "PROJECT_STAFF",
    "ADMIN",
    "HR",
  ]);
  return countPendingApprovals({ id: session.user.id, role: session.user.role });
}
