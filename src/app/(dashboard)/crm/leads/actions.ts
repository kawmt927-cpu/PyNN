"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  isLeadGradeValue,
  LEAD_CONVERT_INTENT_GRADE,
} from "@/lib/customers/lead-status";
import { CUSTOMER_ASSIGNABLE_ROLES } from "@/lib/customers/access";

function revalidateLeads(customerId?: string) {
  revalidatePath("/crm/leads");
  revalidatePath("/customers");
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

/** 线索池：分配负责人 */
export async function assignLeadOwner(formData: FormData) {
  const session = await requireRole(["SALES_MANAGER", "ADMIN"]);
  const customerId = String(formData.get("customerId") ?? "").trim();
  const salesUserId = String(formData.get("salesUserId") ?? "").trim();
  if (!customerId || !salesUserId) throw new Error("参数不完整");

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("客户不存在");
  if (!isLeadGradeValue(customer.customerGrade)) {
    throw new Error("仅线索客户可在此分配");
  }

  const target = await prisma.user.findFirst({
    where: { id: salesUserId, role: { in: CUSTOMER_ASSIGNABLE_ROLES } },
    select: { id: true },
  });
  if (!target) throw new Error("只能分配给销售、销售管理或管理员");

  await prisma.customer.update({
    where: { id: customerId },
    data: { ownerId: salesUserId },
  });

  revalidateLeads(customerId);
}

/** 线索 → 意向（customerGrade = STAR_3） */
export async function convertLeadToIntent(formData: FormData) {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) throw new Error("参数不完整");

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new Error("客户不存在");
  if (!isLeadGradeValue(customer.customerGrade)) {
    throw new Error("仅线索客户可转为意向");
  }

  if (session.user.role === "SALES") {
    if (customer.ownerId !== session.user.id) {
      throw new Error("普通销售只能转化本人负责的线索");
    }
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: { customerGrade: LEAD_CONVERT_INTENT_GRADE },
  });

  revalidateLeads(customerId);
}
