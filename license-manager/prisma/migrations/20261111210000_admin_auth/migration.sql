CREATE TABLE "AdminCredential" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "passwordHash" TEXT NOT NULL,
    CONSTRAINT "AdminCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AdminSession" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminCredential" ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
CREATE TABLE "LoginThrottle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0
);
