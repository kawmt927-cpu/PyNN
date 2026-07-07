-- CreateTable
CREATE TABLE "WeComAccessRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wecomUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "WeComAccessRequest_userId_key" ON "WeComAccessRequest"("userId");
CREATE INDEX "WeComAccessRequest_status_idx" ON "WeComAccessRequest"("status");
CREATE INDEX "WeComAccessRequest_wecomUserId_idx" ON "WeComAccessRequest"("wecomUserId");
