-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "claimValueUsd" DOUBLE PRECISION,
ADD COLUMN     "shopifyOrderId" TEXT;

-- CreateTable
CREATE TABLE "ShopifyConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "webhookIds" TEXT[],
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_userId_key" ON "ShopifyConnection"("userId");

-- CreateIndex
CREATE INDEX "ShopifyConnection_shop_idx" ON "ShopifyConnection"("shop");
