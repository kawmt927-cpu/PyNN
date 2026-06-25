import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { createSalesCheckIn, updateSalesCheckIn } from "@/lib/sales-log/check-in";
import { checkInFormSchema } from "@/lib/validations/sales-log";
import type { UserRole } from "@prisma/client";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

async function requireSalesLogApiSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (!SALES_LOG_ROLES.includes(session.user.role)) return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requireSalesLogApiSession();
  if (!session) {
    return Response.json({ error: "未登录或无权操作" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = checkInFormSchema.parse(body);
    const payload = {
      userId: session.user.id,
      role: session.user.role,
      ...parsed,
    };

    if (parsed.updateCheckInId?.trim()) {
      await updateSalesCheckIn(parsed.updateCheckInId.trim(), payload);
    } else {
      await createSalesCheckIn(payload);
    }

    revalidatePath("/sales-log");
    revalidatePath("/today-work");
    revalidatePath("/follow-ups");
    if (parsed.customerId?.trim()) {
      revalidatePath(`/customers/${parsed.customerId.trim()}`);
      revalidatePath(`/customers/${parsed.customerId.trim()}/follow-ups`);
    }
    if (parsed.followUp?.opportunityId?.trim()) {
      revalidatePath(`/opportunities/${parsed.followUp.opportunityId.trim()}`);
      revalidatePath(`/opportunities/${parsed.followUp.opportunityId.trim()}/follow-ups`);
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.errors[0]?.message ?? "表单无效" },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "打卡失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
