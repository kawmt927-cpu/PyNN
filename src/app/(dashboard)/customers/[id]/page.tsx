import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getPrismaClient } from "@/lib/prisma";
import {
  getCustomerForUser,
  canManageCustomerOwner,
} from "@/lib/customers/access";
import {
  CUSTOMER_CATEGORY_LABELS,
  FOLLOW_UP_METHOD_LABELS,
  HOSPITAL_LEVEL_LABELS,
} from "@/lib/permissions";
import {
  CONFIG_CATEGORY,
  labelForConfig,
  loadCustomerFieldLabelMaps,
  loadCustomerFormOptions,
} from "@/lib/config-options";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowUpForm } from "@/components/customers/follow-up-form";
import { ContactList } from "@/components/customers/contact-list";
import { CustomerRelationsPanel } from "@/components/customers/customer-relations-panel";
import { CustomerOwnerPanel } from "@/components/customers/customer-owner-panel";
import { CustomerApplyPanel } from "@/components/customers/customer-apply-panel";
import { format } from "date-fns";

type Props = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await requireRole(["SALES", "SALES_MANAGER", "ADMIN"]);
  const db = getPrismaClient();
  const customer = await getCustomerForUser(id, session.user.role, session.user.id);

  if (!customer) notFound();

  const canManage = canManageCustomerOwner(session.user.role);
  const inPool = customer.ownerId === null;
  const isSales = session.user.role === "SALES";

  const [salesUsers, labelMaps, formOptions, pendingClaimForSales, pendingClaimCount, relationCandidates] =
    await Promise.all([
      canManage
        ? db.user.findMany({
            where: { role: { in: ["SALES", "SALES_MANAGER"] } },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      loadCustomerFieldLabelMaps(),
      loadCustomerFormOptions(),
      isSales && inPool
        ? db.customerClaimRequest.findFirst({
            where: {
              customerId: customer.id,
              requesterId: session.user.id,
              status: "PENDING",
            },
          })
        : Promise.resolve(null),
      canManage && inPool
        ? db.customerClaimRequest.count({
            where: { customerId: customer.id, status: "PENDING" },
          })
        : Promise.resolve(0),
      db.customer.findMany({
        where: {
          id: {
            notIn: [
              customer.id,
              ...customer.relationsFrom.map((r) => r.relatedCustomerId),
              ...customer.relationsTo.map((r) => r.customerId),
            ],
          },
        },
        select: { id: true, name: true, category: true, customerType: true },
        orderBy: { name: "asc" },
        take: 200,
      }),
    ]);

  const sourceLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_SOURCE] ?? {};
  const typeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_TYPE] ?? {};
  const gradeLabels = labelMaps[CONFIG_CATEGORY.CUSTOMER_GRADE] ?? {};

  const relations = [
    ...customer.relationsFrom.map((r) => ({
      relationId: r.id,
      customer: r.relatedCustomer,
      relationNote: r.relationNote,
    })),
    ...customer.relationsTo.map((r) => ({
      relationId: r.id,
      customer: r.customer,
      relationNote: r.relationNote,
    })),
  ];

  const location = [customer.province, customer.city, customer.district]
    .filter(Boolean)
    .join(" ");

  const canEdit = customer.ownerId === session.user.id || canManage;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <p className="text-muted-foreground">
            {CUSTOMER_CATEGORY_LABELS[customer.category]}
            {customer.customerType && ` · ${labelForConfig(typeLabels, customer.customerType)}`}
            {customer.customerGrade && ` · ${labelForConfig(gradeLabels, customer.customerGrade)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/customers">返回列表</Link>
          </Button>
          {canEdit && (
            <Button asChild>
              <Link href={`/customers/${customer.id}/edit`}>编辑</Link>
            </Button>
          )}
        </div>
      </div>

      <CustomerOwnerPanel
        customerId={customer.id}
        ownerId={customer.ownerId}
        ownerName={customer.owner?.name ?? null}
        role={session.user.role}
        salesUsers={salesUsers}
      />

      {isSales && inPool && (
        <CustomerApplyPanel
          customerId={customer.id}
          hasPendingRequest={Boolean(pendingClaimForSales)}
        />
      )}

      {canManage && inPool && pendingClaimCount > 0 && (
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          该客户有 {pendingClaimCount} 条待审批认领申请。
          <Link
            href={`/approvals?customerId=${customer.id}`}
            className="ml-2 font-medium text-primary hover:underline"
          >
            前往审批中心处理
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="负责人" value={customer.owner?.name ?? "公海池"} />
            <Row label="地区" value={location || "—"} />
            {customer.category === "HOSPITAL" && (
              <>
                <Row
                  label="医院等级"
                  value={
                    customer.hospitalLevel
                      ? HOSPITAL_LEVEL_LABELS[customer.hospitalLevel]
                      : "—"
                  }
                />
                <Row label="床位数" value={customer.bedCount?.toString() ?? "—"} />
              </>
            )}
            <Row label="现有系统" value={customer.existingSystem ?? "—"} />
            <Row label="客户类型" value={labelForConfig(typeLabels, customer.customerType)} />
            <Row label="客户等级" value={labelForConfig(gradeLabels, customer.customerGrade)} />
            <Row label="客户来源" value={labelForConfig(sourceLabels, customer.source)} />
            <Row label="备注" value={customer.notes ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">联系人</CardTitle>
          </CardHeader>
          <CardContent>
            <ContactList
              customerId={customer.id}
              contacts={customer.contacts}
              readOnly={!canEdit}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">关联客户</CardTitle>
        </CardHeader>
        <CardContent>
            <CustomerRelationsPanel
              customerId={customer.id}
              relations={relations}
              candidates={canEdit ? relationCandidates : []}
              typeLabels={typeLabels}
              readOnly={!canEdit}
            />
        </CardContent>
      </Card>

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">跟进记录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无跟进记录</p>
            ) : (
              <ul className="space-y-4">
                {customer.followUps.map((f) => (
                  <li key={f.id} className="rounded-md border p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {FOLLOW_UP_METHOD_LABELS[f.method]} · {f.user.name}
                        {f.contact && ` · ${f.contact.name}`}
                      </span>
                      <span className="text-muted-foreground">
                        {format(f.followUpAt, "yyyy-MM-dd HH:mm")}
                      </span>
                    </div>
                    <p className="mt-2">{f.content}</p>
                    {f.result && (
                      <p className="mt-1 text-muted-foreground">结果：{f.result}</p>
                    )}
                    {f.nextFollowUpAt && (
                      <p className="mt-1 text-orange-600">
                        下次跟进：{format(f.nextFollowUpAt, "yyyy-MM-dd HH:mm")}
                      </p>
                    )}
                    {f.faceVisit && (
                      <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                        <p>地点：{f.faceVisit.location}</p>
                        {f.faceVisit.department && <p>科室：{f.faceVisit.department}</p>}
                        <p className="mt-1">{f.faceVisit.detailedNotes}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <FollowUpForm
              customerId={customer.id}
              contacts={customer.contacts}
              gradeOptions={formOptions.gradeOptions}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
