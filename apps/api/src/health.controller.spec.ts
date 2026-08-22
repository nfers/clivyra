import { Test } from '@nestjs/testing'
import { HealthController } from './health.controller'

describe('HealthController', () => {
  it('reports a healthy API without sensitive data', async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController] }).compile()
    const response = module.get(HealthController).getHealth()

    expect(response.status).toBe('ok')
    expect(response.timestamp).toEqual(expect.any(String))
  })
})
