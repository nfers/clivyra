import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.systemMetadata.upsert({
    where: { key: 'bootstrap.version' },
    create: { key: 'bootstrap.version', value: '0.1.0' },
    update: { value: '0.1.0' },
  })

  const seedTenantSlug = process.env.SEED_TENANT_SLUG ?? 'studio-vega'
  const seedTenantName = process.env.SEED_TENANT_NAME ?? 'Studio Vega'
  const seedAdminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'owner@studio-vega.test').trim().toLowerCase()
  const seedAdminName = process.env.SEED_ADMIN_NAME ?? 'Owner Vega'
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

  const membership = await prisma.membership.upsert({
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

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      displayName: seedTenantName,
      timezone: 'America/Sao_Paulo',
      phone: '11999990000',
    },
    update: {
      displayName: seedTenantName,
    },
  })

  const professional = await prisma.professional.upsert({
    where: { membershipId: membership.id },
    create: {
      tenantId: tenant.id,
      membershipId: membership.id,
      displayName: seedAdminName,
      fullName: seedAdminName,
      councilType: 'CREFITO',
      councilNumber: '000000F',
      councilState: 'SP',
      specialties: ['Pilates clínico', 'Ortopedia'],
      status: 'ACTIVE',
    },
    update: {
      displayName: seedAdminName,
      status: 'ACTIVE',
    },
  })

  const physio = await prisma.service.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Fisioterapia' } },
    create: {
      tenantId: tenant.id,
      name: 'Fisioterapia',
      durationMinutes: 50,
      category: 'fisioterapia',
    },
    update: { isActive: true },
  })

  await prisma.service.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Pilates' } },
    create: {
      tenantId: tenant.id,
      name: 'Pilates',
      durationMinutes: 60,
      category: 'pilates',
    },
    update: { isActive: true },
  })

  await prisma.professionalService.upsert({
    where: {
      professionalId_serviceId: {
        professionalId: professional.id,
        serviceId: physio.id,
      },
    },
    create: {
      tenantId: tenant.id,
      professionalId: professional.id,
      serviceId: physio.id,
    },
    update: {},
  })

  await prisma.room.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Sala 1' } },
    create: {
      tenantId: tenant.id,
      name: 'Sala 1',
      capacity: 4,
    },
    update: { isActive: true },
  })

  const existingHours = await prisma.workingHours.count({
    where: { tenantId: tenant.id, professionalId: null },
  })
  if (existingHours === 0) {
    const weekdays = [1, 2, 3, 4, 5]
    await prisma.workingHours.createMany({
      data: weekdays.map((weekday) => ({
        tenantId: tenant.id,
        weekday,
        startTime: '08:00',
        endTime: '18:00',
      })),
    })
  }
}

void main()
  .catch(() => {
    console.error('Database seed failed')
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
