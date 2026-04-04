-- CreateTable
CREATE TABLE "MerchantPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riskWeights" JSONB NOT NULL,
    "autoApproveBelow" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "autoRejectAbove" DOUBLE PRECISION NOT NULL DEFAULT 0.88,
    "reviewBand" JSONB NOT NULL,
    "claimValueThreshold" DOUBLE PRECISION,
    "maxRefundsPerMonth" INTEGER,
    "customRules" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantPolicy_userId_key" ON "MerchantPolicy"("userId");

-- CreateIndex
CREATE INDEX "MerchantPolicy_userId_idx" ON "MerchantPolicy"("userId");
