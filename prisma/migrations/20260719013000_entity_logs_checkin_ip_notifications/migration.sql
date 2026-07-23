-- AlterTable
ALTER TABLE "SalesCheckIn" ADD COLUMN "clientIp" TEXT;
ALTER TABLE "SalesCheckIn" ADD COLUMN "ipProvince" TEXT;
ALTER TABLE "SalesCheckIn" ADD COLUMN "ipCity" TEXT;
ALTER TABLE "SalesCheckIn" ADD COLUMN "locationIpMismatch" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EntityOperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityOperationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkHref" TEXT,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppNotificationReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppNotificationReceipt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "AppNotification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AppNotificationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SalesCheckIn_locationIpMismatch_checkedInAt_idx" ON "SalesCheckIn"("locationIpMismatch", "checkedInAt");
CREATE INDEX "EntityOperationLog_entityType_entityId_createdAt_idx" ON "EntityOperationLog"("entityType", "entityId", "createdAt");
CREATE INDEX "EntityOperationLog_userId_createdAt_idx" ON "EntityOperationLog"("userId", "createdAt");
CREATE INDEX "AppNotification_createdAt_idx" ON "AppNotification"("createdAt");
CREATE INDEX "AppNotification_type_createdAt_idx" ON "AppNotification"("type", "createdAt");
CREATE UNIQUE INDEX "AppNotificationReceipt_notificationId_userId_key" ON "AppNotificationReceipt"("notificationId", "userId");
CREATE INDEX "AppNotificationReceipt_userId_readAt_createdAt_idx" ON "AppNotificationReceipt"("userId", "readAt", "createdAt");
