-- CLI-15: Consent terms, append-only consent records, data subject requests

-- CreateEnum
CREATE TYPE "ConsentTermType" AS ENUM ('PRIVACY_POLICY', 'DATA_PROCESSING', 'TREATMENT', 'IMAGE_USE', 'COMMUNICATIONS');
CREATE TYPE "ConsentTermStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "ConsentSubjectType" AS ENUM ('PATIENT', 'LEAD', 'USER');
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "ConsentSource" AS ENUM ('WEB_FORM', 'IN_PERSON', 'IMPORT', 'API');
CREATE TYPE "LegalBasis" AS ENUM ('CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'HEALTH_PROTECTION', 'LEGITIMATE_INTEREST');
CREATE TYPE "DataSubjectRequestType" AS ENUM ('ACCESS', 'EXPORT', 'RECTIFICATION', 'ERASURE', 'CONSENT_REVOCATION');
CREATE TYPE "DataSubjectRequestStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateTable ConsentTerm
CREATE TABLE "ConsentTerm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ConsentTermType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "purposes" TEXT[],
    "legalBasis" "LegalBasis" NOT NULL DEFAULT 'CONSENT',
    "requiresRenewalAfterDays" INTEGER,
    "requiresReconsent" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConsentTermStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable ConsentRecord
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "termVersion" INTEGER NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "supersedesId" TEXT,
    "collectedByUserId" TEXT,
    "evidence" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable DataSubjectRequest
CREATE TABLE "DataSubjectRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectType" "ConsentSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "type" "DataSubjectRequestType" NOT NULL,
    "status" "DataSubjectRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "channel" "ConsentSource" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "resolutionNotes" TEXT,
    "resultRef" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ConsentTerm_tenantId_type_version_key" ON "ConsentTerm"("tenantId", "type", "version");
CREATE INDEX "ConsentTerm_tenantId_type_status_idx" ON "ConsentTerm"("tenantId", "type", "status");

CREATE UNIQUE INDEX "ConsentRecord_supersedesId_key" ON "ConsentRecord"("supersedesId");
CREATE INDEX "ConsentRecord_tenantId_subjectType_subjectId_createdAt_idx" ON "ConsentRecord"("tenantId", "subjectType", "subjectId", "createdAt" DESC);
CREATE INDEX "ConsentRecord_tenantId_termId_status_idx" ON "ConsentRecord"("tenantId", "termId", "status");
CREATE INDEX "ConsentRecord_tenantId_status_expiresAt_idx" ON "ConsentRecord"("tenantId", "status", "expiresAt");

CREATE INDEX "DataSubjectRequest_tenantId_status_dueAt_idx" ON "DataSubjectRequest"("tenantId", "status", "dueAt");
CREATE INDEX "DataSubjectRequest_tenantId_subjectType_subjectId_idx" ON "DataSubjectRequest"("tenantId", "subjectType", "subjectId");

-- Foreign keys
ALTER TABLE "ConsentTerm" ADD CONSTRAINT "ConsentTerm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_termId_fkey" FOREIGN KEY ("termId") REFERENCES "ConsentTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataSubjectRequest" ADD CONSTRAINT "DataSubjectRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rename immutable guard for reuse (AuditLog + ConsentRecord)
CREATE OR REPLACE FUNCTION append_only_guard() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- Keep legacy name as alias for existing AuditLog triggers
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON "AuditLog";
DROP TRIGGER IF EXISTS audit_log_no_delete ON "AuditLog";

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();

CREATE TRIGGER consent_record_no_update BEFORE UPDATE ON "ConsentRecord"
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();
CREATE TRIGGER consent_record_no_delete BEFORE DELETE ON "ConsentRecord"
  FOR EACH ROW EXECUTE FUNCTION append_only_guard();

-- Block content changes on non-DRAFT consent terms
CREATE OR REPLACE FUNCTION consent_term_content_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
    NEW.content IS DISTINCT FROM OLD.content OR
    NEW."contentHash" IS DISTINCT FROM OLD."contentHash" OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.purposes IS DISTINCT FROM OLD.purposes OR
    NEW."legalBasis" IS DISTINCT FROM OLD."legalBasis" OR
    NEW.type IS DISTINCT FROM OLD.type
  ) THEN
    RAISE EXCEPTION 'ConsentTerm content is immutable after publish' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_term_content_guard BEFORE UPDATE ON "ConsentTerm"
  FOR EACH ROW EXECUTE FUNCTION consent_term_content_immutable();
