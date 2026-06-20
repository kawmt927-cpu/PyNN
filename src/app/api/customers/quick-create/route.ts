import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createCustomerRecord } from "@/lib/customers/create-customer";
import { customerFormSchema } from "@/lib/validations/customer";
import type { UserRole } from "@prisma/client";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !SALES_LOG_ROLES.includes(session.user.role)) {
    return Response.json({ error: "未登录或无权操作" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = customerFormSchema.parse(body);

    const customer = await createCustomerRecord(
      session.user.role,
      session.user.id,
      parsed
    );

    revalidatePath("/customers");
    revalidatePath("/today-work");
    return Response.json({ id: customer.id, name: customer.name });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.errors[0]?.message ?? "表单无效" },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "创建客户失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
