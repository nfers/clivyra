import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { assertAuthBootConfig } from '@clivyra/config'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AppLogger } from './common/logging/app-logger.service'
import { RequestContextMiddleware } from './common/request-context/request-context.middleware'

const port = Number(process.env.API_PORT ?? 3001)
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'

function assertSafeBootEnvironment(): void {
  if (process.env.NODE_ENV === 'test' && !process.env.JEST_WORKER_ID) {
    throw new Error('Refusing to listen when NODE_ENV=test outside Jest (missing JEST_WORKER_ID)')
  }
  assertAuthBootConfig()
}

async function bootstrap() {
  assertSafeBootEnvironment()

  const logger = new AppLogger()
  const app = await NestFactory.create(AppModule, { logger })

  const httpAdapter = app.getHttpAdapter()
  if (typeof httpAdapter.getInstance === 'function') {
    const instance = httpAdapter.getInstance() as { set?: (key: string, value: unknown) => void }
    instance.set?.('trust proxy', 1)
  }

  // Single RequestContext path: Express middleware before Nest routing (not Nest MiddlewareConsumer).
  app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()))

  app.use(helmet())
  app.enableCors({
    origin: webOrigin,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'],
    credentials: true,
  })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))

  await app.listen(port, '0.0.0.0')
}

void bootstrap()
