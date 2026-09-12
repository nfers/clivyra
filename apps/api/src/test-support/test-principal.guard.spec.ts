import { isTestPrincipalGuardAllowed, TestPrincipalGuard } from './test-principal.guard'

describe('TestPrincipalGuard registration', () => {
  it('is only allowed when NODE_ENV is test', () => {
    expect(isTestPrincipalGuardAllowed('test')).toBe(true)
    expect(isTestPrincipalGuardAllowed('production')).toBe(false)
    expect(isTestPrincipalGuardAllowed('development')).toBe(false)
  })

  it('throws when executed outside test env', () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const guard = new TestPrincipalGuard()
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      } as never),
    ).toThrow(/must not run outside NODE_ENV=test/)
    process.env.NODE_ENV = previous
  })
})
