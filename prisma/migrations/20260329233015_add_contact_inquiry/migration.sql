-- AlterTable
ALTER TABLE "Case" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DecisionRun" ALTER COLUMN "modalitiesCovered" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ExtractedSignal" ALTER COLUMN "corroboratedBy" DROP DEFAULT,
ALTER COLUMN "contradictedBy" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ContactInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactInquiry_createdAt_idx" ON "ContactInquiry"("createdAt" DESC);
