import { PrismaClient } from '@prisma/client'
import type { TenantContext } from '@clivyra/types'
import { TenantContextStorage } from '../tenant/tenant-context.storage'
import { createTenantScopedExtension } from './tenant-scoped.extension'
import { TenantContextMissingError, TenantScopeViolationError } from './tenant-scope.errors'

const tenantA: TenantContext = {
  userId: 'user-a',
  tenantId: 'tenant-a',
  membershipId: 'membership-a',
  role: 'OWNER',
}

describe('tenantScoped extension', () => {
  const prisma = new PrismaClient().$extends(createTenantScopedExtension())

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('throws TenantContextMissingError without ALS context on tenant-owned models', async () => {
    await expect(prisma.membership.findMany()).rejects.toBeInstanceOf(TenantContextMissingError)
  })

  it('throws TenantScopeViolationError when create data tenantId diverges', async () => {
    await TenantContextStorage.run(tenantA, async () => {
      await expect(
        prisma.membership.create({
          data: {
            tenantId: 'tenant-b',
            userId: 'user-x',
            role: 'OWNER',
          },
        }),
      ).rejects.toBeInstanceOf(TenantScopeViolationError)
    })
  })

  it('throws TenantScopeViolationError when update data tenantId diverges', async () => {
    await TenantContextStorage.run(tenantA, async () => {
      await expect(
        prisma.membership.update({
          where: { id: 'membership-1' },
          data: { tenantId: 'tenant-b', role: 'ADMIN' },
        }),
      ).rejects.toBeInstanceOf(TenantScopeViolationError)
    })
  })

  it('throws TenantScopeViolationError when updateMany data tenantId diverges', async () => {
    await TenantContextStorage.run(tenantA, async () => {
      await expect(
        prisma.membership.updateMany({
          where: { id: 'membership-1' },
          data: { tenantId: 'tenant-b' },
        }),
      ).rejects.toBeInstanceOf(TenantScopeViolationError)
    })
  })

  it('throws TenantScopeViolationError when upsert update tenantId diverges', async () => {
    await TenantContextStorage.run(tenantA, async () => {
      await expect(
        prisma.membership.upsert({
          where: { id: 'membership-1' },
          create: { tenantId: 'tenant-a', userId: 'user-x', role: 'OWNER' },
          update: { tenantId: 'tenant-b' },
        }),
      ).rejects.toBeInstanceOf(TenantScopeViolationError)
    })
  })

  it('allows bypassTenant without requiring tenant ALS', async () => {
    await expect(prisma.bypassTenant('unit-test', async () => 'ok')).resolves.toBe('ok')
  })

  it('does not require tenant context for global models (never TenantContextMissingError)', async () => {
    try {
      await prisma.systemMetadata.findMany({ take: 1 })
    } catch (error) {
      expect(error).not.toBeInstanceOf(TenantContextMissingError)
    }
  })

  it('does not mix tenant context across concurrent ALS runs', async () => {
    const seen: string[] = []

    await Promise.all([
      TenantContextStorage.run({ ...tenantA, tenantId: 'tenant-a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        seen.push(TenantContextStorage.require().tenantId)
      }),
      TenantContextStorage.run({ ...tenantA, tenantId: 'tenant-b' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        seen.push(TenantContextStorage.require().tenantId)
      }),
    ])

    expect(seen.sort()).toEqual(['tenant-a', 'tenant-b'])
  })
})
