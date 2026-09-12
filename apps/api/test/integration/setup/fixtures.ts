import { PrismaClient } from '@prisma/client'
import { PasswordHasherService } from '../../../src/auth/password-hasher.service'

export interface IntegrationFixtures {
  studioA: { id: string; slug: string; name: string }
  studioB: { id: string; slug: string; name: string }
  ownerA: { id: string; email: string; membershipId: string; password: string }
  proA: { id: string; email: string; membershipId: string; password: string }
  ownerB: { id: string; email: string; membershipId: string; password: string }
  multiOwner: { id: string; email: string; password: string; membershipAId: string; membershipBId: string }
}

const prisma = new PrismaClient()
const hasher = PasswordHasherService.forTest(
  process.env.AUTH_PASSWORD_PEPPER ?? 'local-development-password-pepper-change-me',
)

export const FIXTURE_PASSWORD = 'CorrectHorse1Battery!'

export async function resetFixtures(): Promise<IntegrationFixtures> {
  await prisma.refreshSession.deleteMany()
  await prisma.passwordResetToken.deleteMany()
  await prisma.invitation.deleteMany()
  await prisma.membership.deleteMany()
  await prisma.user.deleteMany()
  await prisma.tenant.deleteMany()

  const passwordHash = await hasher.hash(FIXTURE_PASSWORD)

  const studioA = await prisma.tenant.create({
    data: { slug: 'studio-a', name: 'Studio A' },
  })
  const studioB = await prisma.tenant.create({
    data: { slug: 'studio-b', name: 'Studio B' },
  })

  const ownerAUser = await prisma.user.create({
    data: { email: 'owner@a.test', name: 'Owner A', passwordHash },
  })
  const proAUser = await prisma.user.create({
    data: { email: 'pro@a.test', name: 'Pro A', passwordHash },
  })
  const ownerBUser = await prisma.user.create({
    data: { email: 'owner@b.test', name: 'Owner B', passwordHash },
  })
  const multiUser = await prisma.user.create({
    data: { email: 'multi@studios.test', name: 'Multi Owner', passwordHash },
  })

  const ownerAMembership = await prisma.membership.create({
    data: { tenantId: studioA.id, userId: ownerAUser.id, role: 'OWNER' },
  })
  const proAMembership = await prisma.membership.create({
    data: { tenantId: studioA.id, userId: proAUser.id, role: 'PROFESSIONAL' },
  })
  const ownerBMembership = await prisma.membership.create({
    data: { tenantId: studioB.id, userId: ownerBUser.id, role: 'OWNER' },
  })
  const multiA = await prisma.membership.create({
    data: { tenantId: studioA.id, userId: multiUser.id, role: 'OWNER' },
  })
  const multiB = await prisma.membership.create({
    data: { tenantId: studioB.id, userId: multiUser.id, role: 'ADMIN' },
  })

  return {
    studioA: { id: studioA.id, slug: studioA.slug, name: studioA.name },
    studioB: { id: studioB.id, slug: studioB.slug, name: studioB.name },
    ownerA: {
      id: ownerAUser.id,
      email: ownerAUser.email,
      membershipId: ownerAMembership.id,
      password: FIXTURE_PASSWORD,
    },
    proA: {
      id: proAUser.id,
      email: proAUser.email,
      membershipId: proAMembership.id,
      password: FIXTURE_PASSWORD,
    },
    ownerB: {
      id: ownerBUser.id,
      email: ownerBUser.email,
      membershipId: ownerBMembership.id,
      password: FIXTURE_PASSWORD,
    },
    multiOwner: {
      id: multiUser.id,
      email: multiUser.email,
      password: FIXTURE_PASSWORD,
      membershipAId: multiA.id,
      membershipBId: multiB.id,
    },
  }
}

export async function disconnectFixtures(): Promise<void> {
  await prisma.$disconnect()
}
