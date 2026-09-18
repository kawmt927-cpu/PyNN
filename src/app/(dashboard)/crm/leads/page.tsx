import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listCustomerAssignableUsers } from "@/lib/customers/access";
import { LEAD_GRADE_ALIASES, LEAD_GRADE_LABEL } from "@/lib/customers/lead-status";
import {
  assignLeadOwner,
  convertLeadToIntent,
} from "@/app/(dashboard)/crm/leads/actions";
import { format } from "date-fns";

export default async function LeadsPoolPage() {
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const canAssign =
    session.user.role === "SALES_MANAGER" || session.user.role === "ADMIN";

  const where =
    session.user.role === "SALES"
      ? {
          customerGrade: { in: [...LEAD_GRADE_ALIASES] },
          OR: [{ ownerId: session.user.id }, { ownerId: null }],
        }
      : { customerGrade: { in: [...LEAD_GRADE_ALIASES] } };

  const [leads, salesUsers] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        province: true,
        city: true,
        ownerId: true,
        customerGrade: true,
        createdAt: true,
        owner: { select: { name: true } },
      },
    }),
    canAssign ? listCustomerAssignableUsers() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/crm" className="hover:underline">
            业务
          </Link>
          <span className="mx-1.5">/</span>
          线索池
        </p>
        <h1 className="mt-1 text-2xl font-bold">线索池</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          客户等级为「{LEAD_GRADE_LABEL}」（customerGrade=LEAD）的客户；可分配负责人并转为意向。
          亦可从{" "}
          <Link href="/customers?status=线索" className="text-primary hover:underline">
            /customers?status=线索
          </Link>{" "}
          进入。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">线索列表（{leads.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              暂无线索。可将客户等级设为「线索」后出现在此。
            </p>
          ) : (
            <ul className="space-y-3">
              {leads.map((lead) => (
                <li
                  key={lead.id}
                  className="flex flex-col gap-2 rounded-md border p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <Link
                      href={`/customers/${lead.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {lead.name}
                    </Link>
                    <p className="mt-0.5 text-muted-foreground">
                      {[lead.province, lead.city].filter(Boolean).join(" ") || "地区未填"}
                      {" · "}
                      负责人：{lead.owner?.name ?? "未分配"}
                      {" · "}
                      {format(lead.createdAt, "yyyy-MM-dd")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canAssign ? (
                      <form action={assignLeadOwner} className="flex items-center gap-2">
                        <input type="hidden" name="customerId" value={lead.id} />
                        <select
                          name="salesUserId"
                          required
                          defaultValue={lead.ownerId ?? ""}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="" disabled>
                            分配负责人
                          </option>
                          {salesUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm" variant="secondary">
                          分配
                        </Button>
                      </form>
                    ) : null}
                    {(canAssign || lead.ownerId === session.user.id) && (
                      <form action={convertLeadToIntent}>
                        <input type="hidden" name="customerId" value={lead.id} />
                        <Button type="submit" size="sm">
                          转为意向
                        </Button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
