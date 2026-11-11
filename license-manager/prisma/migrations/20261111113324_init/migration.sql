-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productName" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "licenseType" TEXT NOT NULL,
    "encryptedKey" TEXT,
    "keySuffix" TEXT,
    "seatTracking" BOOLEAN NOT NULL DEFAULT true,
    "purchasedSeats" INTEGER NOT NULL DEFAULT 1,
    "assignedSeats" INTEGER NOT NULL DEFAULT 0,
    "purchaseDate" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "expirationDate" TEXT NOT NULL,
    "renewalDate" TEXT,
    "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
    "annualCostMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "departmentId" TEXT NOT NULL,
    "responsibleUserId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "departmentId" TEXT,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "licenseId" TEXT,
    "userId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "expirationDate" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    CONSTRAINT "Notification_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "licenseId" TEXT,
    "productName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    CONSTRAINT "AuditLog_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'organization',
    "organizationName" TEXT NOT NULL DEFAULT 'Northstar Health Group',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Riga',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateIndex
CREATE INDEX "License_expirationDate_idx" ON "License"("expirationDate");

-- CreateIndex
CREATE INDEX "License_vendorId_idx" ON "License"("vendorId");

-- CreateIndex
CREATE INDEX "License_departmentId_idx" ON "License"("departmentId");

-- CreateIndex
CREATE INDEX "License_responsibleUserId_idx" ON "License"("responsibleUserId");

-- CreateIndex
CREATE INDEX "License_licenseType_idx" ON "License"("licenseType");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_licenseId_timestamp_idx" ON "AuditLog"("licenseId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_action_timestamp_idx" ON "AuditLog"("action", "timestamp");
