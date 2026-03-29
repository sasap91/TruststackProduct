-- Align database with prisma/schema.prisma: Case risk fields + decision infrastructure.

ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "riskScore" DOUBLE PRECISION;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "riskLevel" TEXT;

CREATE TABLE "PolicyVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "packId" TEXT NOT NULL DEFAULT 'standard',
    "configSnapshot" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyVersion_version_packId_key" ON "PolicyVersion"("version", "packId");
CREATE INDEX "PolicyVersion_isActive_idx" ON "PolicyVersion"("isActive");

CREATE TABLE "DecisionRun" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "policyVersionId" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "pipelineVersion" TEXT NOT NULL DEFAULT '2.0.0',
    "riskScore" DOUBLE PRECISION,
    "riskLevel" TEXT,
    "evidenceStrength" TEXT,
    "consistencyScore" DOUBLE PRECISION,
    "modalitiesCovered" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outcome" TEXT,
    "confidence" DOUBLE PRECISION,
    "explanation" TEXT,
    "judgeSource" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "DecisionRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DecisionRun_caseId_startedAt_idx" ON "DecisionRun"("caseId", "startedAt" DESC);
CREATE INDEX "DecisionRun_policyVersionId_idx" ON "DecisionRun"("policyVersionId");

ALTER TABLE "DecisionRun" ADD CONSTRAINT "DecisionRun_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionRun" ADD CONSTRAINT "DecisionRun_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OutcomeFeedback" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionRunId" TEXT,
    "kind" TEXT NOT NULL,
    "pipelineOutcome" TEXT,
    "finalOutcome" TEXT,
    "chargebackWon" BOOLEAN,
    "amountUsd" DOUBLE PRECISION,
    "notes" TEXT,
    "recordedBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutcomeFeedback_caseId_createdAt_idx" ON "OutcomeFeedback"("caseId", "createdAt" DESC);
CREATE INDEX "OutcomeFeedback_kind_idx" ON "OutcomeFeedback"("kind");
CREATE INDEX "OutcomeFeedback_decisionRunId_idx" ON "OutcomeFeedback"("decisionRunId");

ALTER TABLE "OutcomeFeedback" ADD CONSTRAINT "OutcomeFeedback_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutcomeFeedback" ADD CONSTRAINT "OutcomeFeedback_decisionRunId_fkey" FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ExtractedSignal" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionRunId" TEXT NOT NULL,
    "sourceArtifactId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "weight" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "rawScore" DOUBLE PRECISION,
    "sourceModality" TEXT NOT NULL,
    "extractor" TEXT NOT NULL,
    "rationale" TEXT,
    "reinforced" BOOLEAN NOT NULL DEFAULT false,
    "fusedFromCount" INTEGER NOT NULL DEFAULT 1,
    "corroboratedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contradictedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExtractedSignal_caseId_idx" ON "ExtractedSignal"("caseId");
CREATE INDEX "ExtractedSignal_decisionRunId_idx" ON "ExtractedSignal"("decisionRunId");
CREATE INDEX "ExtractedSignal_sourceArtifactId_idx" ON "ExtractedSignal"("sourceArtifactId");
CREATE INDEX "ExtractedSignal_key_flag_idx" ON "ExtractedSignal"("key", "flag");

ALTER TABLE "ExtractedSignal" ADD CONSTRAINT "ExtractedSignal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExtractedSignal" ADD CONSTRAINT "ExtractedSignal_decisionRunId_fkey" FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExtractedSignal" ADD CONSTRAINT "ExtractedSignal_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "EvidenceArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ActionExecution" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionRunId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetSystem" TEXT,
    "auditMessage" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "notes" TEXT,
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActionExecution_caseId_idx" ON "ActionExecution"("caseId");
CREATE INDEX "ActionExecution_decisionRunId_idx" ON "ActionExecution"("decisionRunId");
CREATE INDEX "ActionExecution_action_status_idx" ON "ActionExecution"("action", "status");

ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_decisionRunId_fkey" FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "HumanReview" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionRunId" TEXT,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "notes" TEXT,
    "confidence" DOUBLE PRECISION,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HumanReview_decisionRunId_key" ON "HumanReview"("decisionRunId");
CREATE INDEX "HumanReview_caseId_idx" ON "HumanReview"("caseId");
CREATE INDEX "HumanReview_reviewerId_idx" ON "HumanReview"("reviewerId");

ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HumanReview" ADD CONSTRAINT "HumanReview_decisionRunId_fkey" FOREIGN KEY ("decisionRunId") REFERENCES "DecisionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
