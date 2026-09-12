import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.systemMetadata.upsert({
    where: { key: 'bootstrap.version' },
    create: { key: 'bootstrap.version', value: '0.1.0' },
    update: { value: '0.1.0' },
  })

  const seedTenantSlug = process.env.SEED_TENANT_SLUG ?? 'clivyra-demo'
  const seedTenantName = process.env.SEED_TENANT_NAME ?? 'Clivyra Demo'
  const seedAdminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@clivyra.local').trim().toLowerCase()
  const seedAdminName = process.env.SEED_ADMIN_NAME ?? 'Clivyra Admin'
  const seedAdminPasswordHash = process.env.SEED_ADMIN_PASSWORD_HASH

  const tenant = await prisma.tenant.upsert({
    where: { slug: seedTenantSlug },
    create: { slug: seedTenantSlug, name: seedTenantName },
    update: { name: seedTenantName, isActive: true },
  })

  const admin = await prisma.user.upsert({
    where: { email: seedAdminEmail },
    create: {
      email: seedAdminEmail,
      name: seedAdminName,
      passwordHash: seedAdminPasswordHash,
    },
    update: {
      name: seedAdminName,
      ...(seedAdminPasswordHash ? { passwordHash: seedAdminPasswordHash } : {}),
      isActive: true,
    },
  })

  await prisma.membership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: admin.id,
      },
    },
    create: {
      tenantId: tenant.id,
      userId: admin.id,
      role: 'OWNER',
    },
    update: {
      role: 'OWNER',
      isActive: true,
    },
  })
}

void main()
  .catch(() => {
    console.error('Database seed failed')
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
