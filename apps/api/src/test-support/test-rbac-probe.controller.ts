import { Controller, Get } from '@nestjs/common'
import { RequirePermissions } from '../rbac/permissions.decorator'

/**
 * Test-only probe routes for RBAC matrix integration tests.
 * Registered only when NODE_ENV=test.
 */
@Controller('__test__/rbac')
export class TestRbacProbeController {
  @Get('finance')
  @RequirePermissions('finance:read')
  finance() {
    return { ok: true, module: 'finance' }
  }

  @Get('clinical-record')
  @RequirePermissions('clinical-record:read')
  clinical() {
    return { ok: true, module: 'clinical-record' }
  }

  @Get('settings')
  @RequirePermissions('settings:write')
  settings() {
    return { ok: true, module: 'settings' }
  }

  @Get('users')
  @RequirePermissions('users:read')
  users() {
    return { ok: true, module: 'users' }
  }
}
