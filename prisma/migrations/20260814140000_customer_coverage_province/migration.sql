-- CreateTable
CREATE TABLE "CustomerCoverageProvince" (
    "customerId" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerCoverageProvince_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("customerId", "province")
);

-- CreateIndex
CREATE INDEX "CustomerCoverageProvince_province_idx" ON "CustomerCoverageProvince"("province");
