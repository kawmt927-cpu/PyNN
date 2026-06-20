import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { enrichCustomerWithKimi } from "@/lib/customers/kimi-enrich";
import type { UserRole } from "@prisma/client";

const SALES_LOG_ROLES: UserRole[] = ["SALES", "SALES_MANAGER", "ADMIN"];

const enrichRequestSchema = z.object({
  name: z.string().min(1, "请填写客户名称"),
  category: z.enum(["HOSPITAL", "COMPANY", "INDIVIDUAL"]),
  province: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !SALES_LOG_ROLES.includes(session.user.role)) {
    return Response.json({ error: "未登录或无权操作" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = enrichRequestSchema.parse(body);

    if (parsed.category === "INDIVIDUAL") {
      return Response.json({ error: "个人客户不支持 Kimi 信息检索" }, { status: 400 });
    }

    const result = await enrichCustomerWithKimi({
      name: parsed.name,
      category: parsed.category,
      province: parsed.province ?? undefined,
      city: parsed.city ?? undefined,
      district: parsed.district ?? undefined,
    });

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: error.errors[0]?.message ?? "参数无效" },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : "Kimi 检索失败";
    return Response.json({ error: message }, { status: 502 });
  }
}
