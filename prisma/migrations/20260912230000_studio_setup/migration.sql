-- CLI-16: studio setup (TenantSettings, Professional, Service, Room, WorkingHours)

CREATE TYPE "ProfessionalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "CouncilType" AS ENUM ('CREFITO', 'CREF', 'CRM', 'CRN', 'CRP', 'OTHER');

CREATE TABLE "TenantSettings" (
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "legalName" TEXT,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "logoStorageKey" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("tenantId")
);

CREATE TABLE "Professional" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT,
    "displayName" TEXT NOT NULL,
    "fullName" TEXT,
    "councilType" "CouncilType",
    "councilNumber" TEXT,
    "councilState" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT,
    "phone" TEXT,
    "color" TEXT,
    "signatureStorageKey" TEXT,
    "status" "ProfessionalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfessionalService" (
    "tenantId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalService_pkey" PRIMARY KEY ("professionalId","serviceId")
);

CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professionalId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Professional_membershipId_key" ON "Professional"("membershipId");
CREATE INDEX "Professional_tenantId_status_idx" ON "Professional"("tenantId", "status");
CREATE INDEX "Professional_tenantId_displayName_idx" ON "Professional"("tenantId", "displayName");
CREATE UNIQUE INDEX "Professional_tenant_council_partial_key"
  ON "Professional" ("tenantId", "councilType", "councilNumber")
  WHERE "councilNumber" IS NOT NULL;

CREATE UNIQUE INDEX "Service_tenantId_name_key" ON "Service"("tenantId", "name");
CREATE INDEX "Service_tenantId_isActive_idx" ON "Service"("tenantId", "isActive");
CREATE UNIQUE INDEX "Service_tenantId_lower_name_key" ON "Service" ("tenantId", lower("name"));

CREATE INDEX "ProfessionalService_tenantId_serviceId_idx" ON "ProfessionalService"("tenantId", "serviceId");

CREATE UNIQUE INDEX "Room_tenantId_name_key" ON "Room"("tenantId", "name");
CREATE INDEX "Room_tenantId_isActive_idx" ON "Room"("tenantId", "isActive");
CREATE UNIQUE INDEX "Room_tenantId_lower_name_key" ON "Room" ("tenantId", lower("name"));

CREATE INDEX "WorkingHours_tenantId_professionalId_weekday_idx" ON "WorkingHours"("tenantId", "professionalId", "weekday");

ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill TenantSettings for existing tenants
INSERT INTO "TenantSettings" ("tenantId", "displayName", "timezone", "createdAt", "updatedAt")
SELECT "id", "name", 'America/Sao_Paulo', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant"
ON CONFLICT ("tenantId") DO NOTHING;
