/**
 * Idempotent E2E fixtures for Sprint 1 domain Playwright suites.
 * Synthetic data only — never real PII/clinical content.
 *
 * Run: npx ts-node --transpile-only -P apps/api/tsconfig.json scripts/e2e/seed.ts
 */
import { PrismaClient, type MembershipRole } from '@prisma/client'
import { PasswordHasherService } from '../../apps/api/src/auth/password-hasher.service'

const prisma = new PrismaClient()

const PEPPER =
  process.env.AUTH_PASSWORD_PEPPER ?? 'local-development-password-pepper-change-me'
const PASSWORD = process.env.E2E_PASSWORD ?? 'E2eCorrectHorse1!'

const TENANT_A_SLUG = process.env.E2E_TENANT_SLUG ?? 'studio-a'
const TENANT_B_SLUG = process.env.E2E_TENANT_B_SLUG ?? 'studio-b'

type RoleUser = {
  email: string
  name: string
  role: MembershipRole
}

const TENANT_A_USERS: RoleUser[] = [
  {
    email: process.env.E2E_OWNER_EMAIL ?? 'owner@studio-a.test',
    name: 'E2E Owner A',
    role: 'OWNER',
  },
  {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@studio-a.test',
    name: 'E2E Admin A',
    role: 'ADMIN',
  },
  {
    email: process.env.E2E_PROFESSIONAL_EMAIL ?? 'pro@studio-a.test',
    name: 'E2E Professional A',
    role: 'PROFESSIONAL',
  },
  {
    email: process.env.E2E_RECEPTION_EMAIL ?? 'reception@studio-a.test',
    name: 'E2E Reception A',
    role: 'RECEPTION',
  },
]

async function upsertTenant(slug: string, name: string, completeOnboarding: boolean) {
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    create: { slug, name, isActive: true },
    update: { name, isActive: true },
  })

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      displayName: name,
      legalName: completeOnboarding ? `${name} LTDA` : null,
      documentType: completeOnboarding ? 'CNPJ' : null,
      documentNumber: completeOnboarding ? '11222333000181' : null,
      timezone: 'America/Sao_Paulo',
      onboardingCompletedAt: completeOnboarding ? new Date() : null,
    },
    update: {
      displayName: name,
      ...(completeOnboarding
        ? {
            legalName: `${name} LTDA`,
            documentType: 'CNPJ',
            documentNumber: '11222333000181',
            onboardingCompletedAt: new Date(),
          }
        : {}),
    },
  })

  return tenant
}

async function upsertMembershipUser(
  tenantId: string,
  user: RoleUser,
  passwordHash: string,
) {
  const email = user.email.trim().toLowerCase()
  const dbUser = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: user.name,
      passwordHash,
      isActive: true,
    },
    update: {
      name: user.name,
      passwordHash,
      isActive: true,
    },
  })

  const membership = await prisma.membership.upsert({
    where: {
      tenantId_userId: { tenantId, userId: dbUser.id },
    },
    create: {
      tenantId,
      userId: dbUser.id,
      role: user.role,
      isActive: true,
    },
    update: {
      role: user.role,
      isActive: true,
    },
  })

  if (user.role === 'PROFESSIONAL') {
    await prisma.professional.upsert({
      where: { membershipId: membership.id },
      create: {
        tenantId,
        membershipId: membership.id,
        displayName: user.name,
        status: 'ACTIVE',
        councilType: 'CREFITO',
        councilNumber: '12345',
        councilState: 'SP',
        phone: '11999990000',
      },
      update: {
        displayName: user.name,
        status: 'ACTIVE',
        councilType: 'CREFITO',
        councilNumber: '12345',
        councilState: 'SP',
        phone: '11999990000',
      },
    })
  }

  return { dbUser, membership }
}

async function main() {
  const hasher = PasswordHasherService.forTest(PEPPER)
  const passwordHash = await hasher.hash(PASSWORD)

  const studioA = await upsertTenant(TENANT_A_SLUG, 'Studio A E2E', true)
  await upsertTenant(TENANT_B_SLUG, 'Studio B E2E', true)

  for (const user of TENANT_A_USERS) {
    await upsertMembershipUser(studioA.id, user, passwordHash)
  }

  const studioB = await prisma.tenant.findUniqueOrThrow({ where: { slug: TENANT_B_SLUG } })
  await upsertMembershipUser(
    studioB.id,
    {
      email: process.env.E2E_OWNER_B_EMAIL ?? 'owner@studio-b.test',
      name: 'E2E Owner B',
      role: 'OWNER',
    },
    passwordHash,
  )

  await prisma.service.upsert({
    where: { tenantId_name: { tenantId: studioA.id, name: 'Pilates Solo' } },
    create: {
      tenantId: studioA.id,
      name: 'Pilates Solo',
      durationMinutes: 50,
      isActive: true,
    },
    update: { durationMinutes: 50, isActive: true },
  })

  await prisma.room.upsert({
    where: { tenantId_name: { tenantId: studioA.id, name: 'Sala 1' } },
    create: {
      tenantId: studioA.id,
      name: 'Sala 1',
      capacity: 4,
      isActive: true,
    },
    update: { capacity: 4, isActive: true },
  })

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        password: PASSWORD,
        tenants: [TENANT_A_SLUG, TENANT_B_SLUG],
        users: TENANT_A_USERS.map((u) => ({ email: u.email, role: u.role })),
      },
      null,
      2,
    ),
  )
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
