import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import helmet from 'helmet'
import { AppModule } from './app.module'

const port = Number(process.env.API_PORT ?? 3001)
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] })

  app.use(helmet())
  app.enableCors({ origin: webOrigin, methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'] })
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))

  await app.listen(port, '0.0.0.0')
}

void bootstrap()
