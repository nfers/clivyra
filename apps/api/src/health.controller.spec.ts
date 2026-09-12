import { ServiceUnavailableException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { HealthController } from './health.controller'
import { PrismaService } from './prisma/prisma.service'

describe('HealthController', () => {
  it('reports a healthy API without sensitive data', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn() },
        },
      ],
    }).compile()
    const response = module.get(HealthController).getHealth()

    expect(response.status).toBe('ok')
    expect(response.timestamp).toEqual(expect.any(String))
  })

  it('returns ready when SELECT 1 succeeds', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
        },
      ],
    }).compile()

    await expect(module.get(HealthController).getReady()).resolves.toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    })
  })

  it('returns 503 when database readiness fails', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')) },
        },
      ],
    }).compile()

    await expect(module.get(HealthController).getReady()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
  })
})
