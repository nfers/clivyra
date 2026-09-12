import { ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../../../src/app.module'
import { RequestContextMiddleware } from '../../../src/common/request-context/request-context.middleware'

export async function createTestApp() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('createTestApp requires NODE_ENV=test')
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication()
  app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()))
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  await app.init()
  return app
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>
