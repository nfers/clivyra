import { AsyncLocalStorage } from 'node:async_hooks'
import { Prisma, type PrismaClient } from '@prisma/client'
import { AuditImmutableError } from '../audit/audit.errors'
import { AppLogger } from '../common/logging/app-logger.service'
import { RequestContextStorage } from '../common/request-context/request-context.storage'
import { TenantContextStorage } from '../tenant/tenant-context.storage'
import { isGlobalModel, isTenantOwnedModel } from './tenant-owned-models'
import {
  TenantContextMissingError,
  TenantOwnedRecordNotFoundError,
  TenantScopeViolationError,
} from './tenant-scope.errors'

interface BypassStore {
  readonly reason: string
}

const bypassStorage = new AsyncLocalStorage<BypassStore>()
/** scopeId-keyed bypass — Prisma query hooks can drop ALS across engine boundaries. */
const bypassByScopeId = new Map<string, string>()
const logger = new AppLogger()

type BypassAuditHook = (reason: string, tenantId: string | undefined) => void
let bypassAuditHook: BypassAuditHook | undefined

/** Registered by AuditModule — audits bypassTenant when a tenant is in scope. */
export function setBypassAuditHook(hook: BypassAuditHook | undefined): void {
  bypassAuditHook = hook
}

const SKIP_BYPASS_AUDIT = /^(audit-|tenant-scoped-)/

const APPEND_ONLY_MODELS = new Set(['AuditLog', 'ConsentRecord'])
const APPEND_ONLY_OPS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert'])

type WhereInput = Record<string, unknown>

interface QueryArgs {
  where?: WhereInput
  data?: WhereInput | WhereInput[]
  create?: WhereInput
  update?: WhereInput
  [key: string]: unknown
}

interface ModelDelegate {
  findFirst: (args: QueryArgs) => Promise<unknown>
  updateMany: (args: QueryArgs) => Promise<{ count: number }>
  deleteMany: (args: QueryArgs) => Promise<{ count: number }>
}

const FILTER_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'deleteMany',
])

function modelDelegate(client: PrismaClient, model: string): ModelDelegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1)
  return (client as unknown as Record<string, ModelDelegate>)[key]
}

function andWhere(existing: WhereInput | undefined, tenantId: string): WhereInput {
  const tenantFilter = { tenantId }
  if (!existing || Object.keys(existing).length === 0) {
    return tenantFilter
  }
  return { AND: [existing, tenantFilter] }
}

function withoutClientTenantId(data: WhereInput): WhereInput {
  const safe = { ...data }
  delete safe.tenantId
  return safe
}

function assertCreateTenantId(data: WhereInput, tenantId: string): WhereInput {
  if ('tenantId' in data && data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantScopeViolationError('client-provided tenantId does not match active tenant')
  }
  return { ...data, tenantId }
}

/**
 * Reject divergent tenantId and strip tenantId from update payloads so ownership cannot be reassigned.
 */
function assertUpdateData(data: WhereInput | undefined, tenantId: string): WhereInput {
  if (!data) {
    return {}
  }
  if ('tenantId' in data && data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantScopeViolationError('client-provided tenantId does not match active tenant')
  }
  return withoutClientTenantId(data)
}

function applyTenantToArgs(operation: string, args: QueryArgs, tenantId: string): QueryArgs {
  if (FILTER_OPERATIONS.has(operation)) {
    return { ...args, where: andWhere(args.where, tenantId) }
  }

  if (operation === 'updateMany') {
    return {
      ...args,
      where: andWhere(args.where, tenantId),
      data: assertUpdateData(args.data as WhereInput | undefined, tenantId),
    }
  }

  if (operation === 'create') {
    return { ...args, data: assertCreateTenantId((args.data as WhereInput) ?? {}, tenantId) }
  }

  if (operation === 'createMany') {
    const data = args.data
    if (Array.isArray(data)) {
      return { ...args, data: data.map((row) => assertCreateTenantId(row, tenantId)) }
    }
    return { ...args, data: assertCreateTenantId((data as WhereInput) ?? {}, tenantId) }
  }

  if (operation === 'upsert') {
    return {
      ...args,
      where: andWhere(args.where, tenantId),
      create: assertCreateTenantId(args.create ?? {}, tenantId),
      update: assertUpdateData(args.update, tenantId),
    }
  }

  if (operation === 'update') {
    return {
      ...args,
      where: andWhere(args.where, tenantId),
      data: assertUpdateData(args.data as WhereInput | undefined, tenantId),
    }
  }

  return { ...args, where: andWhere(args.where, tenantId) }
}

function isBypassActive(): boolean {
  if (bypassStorage.getStore()) {
    return true
  }
  const scopeId = RequestContextStorage.get()?.scopeId
  return Boolean(scopeId && bypassByScopeId.has(scopeId))
}

export function createTenantScopedExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'tenantScoped',
      client: {
        async bypassTenant<T>(reason: string, fn: () => Promise<T>): Promise<T> {
          const request = RequestContextStorage.get()
          const scopeId = request?.scopeId
          const tenantId = TenantContextStorage.get()?.tenantId
          logger.warn('tenant_scope.bypass', {
            reason,
            requestId: request?.requestId,
            metric: 'tenant_scope.bypass',
          })
          if (!SKIP_BYPASS_AUDIT.test(reason) && bypassAuditHook) {
            try {
              bypassAuditHook(reason, tenantId)
            } catch {
              // Never fail the business operation because bypass auditing failed.
            }
          }
          if (scopeId) {
            bypassByScopeId.set(scopeId, reason)
          }
          try {
            return await bypassStorage.run({ reason }, fn)
          } finally {
            if (scopeId) {
              bypassByScopeId.delete(scopeId)
            }
          }
        },
      },
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (APPEND_ONLY_MODELS.has(model) && APPEND_ONLY_OPS.has(operation)) {
              throw new AuditImmutableError(`${model} is append-only`)
            }

            if (isGlobalModel(model)) {
              return query(args)
            }

            if (!isTenantOwnedModel(model)) {
              throw new TenantContextMissingError(`Model ${model} is not classified as global or tenant-owned`)
            }

            if (isBypassActive()) {
              return query(args)
            }

            const tenant = TenantContextStorage.get()
            if (!tenant) {
              throw new TenantContextMissingError()
            }

            const scopedArgs = applyTenantToArgs(operation, args as QueryArgs, tenant.tenantId)
            const delegate = modelDelegate(client as PrismaClient, model)

            if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
              const result = await delegate.findFirst({
                ...(scopedArgs as QueryArgs),
                where: andWhere((args as QueryArgs).where, tenant.tenantId),
              })
              if (operation === 'findUniqueOrThrow' && (result === null || result === undefined)) {
                throw new TenantOwnedRecordNotFoundError()
              }
              return result
            }

            if (operation === 'update') {
              const safeData = assertUpdateData((args as QueryArgs).data as WhereInput | undefined, tenant.tenantId)
              // Parent-client delegates still re-enter this extension; use bypass for the mutation helpers.
              return bypassStorage.run({ reason: 'tenant-scoped-update' }, async () => {
                const updateResult = await delegate.updateMany({
                  where: andWhere((args as QueryArgs).where, tenant.tenantId),
                  data: safeData,
                })
                if (updateResult.count === 0) {
                  throw new TenantOwnedRecordNotFoundError()
                }
                return delegate.findFirst({
                  where: andWhere((args as QueryArgs).where, tenant.tenantId),
                })
              })
            }

            if (operation === 'delete') {
              return bypassStorage.run({ reason: 'tenant-scoped-delete' }, async () => {
                const existing = await delegate.findFirst({
                  where: andWhere((args as QueryArgs).where, tenant.tenantId),
                })
                if (!existing) {
                  throw new TenantOwnedRecordNotFoundError()
                }
                const result = await delegate.deleteMany({
                  where: andWhere((args as QueryArgs).where, tenant.tenantId),
                })
                if (result.count === 0) {
                  throw new TenantOwnedRecordNotFoundError()
                }
                return existing
              })
            }

            return query(scopedArgs)
          },
        },
      },
    }),
  )
}
