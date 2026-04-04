-- AlterEnum
ALTER TYPE "CaseStatus" ADD VALUE 'AWAITING_EVIDENCE';

-- AlterTable
ALTER TABLE "DecisionRun" ADD COLUMN     "iterationNumber" INTEGER NOT NULL DEFAULT 1;
