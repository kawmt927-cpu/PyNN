import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/permissions";
import { HrEmployeeProfileForm } from "@/components/hr/hr-employee-profile-form";
import { HrDocumentsPanel } from "@/components/hr/hr-documents-panel";

type Props = {
  params: Promise<{ userId: string }>;
};

export default async function HrEmployeeDetailPage({ params }: Props) {
  await requireRole(["HR", "ADMIN"]);
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      personnelProfile: { select: { enabled: true } },
      personnelHrProfile: true,
      personnelHrDocuments: {
        orderBy: { createdAt: "desc" },
        include: {
          files: {
            orderBy: { createdAt: "desc" },
            include: { uploadedBy: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!user) notFound();

  const resigned = user.personnelProfile?.enabled === false;
  const profile = user.personnelHrProfile;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {user.name}
            {resigned ? (
              <span className="ml-2 text-base font-normal text-muted-foreground">离职</span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ROLE_LABELS[user.role]}
            {user.phone ? ` · ${user.phone}` : ""}
            {user.email ? ` · ${user.email}` : ""}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/hr/employees">返回列表</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本档案</CardTitle>
        </CardHeader>
        <CardContent>
          <HrEmployeeProfileForm
            key={`${profile?.idNumber ?? ""}-${profile?.idExpiresAt?.toISOString() ?? ""}`}
            userId={user.id}
            hiredAt={profile?.hiredAt ?? null}
            idNumber={profile?.idNumber ?? null}
            idExpiresAt={profile?.idExpiresAt ?? null}
            emergencyName={profile?.emergencyName ?? null}
            emergencyPhone={profile?.emergencyPhone ?? null}
            address={profile?.address ?? null}
            notes={profile?.notes ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">证件与合同</CardTitle>
        </CardHeader>
        <CardContent>
          <HrDocumentsPanel
            userId={user.id}
            documents={user.personnelHrDocuments.map((doc) => ({
              id: doc.id,
              kind: doc.kind,
              title: doc.title,
              issuedAt: doc.issuedAt?.toISOString() ?? null,
              expiresAt: doc.expiresAt?.toISOString() ?? null,
              notes: doc.notes,
              files: doc.files.map((file) => ({
                id: file.id,
                fileName: file.fileName,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                createdAt: file.createdAt.toISOString(),
                uploadedByName: file.uploadedBy.name,
              })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
