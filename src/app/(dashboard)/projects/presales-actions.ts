"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { getCustomerForUser } from "@/lib/customers/access";

function parseDateField(raw: FormDataEntryValue | null, label: string): Date {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error(`请填写${label}`);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) throw new Error(`${label}格式无效`);
  return d;
}

function parseOptionalDateField(raw: FormDataEntryValue | null): Date | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) throw new Error("结束日期格式无效");
  return d;
}

function revalidatePresalesPaths(customerId?: string) {
  revalidatePath("/projects/presales");
  revalidatePath("/approvals");
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

/** 销售从客户上下文发起售前支援申请 */
export async function createPresalesRequest(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const customerId = String(formData.get("customerId") ?? "").trim();
  const preferredPresalesUserId =
    String(formData.get("preferredPresalesUserId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const startDate = parseDateField(formData.get("startDate"), "开始日期");
  const endDate = parseOptionalDateField(formData.get("endDate"));

  if (!customerId) throw new Error("参数不完整");

  const customer = await getCustomerForUser(
    customerId,
    session.user.role,
    session.user.id
  );
  if (!customer) throw new Error("无权访问该客户");

  if (preferredPresalesUserId) {
    const preferred = await prisma.user.findFirst({
      where: {
        id: preferredPresalesUserId,
        OR: [
          { personnelProfile: { isPresales: true, enabled: true } },
          { role: { in: ["PROJECT_STAFF", "PROJECT_MANAGER", "PROJECT_ADMIN"] } },
        ],
      },
      select: { id: true },
    });
    if (!preferred) throw new Error("期望售前人员无效");
  }

  const pending = await prisma.presalesRequest.findFirst({
    where: {
      customerId,
      salesUserId: session.user.id,
      status: "PENDING",
    },
    select: { id: true },
  });
  if (pending) throw new Error("已有待审批的售前申请，请等待处理");

  await prisma.presalesRequest.create({
    data: {
      salesUserId: session.user.id,
      customerId,
      preferredPresalesUserId,
      startDate,
      endDate,
      notes,
    },
  });

  revalidatePresalesPaths(customerId);
}

async function requirePresalesApprover() {
  return requireRole(["PROJECT_ADMIN", "ADMIN"]);
}

/** 通过售前申请并创建 ACTIVE PresalesAssignment */
export async function approvePresalesRequest(formData: FormData) {
  const session = await requirePresalesApprover();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const assignPresalesUserId =
    String(formData.get("presalesUserId") ?? "").trim() || null;

  if (!requestId) throw new Error("参数不完整");

  const request = await prisma.presalesRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "PENDING") {
    throw new Error("申请不存在或已处理");
  }

  const presalesUserId =
    assignPresalesUserId || request.preferredPresalesUserId;
  if (!presalesUserId) {
    throw new Error("请指定售前人员");
  }

  await prisma.$transaction(async (tx) => {
    await tx.presalesRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        rejectReason: null,
      },
    });

    await tx.presalesAssignment.create({
      data: {
        presalesUserId,
        salesUserId: request.salesUserId,
        customerId: request.customerId,
        assignedById: session.user.id,
        startDate: request.startDate,
        endDate: request.endDate,
        status: "ACTIVE",
        notes: request.notes,
      },
    });
  });

  revalidatePresalesPaths(request.customerId);
}

export async function rejectPresalesRequest(formData: FormData) {
  const session = await requirePresalesApprover();
  const requestId = String(formData.get("requestId") ?? "").trim();
  const rejectReason = String(formData.get("rejectReason") ?? "").trim() || null;

  if (!requestId) throw new Error("参数不完整");

  const request = await prisma.presalesRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "PENDING") {
    throw new Error("申请不存在或已处理");
  }

  await prisma.presalesRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      rejectReason,
    },
  });

  revalidatePresalesPaths(request.customerId);
}
