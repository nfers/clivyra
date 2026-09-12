import { Module, OnModuleInit } from '@nestjs/common'
import { ConsentModule } from '../consent/consent.module'
import { PrismaModule } from '../prisma/prisma.module'
import { UserDataAnonymizer } from './anonymizers/user-data.anonymizer'
import { DataSubjectRequestService } from './data-subject-request.service'
import { UserDataExporter } from './exporters/user-data.exporter'
import { LgpdController } from './lgpd.controller'
import { LgpdRegistry } from './lgpd.registry'

@Module({
  imports: [PrismaModule, ConsentModule],
  controllers: [LgpdController],
  providers: [
    LgpdRegistry,
    UserDataExporter,
    UserDataAnonymizer,
    DataSubjectRequestService,
  ],
  exports: [LgpdRegistry, DataSubjectRequestService],
})
export class LgpdModule implements OnModuleInit {
  constructor(private readonly requests: DataSubjectRequestService) {}

  onModuleInit(): void {
    this.requests.registerBuiltins()
  }
}
