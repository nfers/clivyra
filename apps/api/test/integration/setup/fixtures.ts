import { PrismaClient } from '@prisma/client'

export interface IntegrationFixtures {
  studioA: { id: string; slug: string }
  studioB: { id: string; slug: string }
  ownerA: { id: string; email: string; membershipId: string }
  proA: { id: string; email: string; membershipId: string }
  ownerB: { id: string; email: string; membershipId: string }
}

const prisma = new PrismaClient()

export async function resetFixtures(): Promise<IntegrationFixtures> {
  await prisma.membership.deleteMany()
  await prisma.user.deleteMany()
  await prisma.tenant.deleteMany()

  const studioA = await prisma.tenant.create({
    data: { slug: 'studio-a', name: 'Studio A' },
  })
  const studioB = await prisma.tenant.create({
    data: { slug: 'studio-b', name: 'Studio B' },
  })

  const ownerAUser = await prisma.user.create({
    data: { email: 'owner@a.test', name: 'Owner A' },
  })
  const proAUser = await prisma.user.create({
    data: { email: 'pro@a.test', name: 'Pro A' },
  })
  const ownerBUser = await prisma.user.create({
    data: { email: 'owner@b.test', name: 'Owner B' },
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

  return {
    studioA: { id: studioA.id, slug: studioA.slug },
    studioB: { id: studioB.id, slug: studioB.slug },
    ownerA: { id: ownerAUser.id, email: ownerAUser.email, membershipId: ownerAMembership.id },
    proA: { id: proAUser.id, email: proAUser.email, membershipId: proAMembership.id },
    ownerB: { id: ownerBUser.id, email: ownerBUser.email, membershipId: ownerBMembership.id },
  }
}

export async function disconnectFixtures(): Promise<void> {
  await prisma.$disconnect()
}
