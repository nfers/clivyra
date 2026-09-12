export class AuditImmutableError extends Error {
  constructor(message = 'AuditLog is append-only') {
    super(message)
    this.name = 'AuditImmutableError'
  }
}

export class AuditValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuditValidationError'
  }
}
