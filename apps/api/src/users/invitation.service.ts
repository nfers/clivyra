import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { AuthSessionResponse, Role, TenantContext } from '@clivyra/types'
import type { InvitationStatus, MembershipRole } from '@prisma/client'
import { AUTH_EVENTS_PORT, type AuthEventsPort } from '../auth/auth-events.port'
import { AuthService } from '../auth/auth.service'
import { AuthTokenService } from '../auth/auth-token.service'
import type { RequestWithAuth } from '../auth/auth.types'
import { isPasswordStrong, normalizeEmail } from '../auth/password-policy'
import { PasswordHasherService } from '../auth/password-hasher.service'
import { MAILER_PORT, type MailerPort } from '../mailer/mailer.port'
import { buildInvitationEmail, maskEmail } from '../mailer/templates/invitation'
import { PrismaService } from '../prisma/prisma.service'
import { MembershipPolicy } from './membership.policy'

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
    private readonly hasher: PasswordHasherService,
    private readonly auth: AuthService,
    private readonly policy: MembershipPolicy,
    @Inject(MAILER_PORT) private readonly mailer: MailerPort,
    @Inject(AUTH_EVENTS_PORT) private readonly events: AuthEventsPort,
  ) {}

  list(status?: InvitationStatus) {
    return this.prisma.invitation.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        invitedByUserId: true,
      },
    }).then(async (rows) => {
      const inviterIds = [...new Set(rows.map((row) => row.invitedByUserId))]
      const inviters = inviterIds.length
        ? await this.prisma.bypassTenant('invitation-inviters', () =>
            this.prisma.user.findMany({
              where: { id: { in: inviterIds } },
              select: { id: true, name: true },
            }),
          )
        : []
      const byId = new Map(inviters.map((user) => [user.id, user.name]))
      return rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role as Role,
        status: row.status,
        expiresAt: row.expiresAt.toISOString(),
        invitedBy: { name: byId.get(row.invitedByUserId) ?? '—' },
      }))
    })
  }

  async create(ctx: TenantContext, emailRaw: string, role: Role, inviterName: string) {
    this.policy.assertCanAssignRole(ctx.role, role)
    const email = normalizeEmail(emailRaw)

    const existingMember = await this.prisma.membership.findFirst({
      where: {
        isActive: true,
        user: { email },
      },
      select: { id: true },
    })
    if (existingMember) {
      throw new ConflictException({ code: 'ALREADY_MEMBER', message: 'User is already a member' })
    }

    const pending = await this.prisma.invitation.findFirst({
      where: { email, status: 'PENDING' },
      select: { id: true },
    })
    if (pending) {
      throw new ConflictException({
        code: 'INVITATION_PENDING',
        message: 'An invitation is already pending for this email',
      })
    }

    const token = this.tokens.createOpaqueToken()
    const tokenHash = this.tokens.hashOpaqueToken(token)
    const expiresAt = this.tokens.invitationExpiresAt()

    const invitation = await this.prisma.invitation.create({
      data: {
        tenantId: ctx.tenantId,
        email,
        role: role as MembershipRole,
        tokenHash,
        expiresAt,
        invitedByUserId: ctx.userId,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    })

    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
    const inviteUrl = `${webOrigin}/convite/${token}`
    const tenant = await this.prisma.bypassTenant('invitation-tenant-name', () =>
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: ctx.tenantId },
        select: { name: true },
      }),
    )
    const template = buildInvitationEmail({
      inviteeEmail: email,
      tenantName: tenant.name,
      role,
      inviteUrl,
      inviterName,
    })
    await this.mailer.send({ to: email, subject: template.subject, text: template.text })

    this.events.emit('users.invitation.created', {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      invitationId: invitation.id,
    })

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as Role,
      expiresAt: invitation.expiresAt.toISOString(),
    }
  }

  async resend(ctx: TenantContext, invitationId: string, inviterName: string): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, status: 'PENDING' },
      select: { id: true, email: true, role: true },
    })
    if (!invitation) {
      throw new NotFoundException()
    }

    this.policy.assertCanAssignRole(ctx.role, invitation.role as Role)

    const token = this.tokens.createOpaqueToken()
    const tokenHash = this.tokens.hashOpaqueToken(token)
    const expiresAt = this.tokens.invitationExpiresAt()

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { tokenHash, expiresAt },
    })

    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000'
    const inviteUrl = `${webOrigin}/convite/${token}`
    const tenant = await this.prisma.bypassTenant('invitation-resend-tenant', () =>
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: ctx.tenantId },
        select: { name: true },
      }),
    )
    const template = buildInvitationEmail({
      inviteeEmail: invitation.email,
      tenantName: tenant.name,
      role: invitation.role,
      inviteUrl,
      inviterName,
    })
    await this.mailer.send({
      to: invitation.email,
      subject: template.subject,
      text: template.text,
    })

    this.events.emit('users.invitation.resent', {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      invitationId: invitation.id,
    })
  }

  async revoke(ctx: TenantContext, invitationId: string): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, status: 'PENDING' },
      select: { id: true, email: true },
    })
    if (!invitation) {
      throw new NotFoundException()
    }

    // Avoid colliding with prior REVOKED rows under a naive unique(status) constraint.
    await this.prisma.invitation.deleteMany({
      where: {
        email: invitation.email,
        status: { in: ['REVOKED', 'EXPIRED'] },
        id: { not: invitation.id },
      },
    })

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    })

    this.events.emit('users.invitation.revoked', {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      invitationId: invitation.id,
    })
  }

  async preview(token: string): Promise<{
    tenantName: string
    email: string
    role: Role
    expiresAt: string
    existingUser: boolean
  }> {
    const invitation = await this.findUsableInvitation(token)
    const existingUser = Boolean(
      await this.prisma.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      }),
    )

    return {
      tenantName: invitation.tenant.name,
      email: maskEmail(invitation.email),
      role: invitation.role as Role,
      expiresAt: invitation.expiresAt.toISOString(),
      existingUser,
    }
  }

  async accept(
    dto: { token: string; name?: string; password?: string },
    request: RequestWithAuth,
  ): Promise<AuthSessionResponse> {
    const invitation = await this.findUsableInvitation(dto.token)

    const existing = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        isActive: true,
      },
    })

    let userId: string
    let name: string
    let email: string

    if (existing) {
      if (!existing.isActive || !existing.passwordHash) {
        throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' })
      }
      if (!dto.password) {
        throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' })
      }
      const valid = await this.hasher.verify(dto.password, existing.passwordHash)
      if (!valid) {
        throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' })
      }
      userId = existing.id
      name = existing.name
      email = existing.email
    } else {
      if (!dto.name || !dto.password) {
        throw new UnprocessableEntityException({
          code: 'NAME_PASSWORD_REQUIRED',
          message: 'Name and password are required for new users',
        })
      }
      if (!isPasswordStrong(dto.password, invitation.email)) {
        throw new UnprocessableEntityException({
          code: 'WEAK_PASSWORD',
          message: 'password does not meet strength requirements',
        })
      }
      const passwordHash = await this.hasher.hash(dto.password)
      const created = await this.prisma.user.create({
        data: {
          email: invitation.email,
          name: dto.name,
          passwordHash,
        },
        select: { id: true, name: true, email: true },
      })
      userId = created.id
      name = created.name
      email = created.email
    }

    const membership = await this.prisma.bypassTenant('invitation-accept', async () =>
      this.prisma.$transaction(async (tx) => {
        const existingMembership = await tx.membership.findUnique({
          where: {
            tenantId_userId: { tenantId: invitation.tenantId, userId },
          },
          select: { id: true, isActive: true, role: true },
        })

        let membershipId: string
        let role: MembershipRole

        if (existingMembership) {
          const updated = await tx.membership.update({
            where: { id: existingMembership.id },
            data: {
              isActive: true,
              role: invitation.role,
              deactivatedAt: null,
              deactivatedById: null,
              roleChangedAt: new Date(),
            },
            select: { id: true, role: true },
          })
          membershipId = updated.id
          role = updated.role
        } else {
          const created = await tx.membership.create({
            data: {
              tenantId: invitation.tenantId,
              userId,
              role: invitation.role,
            },
            select: { id: true, role: true },
          })
          membershipId = created.id
          role = created.role
        }

        await tx.invitation.update({
          where: { id: invitation.id },
          data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
            acceptedUserId: userId,
          },
        })

        return { membershipId, role }
      }),
    )

    this.events.emit('users.invitation.accepted', {
      tenantId: invitation.tenantId,
      userId,
      invitationId: invitation.id,
    })

    return this.auth.issueSession({
      userId,
      tenantId: invitation.tenantId,
      tenantSlug: invitation.tenant.slug,
      tenantName: invitation.tenant.name,
      membershipId: membership.membershipId,
      role: membership.role,
      email,
      name,
      request,
    })
  }

  private async findUsableInvitation(token: string) {
    const tokenHash = this.tokens.hashOpaqueToken(token)
    const invitation = await this.prisma.bypassTenant('invitation-lookup', () =>
      this.prisma.invitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          tenantId: true,
          email: true,
          role: true,
          status: true,
          expiresAt: true,
          tenant: { select: { id: true, slug: true, name: true, isActive: true } },
        },
      }),
    )

    if (!invitation || invitation.status === 'REVOKED' || invitation.status === 'ACCEPTED') {
      throw new NotFoundException()
    }

    if (invitation.status === 'EXPIRED' || invitation.expiresAt <= new Date() || !invitation.tenant.isActive) {
      if (invitation.status === 'PENDING') {
        await this.prisma.bypassTenant('invitation-expire', () =>
          this.prisma.invitation.update({
            where: { id: invitation.id },
            data: { status: 'EXPIRED' },
          }),
        )
      }
      throw new GoneException({ code: 'INVITATION_EXPIRED', message: 'Invitation expired' })
    }

    return invitation
  }
}
