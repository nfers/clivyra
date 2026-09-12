import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../../../src/app.module'

export async function createTestApp(): Promise<INestApplication> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('createTestApp requires NODE_ENV=test')
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication()
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  await app.init()
  return app
}
