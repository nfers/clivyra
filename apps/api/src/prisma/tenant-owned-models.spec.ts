import { Prisma } from '@prisma/client'
import { GLOBAL_MODELS, TENANT_OWNED_MODELS } from './tenant-owned-models'

describe('tenant-owned-models', () => {
  it('classifies every Prisma DMMF model as global or tenant-owned', () => {
    const models = Prisma.dmmf.datamodel.models.map((model) => model.name)
    const classified = new Set<string>([...GLOBAL_MODELS, ...TENANT_OWNED_MODELS])

    for (const model of models) {
      expect(classified.has(model)).toBe(true)
    }

    for (const name of classified) {
      expect(models).toContain(name)
    }
  })
})
