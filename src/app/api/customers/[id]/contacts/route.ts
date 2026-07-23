import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getCustomerForUser, assertCustomerContentWriteAccess, canEditCustomerContent } from "@/lib/customers/access";
import { prisma } from "@/lib/prisma";
import { quickContactSchema } from "@/lib/validations/sales-log";
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
  const customer = await getCustomerForUser(id, session.user.role, session.user.id);
  if (!customer) {
    return Response.json({ items: [], canWriteContent: false });
  }

  const canWriteContent = canEditCustomerContent(session.user.role, session.user.id, customer);

  const contacts = await prisma.contact.findMany({
    where: { customerId: id },
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
    },
  });

  return Response.json({ items: contacts, canWriteContent });
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
  const customer = await getCustomerForUser(customerId, session.user.role, session.user.id);
  if (!customer) {
    return Response.json({ error: "客户不存在或无权访问" }, { status: 404 });
  }

  try {
    await assertCustomerContentWriteAccess(session.user.role, session.user.id, customer);
    const body = await req.json();
    const parsed = quickContactSchema.parse(body);

    const { CONFIG_CATEGORY, assertConfigValue } = await import("@/lib/config-options");
    const role = await assertConfigValue(CONFIG_CATEGORY.CONTACT_ROLE, parsed.role);
    if (!role) {
      return Response.json({ error: "请选择角色" }, { status: 400 });
    }

    const contact = await prisma.contact.create({
      data: {
        customerId,
        name: parsed.name.trim(),
        title: parsed.title ?? null,
        department: parsed.department ?? null,
        phone: parsed.phone ?? null,
        wechat: parsed.wechat ?? null,
        role,
      },
      select: { id: true, name: true, title: true, phone: true, wechat: true, isPrimary: true },
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/today-work");
    return Response.json({ id: contact.id, name: contact.name, contact });
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
      where: { id: contactId, customerId },
      select: { id: true },
    });
    if (!existing) {
      return Response.json({ error: "联系人不存在" }, { status: 404 });
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
