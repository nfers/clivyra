import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common'
import { PrismaService } from './prisma/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth() {
    return { status: 'ok' as const, timestamp: new Date().toISOString() }
  }

  @Get('ready')
  async getReady() {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('database readiness timeout')), 2_000)
    })

    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout])
      return { status: 'ok' as const, timestamp: new Date().toISOString() }
    } catch {
      throw new ServiceUnavailableException('Database is not ready')
    }
  }
}
