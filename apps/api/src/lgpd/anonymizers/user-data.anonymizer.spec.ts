import { describe, expect, it } from '@jest/globals'
import { UserDataAnonymizer } from './user-data.anonymizer'

describe('UserDataAnonymizer', () => {
  it('returns RETAINED when any membership is active', async () => {
    const tx = {
      membership: {
        count: async () => 1,
      },
      user: { update: async () => undefined },
      refreshSession: { updateMany: async () => ({ count: 0 }) },
    }
    const prisma = {
      bypassTenant: async (_reason: string, fn: () => Promise<unknown>) => fn(),
    }
    const anonymizer = new UserDataAnonymizer(prisma as never)
    const result = await anonymizer.anonymize(
      { userId: 'a', tenantId: 't', membershipId: 'm', role: 'OWNER' },
      { subjectType: 'USER', subjectId: 'u1' },
      tx as never,
    )
    expect(result.strategy).toBe('RETAINED')
    expect(result.affected).toBe(0)
  })

  it('anonymizes user and revokes sessions when no active membership', async () => {
    const updates: unknown[] = []
    const tx = {
      membership: {
        count: async () => 0,
      },
      user: {
        update: async (args: unknown) => {
          updates.push(args)
        },
      },
      refreshSession: {
        updateMany: async (args: unknown) => {
          updates.push(args)
          return { count: 2 }
        },
      },
    }
    const prisma = {
      bypassTenant: async (_reason: string, fn: () => Promise<unknown>) => fn(),
    }
    const anonymizer = new UserDataAnonymizer(prisma as never)
    const result = await anonymizer.anonymize(
      { userId: 'a', tenantId: 't', membershipId: 'm', role: 'OWNER' },
      { subjectType: 'USER', subjectId: 'u1' },
      tx as never,
    )
    expect(result.strategy).toBe('ANONYMIZED')
    expect(result.affected).toBe(1)
    expect(JSON.stringify(updates)).toContain('Usuário removido')
    expect(JSON.stringify(updates)).not.toContain('AuditLog')
  })
})
