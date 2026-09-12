export class TenantContextMissingError extends Error {
  constructor(message = 'Tenant context is required for tenant-owned models') {
    super(message)
    this.name = 'TenantContextMissingError'
  }
}

export class TenantScopeViolationError extends Error {
  constructor(message = 'Tenant scope violation') {
    super(message)
    this.name = 'TenantScopeViolationError'
  }
}

export class TenantOwnedRecordNotFoundError extends Error {
  constructor(message = 'Record not found for active tenant') {
    super(message)
    this.name = 'TenantOwnedRecordNotFoundError'
  }
}
