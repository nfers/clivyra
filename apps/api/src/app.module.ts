import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { HealthController } from './health.controller'

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
  ],
  controllers: [HealthController],
})
export class AppModule {}
