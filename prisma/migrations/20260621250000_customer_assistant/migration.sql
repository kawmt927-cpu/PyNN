-- CreateTable
CREATE TABLE "CustomerAssistant" (
    "customerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAssistant_pkey" PRIMARY KEY ("customerId", "userId"),
    CONSTRAINT "CustomerAssistant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomerAssistant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CustomerAssistant_userId_idx" ON "CustomerAssistant"("userId");
