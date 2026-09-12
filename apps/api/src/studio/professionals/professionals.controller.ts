import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import type { TenantContext } from '@clivyra/types'
import { RequirePermissions } from '../../rbac/permissions.decorator'
import { CurrentTenant } from '../../tenant/tenant-context.decorator'
import {
  CreateProfessionalDto,
  LinkMembershipDto,
  ListProfessionalsQueryDto,
  PatchProfessionalDto,
  PatchProfessionalMeDto,
} from '../dto/studio.dto'
import { ProfessionalsService } from './professionals.service'

const signatureUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 },
})

@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Get()
  @RequirePermissions('professionals:read')
  list(@CurrentTenant() ctx: TenantContext, @Query() query: ListProfessionalsQueryDto) {
    return this.professionals.list(ctx, query)
  }

  @Get('me')
  @RequirePermissions('professionals:self')
  me(@CurrentTenant() ctx: TenantContext) {
    return this.professionals.getMe(ctx)
  }

  @Patch('me')
  @RequirePermissions('professionals:self')
  patchMe(@CurrentTenant() ctx: TenantContext, @Body() dto: PatchProfessionalMeDto) {
    return this.professionals.patchMe(ctx, dto)
  }

  @Post('me/signature')
  @RequirePermissions('professionals:self')
  @UseInterceptors(signatureUpload)
  uploadMySignature(
    @CurrentTenant() ctx: TenantContext,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    return this.professionals.uploadSignature(ctx, 'me', file)
  }

  @Get('me/signature')
  @RequirePermissions('professionals:self')
  getMySignature(@CurrentTenant() ctx: TenantContext) {
    return this.professionals.getSignatureUrl(ctx, 'me')
  }

  @Delete('me/signature')
  @RequirePermissions('professionals:self')
  deleteMySignature(@CurrentTenant() ctx: TenantContext) {
    return this.professionals.deleteSignature(ctx, 'me')
  }

  @Get(':id')
  @RequirePermissions('professionals:read')
  get(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.professionals.getById(ctx, id)
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('professionals:write')
  create(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateProfessionalDto) {
    return this.professionals.create(ctx, dto)
  }

  @Patch(':id')
  @RequirePermissions('professionals:write')
  patch(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: PatchProfessionalDto,
  ) {
    return this.professionals.patch(ctx, id, dto)
  }

  @Post(':id/link-membership')
  @RequirePermissions('professionals:write')
  link(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body() dto: LinkMembershipDto,
  ) {
    return this.professionals.linkMembership(ctx, id, dto)
  }

  @Post(':id/unlink-membership')
  @RequirePermissions('professionals:write')
  unlink(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.professionals.unlinkMembership(ctx, id)
  }

  @Post(':id/deactivate')
  @RequirePermissions('professionals:write')
  deactivate(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.professionals.deactivate(ctx, id)
  }

  @Post(':id/activate')
  @RequirePermissions('professionals:write')
  activate(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.professionals.activate(ctx, id)
  }

  @Post(':id/signature')
  @RequirePermissions('professionals:write')
  @UseInterceptors(signatureUpload)
  uploadSignature(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    return this.professionals.uploadSignature(ctx, id, file)
  }

  @Get(':id/signature')
  @RequirePermissions('professionals:read')
  getSignature(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.professionals.getSignatureUrl(ctx, id)
  }

  @Delete(':id/signature')
  @RequirePermissions('professionals:write')
  deleteSignature(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.professionals.deleteSignature(ctx, id)
  }
}
