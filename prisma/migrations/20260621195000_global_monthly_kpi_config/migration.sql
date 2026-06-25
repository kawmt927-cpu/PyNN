-- CreateTable
CREATE TABLE "SalesMonthlyKpiConfig" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "channelDevTarget" INTEGER,
    "projectDevTarget" INTEGER,
    "paymentCollectionTarget" DECIMAL,
    "maintenanceTarget" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesMonthlyKpiConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesMonthlyKpiConfig_year_month_key" ON "SalesMonthlyKpiConfig"("year", "month");
