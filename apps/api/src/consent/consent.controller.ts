import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import type { AuthenticatedPrincipal, TenantContext } from '@clivyra/types'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../rbac/permissions.decorator'
import { CurrentTenant } from '../tenant/tenant-context.decorator'
import { ConsentService } from './consent.service'
import { ConsentTermService } from './consent-term.service'
import {
  ConsentStatusQueryDto,
  CreateConsentTermDto,
  GrantConsentDto,
  ListConsentTermsQueryDto,
  ListConsentsQueryDto,
  PublishConsentTermDto,
  RevokeConsentDto,
  UpdateConsentTermDto,
} from './dto/consent.dto'

@Controller()
export class ConsentController {
  constructor(
    private readonly terms: ConsentTermService,
    private readonly consents: ConsentService,
  ) {}

  @Get('consent-terms')
  @RequirePermissions('consent:read')
  listTerms(@Query() query: ListConsentTermsQueryDto) {
    return this.terms.list({ type: query.type, status: query.status })
  }

  @Post('consent-terms')
  @HttpCode(201)
  @RequirePermissions('settings:write')
  createTerm(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: CreateConsentTermDto,
  ) {
    return this.terms.createDraft(ctx, dto, user.userId)
  }

  @Patch('consent-terms/:id')
  @RequirePermissions('settings:write')
  updateTerm(@Param('id') id: string, @Body() dto: UpdateConsentTermDto) {
    return this.terms.updateDraft(id, dto)
  }

  @Post('consent-terms/:id/publish')
  @HttpCode(200)
  @RequirePermissions('settings:write')
  publishTerm(@Param('id') id: string, @Body() dto: PublishConsentTermDto) {
    return this.terms.publish(id, { requiresReconsent: dto.requiresReconsent })
  }

  @Post('consent-terms/:id/retire')
  @HttpCode(200)
  @RequirePermissions('settings:write')
  retireTerm(@Param('id') id: string) {
    return this.terms.retire(id)
  }

  @Get('consent-terms/:id/content')
  @RequirePermissions('consent:read')
  termContent(@Param('id') id: string) {
    return this.terms.getContent(id)
  }

  @Get('consents/status')
  @RequirePermissions('consent:read')
  status(@Query() query: ConsentStatusQueryDto) {
    return this.consents.status(query.subjectType, query.subjectId)
  }

  @Get('consents')
  @RequirePermissions('consent:read')
  listConsents(@Query() query: ListConsentsQueryDto) {
    return this.consents.listHistory(query.subjectType, query.subjectId)
  }

  @Post('consents')
  @HttpCode(201)
  @RequirePermissions('consent:write')
  grant(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: GrantConsentDto,
  ) {
    return this.consents.grant(ctx, dto, user.userId)
  }

  @Post('consents/:id/revoke')
  @HttpCode(201)
  @RequirePermissions('consent:write')
  revoke(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() dto: RevokeConsentDto,
  ) {
    return this.consents.revoke(id, user.userId, dto.reason)
  }
}
