-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE "new_License" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT,
    "lastImportedAt" DATETIME,
    "microsoftProductKey" TEXT,
    "microsoftAvailableSeats" INTEGER,
    "microsoftSubscriptionStatus" TEXT,
    "microsoftBillingProfile" TEXT,
    "microsoftRenewalDate" TEXT,
    "productName" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "encryptedKey" TEXT,
    "keySuffix" TEXT,
    "seatTracking" BOOLEAN NOT NULL DEFAULT true,
    "purchasedSeats" INTEGER DEFAULT 1,
    "assignedSeats" INTEGER DEFAULT 0,
    "purchaseDate" TEXT,
    "startDate" TEXT,
    "expirationDate" TEXT,
    "renewalDate" TEXT,
    "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
    "annualCostMinor" INTEGER DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "departmentId" TEXT,
    "responsibleUserId" TEXT,
    "supplier" TEXT NOT NULL DEFAULT '',
    "contractNumber" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "License_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "License_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "License_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_License" ("annualCostMinor", "assignedSeats", "autoRenewal", "contractNumber", "createdAt", "currency", "departmentId", "encryptedKey", "expirationDate", "id", "keySuffix", "licenseType", "microsoftAvailableSeats", "microsoftBillingProfile", "microsoftProductKey", "microsoftRenewalDate", "microsoftSubscriptionStatus", "notes", "productName", "purchaseDate", "purchasedSeats", "renewalDate", "responsibleUserId", "seatTracking", "startDate", "supplier", "updatedAt", "vendorId", "version") SELECT "annualCostMinor", "assignedSeats", "autoRenewal", "contractNumber", "createdAt", "currency", "departmentId", "encryptedKey", "expirationDate", "id", "keySuffix", "licenseType", "microsoftAvailableSeats", "microsoftBillingProfile", "microsoftProductKey", "microsoftRenewalDate", "microsoftSubscriptionStatus", "notes", "productName", "purchaseDate", "purchasedSeats", "renewalDate", "responsibleUserId", "seatTracking", "startDate", "supplier", "updatedAt", "vendorId", "version" FROM "License";
DROP TABLE "License";
ALTER TABLE "new_License" RENAME TO "License";
CREATE UNIQUE INDEX "License_microsoftProductKey_key" ON "License"("microsoftProductKey");
CREATE INDEX "License_expirationDate_idx" ON "License"("expirationDate");
CREATE INDEX "License_vendorId_idx" ON "License"("vendorId");
CREATE INDEX "License_departmentId_idx" ON "License"("departmentId");
CREATE INDEX "License_responsibleUserId_idx" ON "License"("responsibleUserId");
CREATE INDEX "License_licenseType_idx" ON "License"("licenseType");
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

