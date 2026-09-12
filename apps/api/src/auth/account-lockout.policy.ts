export interface LockoutState {
  failedLoginCount: number
  lockedUntil: Date | null
}

export interface LockoutDecision {
  locked: boolean
  nextState: LockoutState
}

const FAILURE_THRESHOLD = 10
const WINDOW_MS = 15 * 60 * 1000
const BASE_LOCK_MS = 15 * 60 * 1000
const MAX_LOCK_MS = 24 * 60 * 60 * 1000

export class AccountLockoutPolicy {
  isLocked(state: LockoutState, now = new Date()): boolean {
    return Boolean(state.lockedUntil && state.lockedUntil.getTime() > now.getTime())
  }

  registerFailure(state: LockoutState, now = new Date()): LockoutDecision {
    const count = state.failedLoginCount + 1
    if (count < FAILURE_THRESHOLD) {
      return {
        locked: false,
        nextState: { failedLoginCount: count, lockedUntil: state.lockedUntil },
      }
    }

    const lockNumber = Math.floor(count / FAILURE_THRESHOLD)
    const duration = Math.min(BASE_LOCK_MS * 2 ** (lockNumber - 1), MAX_LOCK_MS)
    return {
      locked: true,
      nextState: {
        failedLoginCount: count,
        lockedUntil: new Date(now.getTime() + duration),
      },
    }
  }

  reset(): LockoutState {
    return { failedLoginCount: 0, lockedUntil: null }
  }

  /** Failures older than the window are treated as a fresh streak when unlocked. */
  normalize(state: LockoutState, now = new Date()): LockoutState {
    if (this.isLocked(state, now)) {
      return state
    }
    if (state.lockedUntil && state.lockedUntil.getTime() <= now.getTime()) {
      return this.reset()
    }
    void WINDOW_MS
    return state
  }
}

export const accountLockoutPolicy = new AccountLockoutPolicy()
