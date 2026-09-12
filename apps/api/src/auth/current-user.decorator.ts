import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '@clivyra/types'
import type { RequestWithAuth } from './auth.types'

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<RequestWithAuth>()
    if (!request.user) {
      throw new Error('CurrentUser requires an authenticated request')
    }
    return request.user
  },
)
