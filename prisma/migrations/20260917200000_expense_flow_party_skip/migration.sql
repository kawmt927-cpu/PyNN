-- 申请人 / 审批人两侧 + 跳过
ALTER TABLE "ExpenseApprovalFlowStep" ADD COLUMN "applicantRoles" JSONB;
ALTER TABLE "ExpenseApprovalFlowStep" ADD COLUMN "applicantUserIds" JSONB;
ALTER TABLE "ExpenseApprovalFlowStep" ADD COLUMN "approverRoles" JSONB;
ALTER TABLE "ExpenseApprovalFlowStep" ADD COLUMN "approverUserIds" JSONB;
ALTER TABLE "ExpenseApprovalFlowStep" ADD COLUMN "approverSkip" BOOLEAN NOT NULL DEFAULT false;
