import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { createTenantScopedExtension } from './tenant-scoped.extension'

function createExtendedPrismaClient() {
  return new PrismaClient().$extends(createTenantScopedExtension())
}

export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>

const EXTENDED_KEYS = new Set(['onModuleInit', 'onModuleDestroy', 'then'])

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: ExtendedPrismaClient = createExtendedPrismaClient()

  constructor() {
    // Expose the extended Prisma client (incl. bypassTenant) as this service.
    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (EXTENDED_KEYS.has(String(property)) || property in target) {
          return Reflect.get(target, property, receiver)
        }
        const value = Reflect.get(target.client as object, property)
        return typeof value === 'function' ? value.bind(target.client) : value
      },
    }) as PrismaService
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect()
  }
}

export interface PrismaService extends ExtendedPrismaClient {}
