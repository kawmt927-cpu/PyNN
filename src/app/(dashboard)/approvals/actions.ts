"use server";

import { revalidatePath } from "next/cache";
import { getPrismaClient } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCustomerForUser } from "@/lib/customers/access";

function revalidateApprovalPaths(customerId?: string) {
  revalidatePath("/approvals");
  revalidatePath("/customers");
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

export async function applyForCustomer(formData: FormData) {
  const db = getPrismaClient();
  const session = await requireRole(["SALES"]);
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
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
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
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
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

export async function getPendingApprovalCount() {
  const db = getPrismaClient();
  await requireRole(["SALES_MANAGER", "ADMIN"]);
  return db.customerClaimRequest.count({ where: { status: "PENDING" } });
}
