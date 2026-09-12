import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AppLogger } from './common/logging/app-logger.service'
import { RequestContextMiddleware } from './common/request-context/request-context.middleware'

const port = Number(process.env.API_PORT ?? 3001)
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'

async function bootstrap() {
  const logger = new AppLogger()
  const app = await NestFactory.create(AppModule, { logger })

  const httpAdapter = app.getHttpAdapter()
  if (typeof httpAdapter.getInstance === 'function') {
    const instance = httpAdapter.getInstance() as { set?: (key: string, value: unknown) => void }
    instance.set?.('trust proxy', 1)
  }

  // Bind ALS at the Express layer before Nest routing (critical for async guards/handlers).
  app.use(new RequestContextMiddleware().use.bind(new RequestContextMiddleware()))

  app.use(helmet())
  app.enableCors({ origin: webOrigin, methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'] })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))

  await app.listen(port, '0.0.0.0')
}

void bootstrap()
