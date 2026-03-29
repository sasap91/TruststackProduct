-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'ANALYZING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('IMAGE', 'TEXT', 'DOCUMENT', 'ORDER_DATA', 'METADATA');

-- AlterTable: add new columns to Case with safe defaults for existing rows
ALTER TABLE "Case"
  ADD COLUMN "ref"         TEXT,
  ADD COLUMN "status"      "CaseStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "resolvedAt"  TIMESTAMP(3),
  ADD COLUMN "description" TEXT;

-- Backfill ref for any existing rows (use a short prefix + the existing cuid)
UPDATE "Case" SET "ref" = 'TS-LEGACY-' || SUBSTRING("id", 1, 8) WHERE "ref" IS NULL;

-- Now make ref non-nullable and unique
ALTER TABLE "Case" ALTER COLUMN "ref" SET NOT NULL;
CREATE UNIQUE INDEX "Case_ref_key" ON "Case"("ref");

-- Migrate existing status from decision column where available
UPDATE "Case"
  SET "status" = CASE
    WHEN "decision" = 'approve' THEN 'APPROVED'::"CaseStatus"
    WHEN "decision" = 'reject'  THEN 'REJECTED'::"CaseStatus"
    WHEN "decision" = 'flag'    THEN 'FLAGGED'::"CaseStatus"
    ELSE 'OPEN'::"CaseStatus"
  END;

-- Drop columns that moved to EvidenceArtifact (safe: data preserved in signals/decision)
ALTER TABLE "Case"
  DROP COLUMN IF EXISTS "mode",
  DROP COLUMN IF EXISTS "imageAiProb",
  DROP COLUMN IF EXISTS "textAiProb",
  DROP COLUMN IF EXISTS "claimText";

-- Add index on status
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateTable: EvidenceArtifact
CREATE TABLE "EvidenceArtifact" (
    "id"          TEXT NOT NULL,
    "caseId"      TEXT NOT NULL,
    "type"        "EvidenceType" NOT NULL,
    "rawText"     TEXT,
    "storageRef"  TEXT,
    "mimeType"    TEXT,
    "sizeBytes"   INTEGER,
    "agentName"   TEXT,
    "agentModel"  TEXT,
    "agentSource" TEXT,
    "rawScore"    DOUBLE PRECISION,
    "agentNotes"  JSONB,
    "signals"     JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceArtifact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EvidenceArtifact_caseId_idx" ON "EvidenceArtifact"("caseId");

ALTER TABLE "EvidenceArtifact"
  ADD CONSTRAINT "EvidenceArtifact_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: CaseEvent
CREATE TABLE "CaseEvent" (
    "id"        TEXT NOT NULL,
    "caseId"    TEXT NOT NULL,
    "actor"     TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "payload"   JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaseEvent_caseId_createdAt_idx" ON "CaseEvent"("caseId", "createdAt" DESC);

ALTER TABLE "CaseEvent"
  ADD CONSTRAINT "CaseEvent_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
