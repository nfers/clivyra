import { Global, Module } from '@nestjs/common'
import { AuthorizationService } from './authorization.service'
import { RbacGuard } from './rbac.guard'

@Global()
@Module({
  providers: [RbacGuard, AuthorizationService],
  exports: [RbacGuard, AuthorizationService],
})
export class RbacModule {}
