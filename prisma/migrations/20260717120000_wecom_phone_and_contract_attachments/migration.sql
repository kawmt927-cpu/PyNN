-- RedefineTable User: email optional, add phone
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SALES',
    "wecomUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("id", "email", "name", "passwordHash", "role", "wecomUserId", "createdAt", "updatedAt")
SELECT "id", "email", "name", "passwordHash", "role", "wecomUserId", "createdAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_wecomUserId_key" ON "User"("wecomUserId");

-- RedefineTable WeComAccessRequest: email -> phone, add passwordHash
CREATE TABLE "new_WeComAccessRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wecomUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WeComAccessRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WeComAccessRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WeComAccessRequest" ("id", "wecomUserId", "name", "phone", "message", "status", "reviewerId", "reviewNote", "reviewedAt", "userId", "createdAt", "updatedAt")
SELECT "id", "wecomUserId", "name", COALESCE("email", '00000000000'), "message", "status", "reviewerId", "reviewNote", "reviewedAt", "userId", "createdAt", "updatedAt" FROM "WeComAccessRequest";
DROP TABLE "WeComAccessRequest";
ALTER TABLE "new_WeComAccessRequest" RENAME TO "WeComAccessRequest";
CREATE UNIQUE INDEX "WeComAccessRequest_userId_key" ON "WeComAccessRequest"("userId");
CREATE INDEX "WeComAccessRequest_status_idx" ON "WeComAccessRequest"("status");
CREATE INDEX "WeComAccessRequest_wecomUserId_idx" ON "WeComAccessRequest"("wecomUserId");
CREATE INDEX "WeComAccessRequest_phone_idx" ON "WeComAccessRequest"("phone");

-- ContractAttachment
CREATE TABLE "ContractAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContractAttachment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContractAttachment_contractId_idx" ON "ContractAttachment"("contractId");
