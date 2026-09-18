-- AlterTable
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "penaltyAmount" DECIMAL DEFAULT 0;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "copiedFromYear" INTEGER;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "copiedFromMonth" INTEGER;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "copiedSnapshot" TEXT;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "changeSummary" TEXT;

-- CreateTable
CREATE TABLE "PersonnelHrProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "hiredAt" DATETIME,
    "idNumber" TEXT,
    "idExpiresAt" DATETIME,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonnelHrProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PersonnelHrProfile_userId_key" ON "PersonnelHrProfile"("userId");

CREATE TABLE "PersonnelHrDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuedAt" DATETIME,
    "expiresAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PersonnelHrDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PersonnelHrDocument_userId_kind_idx" ON "PersonnelHrDocument"("userId", "kind");
CREATE INDEX "PersonnelHrDocument_expiresAt_idx" ON "PersonnelHrDocument"("expiresAt");

CREATE TABLE "PersonnelHrDocumentFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonnelHrDocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "PersonnelHrDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PersonnelHrDocumentFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PersonnelHrDocumentFile_documentId_idx" ON "PersonnelHrDocumentFile"("documentId");
