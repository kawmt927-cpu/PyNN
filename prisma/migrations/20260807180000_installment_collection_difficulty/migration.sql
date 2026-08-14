-- 分期回款：困难标记（可催收由 phaseId + 阶段 COMPLETED 推导）

ALTER TABLE "PaymentInstallment" ADD COLUMN "collectionDifficulty" BOOLEAN NOT NULL DEFAULT false;
