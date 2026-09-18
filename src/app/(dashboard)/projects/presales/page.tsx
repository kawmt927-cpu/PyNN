import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESALES_REQUEST_STATUS_LABELS } from "@/lib/presales/labels";
import {
  approvePresalesRequest,
  rejectPresalesRequest,
} from "@/app/(dashboard)/projects/presales-actions";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function PresalesRequestsPage({ searchParams }: Props) {
  const session = await requireRole([
    "PROJECT_ADMIN",
    "ADMIN",
    "SALES",
    "SALES_MANAGER",
  ]);
  const { tab: rawTab } = await searchParams;
  const tab = rawTab === "done" ? "done" : "pending";
  const canApprove =
    session.user.role === "PROJECT_ADMIN" || session.user.role === "ADMIN";

  const statusFilter =
    tab === "pending"
      ? ({ status: "PENDING" as const })
      : ({ status: { in: ["APPROVED", "REJECTED"] as Array<"APPROVED" | "REJECTED"> } });

  const where = canApprove
    ? statusFilter
    : { ...statusFilter, salesUserId: session.user.id };

  const [requests, presalesUsers] = await Promise.all([
    prisma.presalesRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        salesUser: { select: { name: true } },
        customer: { select: { id: true, name: true } },
        preferredPresalesUser: { select: { id: true, name: true } },
        reviewedBy: { select: { name: true } },
      },
    }),
    canApprove
      ? prisma.user.findMany({
          where: {
            OR: [
              { personnelProfile: { isPresales: true, enabled: true } },
              {
                role: { in: ["PROJECT_STAFF", "PROJECT_MANAGER", "PROJECT_ADMIN"] },
                personnelProfile: { enabled: true },
              },
            ],
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 py-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/projects" className="hover:underline">
            项目
          </Link>
          <span className="mx-1.5">/</span>
          售前安排
        </p>
        <h1 className="mt-1 text-2xl font-bold">售前支援申请</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          销售发起申请，项目管理员确认后生成售前工作安排。
        </p>
      </div>

      <div className="flex gap-2 border-b">
        {(
          [
            { id: "pending", label: "待处理" },
            { id: "done", label: "已处理" },
          ] as const
        ).map((item) => (
          <Link
            key={item.id}
            href={`/projects/presales?tab=${item.id}`}
            className={
              tab === item.id
                ? "border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary"
                : "px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tab === "pending" ? "待审批" : "已处理"}（{requests.length}）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无记录</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="rounded-md border p-4 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.salesUser.name}</span>
                    <span className="text-muted-foreground">申请</span>
                    <Link
                      href={`/customers/${r.customer.id}`}
                      className="text-primary hover:underline"
                    >
                      {r.customer.name}
                    </Link>
                    <span className="ml-auto text-muted-foreground">
                      {format(r.createdAt, "yyyy-MM-dd HH:mm")}
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    时段：{format(r.startDate, "yyyy-MM-dd")}
                    {r.endDate ? ` ~ ${format(r.endDate, "yyyy-MM-dd")}` : ""}
                    {r.preferredPresalesUser
                      ? ` · 期望售前：${r.preferredPresalesUser.name}`
                      : ""}
                  </p>
                  <p className="mt-1">
                    状态：{PRESALES_REQUEST_STATUS_LABELS[r.status]}
                  </p>
                  {r.notes ? <p className="mt-1">说明：{r.notes}</p> : null}
                  {r.rejectReason ? (
                    <p className="mt-1 text-muted-foreground">
                      驳回原因：{r.rejectReason}
                    </p>
                  ) : null}
                  {r.reviewedBy && r.reviewedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.reviewedBy.name} 于{" "}
                      {format(r.reviewedAt, "yyyy-MM-dd HH:mm")} 处理
                    </p>
                  ) : null}

                  {canApprove && tab === "pending" && r.status === "PENDING" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form
                        action={approvePresalesRequest}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="requestId" value={r.id} />
                        <select
                          name="presalesUserId"
                          defaultValue={r.preferredPresalesUserId ?? ""}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          required={!r.preferredPresalesUserId}
                        >
                          <option value="">指定售前人员</option>
                          {presalesUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm">
                          通过
                        </Button>
                      </form>
                      <form
                        action={rejectPresalesRequest}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="requestId" value={r.id} />
                        <Input
                          name="rejectReason"
                          placeholder="驳回原因（可选）"
                          className="h-8 w-40"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          驳回
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
