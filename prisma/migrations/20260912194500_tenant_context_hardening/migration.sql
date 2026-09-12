-- CLI-11 hardening: Restrict tenant deletes; unique order tenant-first.

ALTER TABLE "Membership" DROP CONSTRAINT "Membership_tenantId_fkey";

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "Membership_userId_tenantId_key";

CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");
