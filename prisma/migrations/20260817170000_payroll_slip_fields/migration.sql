-- AlterTable
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "payrollEntity" TEXT;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "seniorityYears" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "bonus" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "performancePay" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "wageAdjust" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "sickLeaveDays" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "sickLeaveDeduction" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "personalLeaveDays" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "personalLeaveDeduction" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "payableWage" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "pensionPersonal" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "medicalPersonal" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "unemploymentPersonal" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "socialSecurityPersonal" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "housingFundPersonal" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "incomeTax" DECIMAL;
ALTER TABLE "PersonnelMonthlyCostAdjustment" ADD COLUMN "netPay" DECIMAL;
