-- 节点内多条申请人→审批人映射
ALTER TABLE "ExpenseApprovalFlowStep" ADD COLUMN "mappings" JSONB;
