import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { ConsentController } from './consent.controller'
import { ConsentService } from './consent.service'
import { ConsentTermService } from './consent-term.service'
import { SubjectResolverPort, UserSubjectResolver } from './subject-resolver.port'

@Module({
  imports: [PrismaModule],
  controllers: [ConsentController],
  providers: [
    ConsentTermService,
    ConsentService,
    UserSubjectResolver,
    { provide: SubjectResolverPort, useExisting: UserSubjectResolver },
  ],
  exports: [ConsentService, ConsentTermService, SubjectResolverPort],
})
export class ConsentModule {}
