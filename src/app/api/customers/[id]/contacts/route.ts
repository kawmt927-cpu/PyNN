import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import {
  getCustomerForUser,
  assertCustomerContentWriteAccess,
  canEditCustomerContent,
} from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";
import { quickContactSchema } from "@/lib/validations/sales-log";
import {
  canProposeCustomerContact,
  contactSelectableWhere,
  resolveContactConfirmStatus,
} from "@/lib/customers/contact-confirm-status";
import type { UserRole } from "@prisma/client";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  // 代录往来时需能读取非本人客户的联系人列表（新增仍要求可写档案或代建待审）
  const customer = await getCustomerForUser(id, session.user.role, session.user.id, {
    allowFollowUpOnAnyCustomer: true,
  });
  if (!customer) {
    return Response.json({
      items: [],
      canWriteContent: false,
      canProposeContact: false,
    });
  }

  const canWriteContent = canEditCustomerContent(session.user.role, session.user.id, customer);
  const canPropose = canProposeCustomerContact(session.user.role);

  const contacts = await prisma.contact.findMany({
    where: {
      customerId: id,
      ...contactSelectableWhere(session.user.id),
    },
    orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      title: true,
      department: true,
      phone: true,
      wechat: true,
      role: true,
      isPrimary: true,
      confirmStatus: true,
      responsibleProvinces: {
        select: { province: true },
        orderBy: { province: "asc" },
      },
    },
  });

  return Response.json({
    items: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title,
      department: c.department,
      phone: c.phone,
      wechat: c.wechat,
      role: c.role,
      isPrimary: c.isPrimary,
      confirmStatus: c.confirmStatus,
      responsibleProvinces: c.responsibleProvinces.map((r) => r.province),
    })),
    canWriteContent,
    canProposeContact: canPropose,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !SALES_LOG_ROLES.includes(session.user.role)) {
    return Response.json({ error: "未登录或无权操作" }, { status: 401 });
  }

  const { id: customerId } = await params;
  const customer = await getCustomerForUser(customerId, session.user.role, session.user.id, {
    allowFollowUpOnAnyCustomer: true,
  });
  if (!customer) {
    return Response.json({ error: "客户不存在或无权访问" }, { status: 404 });
  }

  if (!canProposeCustomerContact(session.user.role)) {
    return Response.json({ error: "无权新增联系人" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = quickContactSchema.parse(body);

    const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
    const role = await assertConfigValue(CONFIG_CATEGORY.CONTACT_ROLE, parsed.role);
    if (!role) {
      return Response.json({ error: "请选择角色" }, { status: 400 });
    }

    const confirmStatus = resolveContactConfirmStatus({
      role: session.user.role,
      userId: session.user.id,
      customer,
    });

    const contact = await prisma.contact.create({
      data: {
        customerId,
        name: parsed.name.trim(),
        title: parsed.title ?? null,
        department: parsed.department ?? null,
        phone: parsed.phone ?? null,
        wechat: parsed.wechat ?? null,
        role,
        createdById: session.user.id,
        confirmStatus,
        confirmedAt: confirmStatus === "CONFIRMED" ? new Date() : undefined,
        confirmedById: confirmStatus === "CONFIRMED" ? session.user.id : undefined,
      },
      select: {
        id: true,
        name: true,
        title: true,
        phone: true,
        wechat: true,
        isPrimary: true,
        confirmStatus: true,
      },
    });

    if (confirmStatus === "PENDING_MANAGER") {
      // 联系人随往来代录一并确认，不单独进审批队列
    }

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/today-work");
    revalidatePath("/approvals");
    return Response.json({
      id: contact.id,
      name: contact.name,
      contact,
      confirmStatus: contact.confirmStatus,
      message:
        confirmStatus === "PENDING_MANAGER"
          ? `已添加联系人「${contact.name}」（待确认，将随本次往来一并提交审核）`
          : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.errors[0]?.message ?? "表单无效" }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 400 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !SALES_LOG_ROLES.includes(session.user.role)) {
    return Response.json({ error: "未登录或无权操作" }, { status: 401 });
  }

  const { id: customerId } = await params;
  const customer = await getCustomerForUser(customerId, session.user.role, session.user.id);
  if (!customer) {
    return Response.json({ error: "客户不存在或无权访问" }, { status: 404 });
  }

  try {
    await assertCustomerContentWriteAccess(session.user.role, session.user.id, customer);
    const body = (await req.json()) as { contactId?: string } & Record<string, unknown>;
    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
    if (!contactId) {
      return Response.json({ error: "缺少联系人" }, { status: 400 });
    }

    const existing = await prisma.contact.findFirst({
      where: { id: contactId, customerId, confirmStatus: "CONFIRMED" },
      select: { id: true },
    });
    if (!existing) {
      return Response.json({ error: "联系人不存在或尚未确认入库" }, { status: 404 });
    }

    const parsed = quickContactSchema.parse(body);
    const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
    const role = await assertConfigValue(CONFIG_CATEGORY.CONTACT_ROLE, parsed.role);
    if (!role) {
      return Response.json({ error: "请选择角色" }, { status: 400 });
    }

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        name: parsed.name.trim(),
        title: parsed.title ?? null,
        department: parsed.department ?? null,
        phone: parsed.phone ?? null,
        wechat: parsed.wechat ?? null,
        role,
      },
      select: { id: true, name: true },
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/today-work");
    return Response.json({ id: contact.id, name: contact.name });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: error.errors[0]?.message ?? "表单无效" }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "更新失败" },
      { status: 400 }
    );
  }
}
