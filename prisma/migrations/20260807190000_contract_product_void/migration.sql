-- 外部成本产品作废保留

ALTER TABLE "ContractProduct" ADD COLUMN "voidedAt" DATETIME;
ALTER TABLE "ContractProduct" ADD COLUMN "voidedById" TEXT;

CREATE INDEX "ContractProduct_voidedAt_idx" ON "ContractProduct"("voidedAt");
