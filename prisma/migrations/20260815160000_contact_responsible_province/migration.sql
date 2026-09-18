-- 渠道联系人负责省区（可多选、可空）
CREATE TABLE "ContactResponsibleProvince" (
    "contactId" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("contactId", "province"),
    CONSTRAINT "ContactResponsibleProvince_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ContactResponsibleProvince_province_idx" ON "ContactResponsibleProvince"("province");
