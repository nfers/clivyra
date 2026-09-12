-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "actorMembershipId" TEXT,
    "actorRole" "MembershipRole",
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "requestId" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "changes" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_occurredAt_idx" ON "AuditLog"("tenantId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_occurredAt_idx" ON "AuditLog"("tenantId", "entityType", "entityId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_actorUserId_occurredAt_idx" ON "AuditLog"("tenantId", "actorUserId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_action_occurredAt_idx" ON "AuditLog"("tenantId", "action", "occurredAt" DESC);

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only immutability (CLI-14)
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
