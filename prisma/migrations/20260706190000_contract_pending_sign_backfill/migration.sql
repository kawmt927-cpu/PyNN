-- 历史遗留「待签署」合同并入待审核流程，并补全提交信息
UPDATE "Contract"
SET
  "status" = 'PENDING_APPROVAL',
  "submittedAt" = COALESCE("submittedAt", "createdAt"),
  "submittedById" = COALESCE("submittedById", "ownerId")
WHERE "status" = 'PENDING_SIGN';
