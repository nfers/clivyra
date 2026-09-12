import { AccountLockoutPolicy } from './account-lockout.policy'

describe('AccountLockoutPolicy', () => {
  const policy = new AccountLockoutPolicy()
  const now = new Date('2026-01-01T12:00:00.000Z')

  it('locks after 10 failures and doubles lock duration', () => {
    let state = policy.reset()
    for (let i = 0; i < 9; i += 1) {
      const decision = policy.registerFailure(state, now)
      expect(decision.locked).toBe(false)
      state = decision.nextState
    }

    const locked = policy.registerFailure(state, now)
    expect(locked.locked).toBe(true)
    expect(locked.nextState.lockedUntil?.getTime()).toBe(now.getTime() + 15 * 60 * 1000)

    const secondWave = { ...locked.nextState, lockedUntil: null }
    for (let i = 0; i < 9; i += 1) {
      const decision = policy.registerFailure(secondWave, now)
      Object.assign(secondWave, decision.nextState)
    }
    const secondLock = policy.registerFailure(secondWave, now)
    expect(secondLock.nextState.lockedUntil?.getTime()).toBe(now.getTime() + 30 * 60 * 1000)
  })

  it('resets lockout state', () => {
    expect(policy.reset()).toEqual({ failedLoginCount: 0, lockedUntil: null })
  })
})
