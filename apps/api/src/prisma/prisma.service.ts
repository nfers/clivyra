import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { createTenantScopedExtension } from './tenant-scoped.extension'

function createExtendedPrismaClient() {
  return new PrismaClient().$extends(createTenantScopedExtension())
}

export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>

const PrismaClientHost = class {
  constructor() {
    return createExtendedPrismaClient()
  }
} as unknown as new () => ExtendedPrismaClient

@Injectable()
export class PrismaService extends PrismaClientHost implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
