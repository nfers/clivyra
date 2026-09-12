import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import type { AuthSessionListItem, AuthSessionResponse, MeResponse, Role } from '@clivyra/types'
import type { MembershipRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { accountLockoutPolicy } from './account-lockout.policy'
import { AUTH_EVENTS_PORT, type AuthEventsPort } from './auth-events.port'
import { clientIp, hashIp, truncateUserAgent } from './auth-request.util'
import { AuthTokenService } from './auth-token.service'
import type { RequestWithAuth, SessionClientKind } from './auth.types'
import { resolveClientKind } from './auth.types'
import type { LoginDto, LogoutDto, RefreshDto, SignupDto, SwitchTenantDto } from './dto/auth.dto'
import { normalizeEmail } from './password-policy'
import { PasswordHasherService } from './password-hasher.service'

const AUTH_FAILURE_MESSAGE = 'Invalid credentials'
const ACCOUNT_LOCKED_MESSAGE = 'Account temporarily locked'

/** Constant-time dummy hash (pbkdf2 format) used when user is missing. */
const DUMMY_PASSWORD_HASH =
  'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasherService,
    private readonly tokens: AuthTokenService,
    @Inject(AUTH_EVENTS_PORT) private readonly events: AuthEventsPort,
  ) {}

  async signup(
    dto: SignupDto,
    request: RequestWithAuth,
  ): Promise<AuthSessionResponse> {
    if (process.env.AUTH_SELF_SIGNUP_ENABLED !== 'true') {
      throw new NotFoundException()
    }

    const email = normalizeEmail(dto.email)
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'Email already in use' })
    }

    const passwordHash = await this.hasher.hash(dto.password)

    try {
      // Membership is tenant-owned; signup has no ALS yet — bypass with explicit reason.
      const created = await this.prisma.bypassTenant('auth-signup', () =>
        this.prisma.$transaction(async (tx) => {
          const tenant = await tx.tenant.create({
            data: { slug: dto.slug, name: dto.studioName },
            select: { id: true, slug: true, name: true },
          })
          const user = await tx.user.create({
            data: {
              email,
              name: dto.ownerName,
              passwordHash,
            },
            select: { id: true, email: true, name: true },
          })
          const membership = await tx.membership.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              role: 'OWNER',
            },
            select: { id: true, role: true },
          })
          return { tenant, user, membership }
        }),
      )

      return this.createSessionResponse({
        userId: created.user.id,
        tenantId: created.tenant.id,
        tenantSlug: created.tenant.slug,
        tenantName: created.tenant.name,
        membershipId: created.membership.id,
        role: created.membership.role,
        email: created.user.email,
        name: created.user.name,
        request,
        client: resolveClientKind(request.headers),
      })
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'Email already in use' })
      }
      throw error
    }
  }

  async login(dto: LoginDto, request: RequestWithAuth): Promise<AuthSessionResponse> {
    const email = normalizeEmail(dto.email)
    const ip = clientIp(request)
    const ipHashValue = hashIp(ip)

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        isActive: true,
        failedLoginCount: true,
        lockedUntil: true,
        memberships: {
          where: {
            isActive: true,
            tenant: { isActive: true },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            tenantId: true,
            role: true,
            tenant: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    })

    const lockState = accountLockoutPolicy.normalize({
      failedLoginCount: user?.failedLoginCount ?? 0,
      lockedUntil: user?.lockedUntil ?? null,
    })

    if (user && accountLockoutPolicy.isLocked(lockState)) {
      this.events.emit('auth.login.locked', { userId: user.id, ipHash: ipHashValue })
      throw new HttpException({ code: 'ACCOUNT_LOCKED', message: ACCOUNT_LOCKED_MESSAGE }, HttpStatus.LOCKED)
    }

    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH
    const validPassword = await this.hasher.verify(dto.password, passwordHash)

    if (!user?.isActive || !user.passwordHash || !validPassword) {
      if (user?.isActive) {
        const decision = accountLockoutPolicy.registerFailure(lockState)
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: decision.nextState.failedLoginCount,
            lockedUntil: decision.nextState.lockedUntil,
          },
        })
        if (decision.locked) {
          this.events.emit('auth.login.locked', { userId: user.id, ipHash: ipHashValue })
          throw new HttpException({ code: 'ACCOUNT_LOCKED', message: ACCOUNT_LOCKED_MESSAGE }, HttpStatus.LOCKED)
        }
      }
      this.events.emit('auth.login.failed', { userId: user?.id, ipHash: ipHashValue })
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE)
    }

    let memberships = user.memberships
    if (dto.tenantSlug) {
      memberships = memberships.filter((item) => item.tenant.slug === dto.tenantSlug)
      if (memberships.length === 0) {
        this.events.emit('auth.login.failed', { userId: user.id, ipHash: ipHashValue })
        throw new UnauthorizedException(AUTH_FAILURE_MESSAGE)
      }
    }

    if (memberships.length === 0) {
      this.events.emit('auth.login.failed', { userId: user.id, ipHash: ipHashValue })
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE)
    }

    if (!dto.tenantSlug && memberships.length > 1) {
      throw new HttpException(
        {
          code: 'TENANT_SELECTION_REQUIRED',
          tenants: memberships.map((item) => ({
            tenantId: item.tenant.id,
            slug: item.tenant.slug,
            name: item.tenant.name,
          })),
        },
        HttpStatus.CONFLICT,
      )
    }

    const membership = memberships[0]!
    const reset = accountLockoutPolicy.reset()
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: reset.failedLoginCount,
        lockedUntil: reset.lockedUntil,
        lastLoginAt: new Date(),
      },
    })

    this.events.emit('auth.login.succeeded', {
      userId: user.id,
      tenantId: membership.tenantId,
      ipHash: ipHashValue,
    })

    return this.createSessionResponse({
      userId: user.id,
      tenantId: membership.tenantId,
      tenantSlug: membership.tenant.slug,
      tenantName: membership.tenant.name,
      membershipId: membership.id,
      role: membership.role,
      email: user.email,
      name: user.name,
      request,
      client: resolveClientKind(request.headers),
      familyId: randomUUID(),
    })
  }

  async refresh(dto: RefreshDto, request: RequestWithAuth): Promise<AuthSessionResponse> {
    const refreshToken = dto.refreshToken
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token')
    }

    const tokenHash = this.tokens.hashOpaqueToken(refreshToken)
    const now = new Date()
    const session = await this.prisma.bypassTenant('auth-refresh-lookup', () =>
      this.prisma.refreshSession.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          tenantId: true,
          familyId: true,
          expiresAt: true,
          revokedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              isActive: true,
              memberships: {
                where: { isActive: true, tenant: { isActive: true } },
                select: {
                  id: true,
                  tenantId: true,
                  role: true,
                  tenant: { select: { id: true, slug: true, name: true } },
                },
              },
            },
          },
        },
      }),
    )

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token')
    }

    if (session.revokedAt) {
      await this.revokeFamily(session.user.id, session.familyId, 'reuse_detected')
      this.events.emit('auth.refresh.reuse_detected', {
        userId: session.user.id,
        tenantId: session.tenantId,
        familyId: session.familyId,
        sessionId: session.id,
      })
      throw new UnauthorizedException('Invalid refresh token')
    }

    if (session.expiresAt <= now || !session.user.isActive) {
      await this.prisma.bypassTenant('auth-refresh-expire', () =>
        this.prisma.refreshSession.update({
          where: { id: session.id },
          data: { revokedAt: now, revokedReason: 'expired' },
        }),
      )
      this.events.emit('auth.refresh.expired', {
        userId: session.user.id,
        tenantId: session.tenantId,
        sessionId: session.id,
      })
      throw new UnauthorizedException('Invalid refresh token')
    }

    const membership = session.user.memberships.find((item) => item.tenantId === session.tenantId)
    if (!membership) {
      await this.prisma.bypassTenant('auth-refresh-inactive', () =>
        this.prisma.refreshSession.update({
          where: { id: session.id },
          data: { revokedAt: now, revokedReason: 'inactive_membership' },
        }),
      )
      throw new UnauthorizedException('Invalid refresh token')
    }

    const client = resolveClientKind(request.headers)
    const ip = clientIp(request)
    const userAgentHeader = request.headers['user-agent']
    const userAgent = truncateUserAgent(
      Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader,
    )
    const nextRefreshToken = this.tokens.createOpaqueToken()
    const nextTokenHash = this.tokens.hashOpaqueToken(nextRefreshToken)

    /**
     * Atomic rotation: claim the old row (id + tokenHash + revokedAt null) then create
     * the replacement in the same transaction. Concurrent refreshers lose the claim
     * (count !== 1) and are treated as reuse → whole family revoked.
     */
    const rotated = await this.prisma.bypassTenant('auth-refresh-rotate', () =>
      this.prisma.$transaction(async (tx) => {
        const claimed = await tx.refreshSession.updateMany({
          where: {
            id: session.id,
            tokenHash,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
            revokedReason: 'rotation',
          },
        })

        if (claimed.count !== 1) {
          return { ok: false as const }
        }

        const created = await tx.refreshSession.create({
          data: {
            userId: session.user.id,
            tenantId: session.tenantId,
            familyId: session.familyId,
            tokenHash: nextTokenHash,
            expiresAt: this.tokens.refreshTokenExpiresAt(),
            lastUsedAt: now,
            userAgent,
            ipHash: hashIp(ip),
          },
          select: { id: true },
        })

        await tx.refreshSession.update({
          where: { id: session.id },
          data: { replacedById: created.id },
        })

        return { ok: true as const, sessionId: created.id }
      }),
    )

    if (!rotated.ok) {
      await this.revokeFamily(session.user.id, session.familyId, 'reuse_detected')
      this.events.emit('auth.refresh.reuse_detected', {
        userId: session.user.id,
        tenantId: session.tenantId,
        familyId: session.familyId,
        sessionId: session.id,
        reason: 'concurrent_or_reuse',
      })
      throw new UnauthorizedException('Invalid refresh token')
    }

    const access = this.tokens.signAccessToken({
      userId: session.user.id,
      tenantId: session.tenantId,
      sessionId: rotated.sessionId,
    })

    this.events.emit('auth.refresh.rotated', {
      userId: session.user.id,
      tenantId: session.tenantId,
      familyId: session.familyId,
      sessionId: session.id,
    })

    const response: AuthSessionResponse = {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      tenant: {
        id: session.tenantId,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
      },
      membership: {
        id: membership.id,
        role: membership.role as Role,
      },
    }

    if (client === 'api') {
      return { ...response, refreshToken: nextRefreshToken }
    }

    return response
  }

  async logout(dto: LogoutDto): Promise<void> {
    if (!dto.refreshToken) {
      return
    }
    const tokenHash = this.tokens.hashOpaqueToken(dto.refreshToken)
    const updated = await this.prisma.bypassTenant('auth-logout', () =>
      this.prisma.refreshSession.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'logout' },
      }),
    )
    if (updated.count > 0) {
      this.events.emit('auth.logout', {})
    }
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date()
    await this.prisma.bypassTenant('auth-logout-all', async () => {
      await this.prisma.$transaction([
        this.prisma.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now, revokedReason: 'logout' },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { sessionsInvalidatedAt: now },
        }),
      ])
    })
    this.events.emit('auth.logout', { userId, reason: 'logout_all' })
  }

  async switchTenant(
    userId: string,
    currentSessionId: string | undefined,
    dto: SwitchTenantDto,
    request: RequestWithAuth,
  ): Promise<AuthSessionResponse> {
    const membership = await this.prisma.bypassTenant('auth-switch-tenant-lookup', () =>
      this.prisma.membership.findFirst({
        where: {
          userId,
          tenantId: dto.tenantId, // tenant-boundary: allow switch-tenant target — membership revalidated server-side
          isActive: true,
          tenant: { isActive: true },
          user: { isActive: true },
        },
        select: {
          id: true,
          role: true,
          tenantId: true,
          tenant: { select: { id: true, slug: true, name: true } },
          user: { select: { id: true, email: true, name: true } },
        },
      }),
    )

    if (!membership) {
      throw new NotFoundException()
    }

    if (currentSessionId) {
      await this.prisma.bypassTenant('auth-switch-tenant', () =>
        this.prisma.refreshSession.updateMany({
          where: { id: currentSessionId, userId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'switch_tenant' },
        }),
      )
    }

    return this.createSessionResponse({
      userId: membership.user.id,
      tenantId: membership.tenantId,
      tenantSlug: membership.tenant.slug,
      tenantName: membership.tenant.name,
      membershipId: membership.id,
      role: membership.role,
      email: membership.user.email,
      name: membership.user.name,
      request,
      client: resolveClientKind(request.headers),
      familyId: randomUUID(),
    })
  }

  async me(userId: string, tenantId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: {
          where: { isActive: true, tenant: { isActive: true } },
          select: {
            id: true,
            role: true,
            tenant: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    })

    if (!user) {
      throw new UnauthorizedException('Authentication is required')
    }

    const current = user.memberships.find((item) => item.tenant.id === tenantId)
    if (!current) {
      throw new UnauthorizedException('Authentication is required')
    }

    return {
      user: { id: user.id, name: user.name, email: user.email },
      tenant: { id: current.tenant.id, slug: current.tenant.slug, name: current.tenant.name },
      membership: { id: current.id, role: current.role as Role },
      memberships: user.memberships.map((item) => ({
        tenantId: item.tenant.id,
        slug: item.tenant.slug,
        name: item.tenant.name,
        role: item.role as Role,
      })),
    }
  }

  async listSessions(userId: string, currentSessionId: string | undefined): Promise<AuthSessionListItem[]> {
    const sessions = await this.prisma.bypassTenant('auth-list-sessions', () =>
      this.prisma.refreshSession.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          lastUsedAt: true,
          userAgent: true,
        },
      }),
    )

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      userAgent: session.userAgent,
      current: session.id === currentSessionId,
    }))
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.bypassTenant('auth-revoke-session', () =>
      this.prisma.refreshSession.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'admin' },
      }),
    )
    if (result.count === 0) {
      throw new NotFoundException()
    }
    this.events.emit('auth.session.revoked', { userId, sessionId })
  }

  private async revokeFamily(userId: string, familyId: string, reason: string): Promise<void> {
    await this.prisma.bypassTenant('auth-revoke-family', () =>
      this.prisma.refreshSession.updateMany({
        where: { userId, familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
    )
  }

  /** Issues a session for an already-validated membership (e.g. invitation accept). */
  issueSession(input: {
    userId: string
    tenantId: string
    tenantSlug: string
    tenantName: string
    membershipId: string
    role: MembershipRole
    email: string
    name: string
    request: RequestWithAuth
    client?: SessionClientKind
  }): Promise<AuthSessionResponse> {
    return this.createSessionResponse({
      ...input,
      client: input.client ?? resolveClientKind(input.request.headers),
    })
  }

  async revokeSessionsForUserInTenant(userId: string, tenantId: string, reason: string): Promise<void> {
    await this.prisma.bypassTenant('auth-revoke-tenant-sessions', () =>
      this.prisma.refreshSession.updateMany({
        where: { userId, tenantId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      }),
    )
  }

  private async createSessionResponse(input: {
    userId: string
    tenantId: string
    tenantSlug: string
    tenantName: string
    membershipId: string
    role: MembershipRole
    email: string
    name: string
    request: RequestWithAuth
    client: SessionClientKind
    familyId?: string
    replacesSessionId?: string
  }): Promise<AuthSessionResponse> {
    const refreshToken = this.tokens.createOpaqueToken()
    const familyId = input.familyId ?? randomUUID()
    const ip = clientIp(input.request)
    const userAgentHeader = input.request.headers['user-agent']
    const userAgent = truncateUserAgent(
      Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader,
    )

    const session = await this.prisma.bypassTenant('auth-create-session', () =>
      this.prisma.$transaction(async (tx) => {
        if (input.replacesSessionId) {
          const claimed = await tx.refreshSession.updateMany({
            where: {
              id: input.replacesSessionId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
              revokedReason: 'rotation',
            },
          })
          if (claimed.count !== 1) {
            throw new UnauthorizedException('Invalid refresh token')
          }
        }

        const created = await tx.refreshSession.create({
          data: {
            userId: input.userId,
            tenantId: input.tenantId,
            familyId,
            tokenHash: this.tokens.hashOpaqueToken(refreshToken),
            expiresAt: this.tokens.refreshTokenExpiresAt(),
            lastUsedAt: new Date(),
            userAgent,
            ipHash: hashIp(ip),
          },
          select: { id: true },
        })

        if (input.replacesSessionId) {
          await tx.refreshSession.update({
            where: { id: input.replacesSessionId },
            data: { replacedById: created.id },
          })
        }

        return created
      }),
    )

    const access = this.tokens.signAccessToken({
      userId: input.userId,
      tenantId: input.tenantId,
      sessionId: session.id,
    })

    const response: AuthSessionResponse = {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      user: {
        id: input.userId,
        email: input.email,
        name: input.name,
      },
      tenant: {
        id: input.tenantId,
        slug: input.tenantSlug,
        name: input.tenantName,
      },
      membership: {
        id: input.membershipId,
        role: input.role as Role,
      },
    }

    if (input.client === 'api') {
      return { ...response, refreshToken }
    }

    return response
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002',
    )
  }
}
