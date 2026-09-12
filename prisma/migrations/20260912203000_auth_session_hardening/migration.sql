-- CLI-12: refresh family/reuse detection, lockout, session invalidation stamps

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionsInvalidatedAt" TIMESTAMP(3);

ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "familyId" TEXT;
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "replacedById" TEXT;
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "revokedReason" TEXT;
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "ipHash" TEXT;

UPDATE "RefreshSession" SET "familyId" = "id" WHERE "familyId" IS NULL;

ALTER TABLE "RefreshSession" ALTER COLUMN "familyId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshSession_replacedById_key" ON "RefreshSession"("replacedById");

DROP INDEX IF EXISTS "RefreshSession_userId_tenantId_idx";
DROP INDEX IF EXISTS "RefreshSession_tenantId_revokedAt_idx";

CREATE INDEX IF NOT EXISTS "RefreshSession_tenantId_userId_revokedAt_idx" ON "RefreshSession"("tenantId", "userId", "revokedAt");
CREATE INDEX IF NOT EXISTS "RefreshSession_userId_familyId_idx" ON "RefreshSession"("userId", "familyId");
