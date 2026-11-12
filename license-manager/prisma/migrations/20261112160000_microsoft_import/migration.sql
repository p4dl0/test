ALTER TABLE "License" ADD COLUMN "microsoftProductKey" TEXT;
ALTER TABLE "License" ADD COLUMN "microsoftAvailableSeats" INTEGER;
ALTER TABLE "License" ADD COLUMN "microsoftSubscriptionStatus" TEXT;
ALTER TABLE "License" ADD COLUMN "microsoftBillingProfile" TEXT;
ALTER TABLE "License" ADD COLUMN "microsoftRenewalDate" TEXT;
CREATE UNIQUE INDEX "License_microsoftProductKey_key" ON "License"("microsoftProductKey");
