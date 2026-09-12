import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { TenantContext } from '@clivyra/types'
import { RequirePermissions } from '../../rbac/permissions.decorator'
import { CurrentTenant } from '../../tenant/tenant-context.decorator'
import { validateImageUpload } from '../../storage/upload.validation'
import { FILE_STORAGE_PORT, type FileStoragePort, tenantStorageKey } from '../../storage/file-storage.port'
import { PatchTenantSettingsDto } from '../dto/studio.dto'
import { OnboardingService } from '../onboarding/onboarding.service'
import { TenantSettingsService } from './tenant-settings.service'

const logoUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 512 * 1024 },
})

@Controller('tenant')
export class TenantSettingsController {
  constructor(
    private readonly settings: TenantSettingsService,
    private readonly onboarding: OnboardingService,
    @Inject(FILE_STORAGE_PORT) private readonly storage: FileStoragePort,
  ) {}

  @Get('settings')
  @RequirePermissions('settings:read')
  get(@CurrentTenant() ctx: TenantContext) {
    return this.settings.get(ctx)
  }

  @Patch('settings')
  @RequirePermissions('settings:write')
  patch(@CurrentTenant() ctx: TenantContext, @Body() dto: PatchTenantSettingsDto) {
    return this.settings.patch(ctx, dto)
  }

  @Post('settings/logo')
  @RequirePermissions('settings:write')
  @UseInterceptors(logoUpload)
  async logo(
    @CurrentTenant() ctx: TenantContext,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file?.buffer) {
      return this.settings.get(ctx)
    }
    const validated = validateImageUpload(file.buffer, 'logo', file.originalname)
    const key = tenantStorageKey(ctx.tenantId, 'logo', `logo.${validated.extension}`)
    await this.storage.put({
      key,
      body: file.buffer,
      contentType: validated.contentType,
      tenantId: ctx.tenantId,
    })
    return this.settings.setLogoKey(ctx, key)
  }

  @Get('onboarding')
  @RequirePermissions('settings:read')
  onboardingStatus(@CurrentTenant() ctx: TenantContext) {
    return this.onboarding.status(ctx)
  }

  @Post('onboarding/complete')
  @RequirePermissions('settings:write')
  completeOnboarding(@CurrentTenant() ctx: TenantContext) {
    return this.onboarding.complete(ctx)
  }
}
