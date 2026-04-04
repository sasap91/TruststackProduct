-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "email" TEXT,
ADD COLUMN     "shippingAddress" TEXT;

-- CreateIndex
CREATE INDEX "Case_shippingAddress_idx" ON "Case"("shippingAddress");

-- CreateIndex
CREATE INDEX "Case_email_idx" ON "Case"("email");
