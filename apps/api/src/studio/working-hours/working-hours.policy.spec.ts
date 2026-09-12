import { BadRequestException } from '@nestjs/common'
import { WorkingHoursPolicy } from './working-hours.policy'

describe('WorkingHoursPolicy', () => {
  const policy = new WorkingHoursPolicy()

  it('rejects overlapping intervals', () => {
    expect(() =>
      policy.assertEntries([
        { weekday: 1, startTime: '08:00', endTime: '12:00' },
        { weekday: 1, startTime: '11:00', endTime: '14:00' },
      ]),
    ).toThrow(BadRequestException)
  })

  it('rejects non-5-minute steps and inverted ranges', () => {
    expect(() =>
      policy.assertEntries([{ weekday: 1, startTime: '08:01', endTime: '09:00' }]),
    ).toThrow(BadRequestException)
    expect(() =>
      policy.assertEntries([{ weekday: 1, startTime: '10:00', endTime: '09:00' }]),
    ).toThrow(BadRequestException)
  })

  it('limits to 4 intervals per day', () => {
    expect(() =>
      policy.assertEntries([
        { weekday: 1, startTime: '08:00', endTime: '09:00' },
        { weekday: 1, startTime: '09:00', endTime: '10:00' },
        { weekday: 1, startTime: '10:00', endTime: '11:00' },
        { weekday: 1, startTime: '11:00', endTime: '12:00' },
        { weekday: 1, startTime: '12:00', endTime: '13:00' },
      ]),
    ).toThrow(BadRequestException)
  })

  it('effective uses override-only semantics', () => {
    const result = policy.effective({
      professionalId: 'p1',
      date: '2026-09-15',
      weekday: 2,
      hasAnyOverride: true,
      overrides: [{ weekday: 1, startTime: '09:00', endTime: '12:00' }],
      defaults: [{ weekday: 2, startTime: '08:00', endTime: '18:00' }],
    })
    expect(result.source).toBe('override')
    expect(result.entries).toEqual([])
  })

  it('effective falls back to defaults when no overrides exist', () => {
    const result = policy.effective({
      professionalId: 'p1',
      date: '2026-09-15',
      weekday: 2,
      hasAnyOverride: false,
      overrides: [],
      defaults: [{ weekday: 2, startTime: '08:00', endTime: '18:00' }],
    })
    expect(result.source).toBe('default')
    expect(result.entries).toHaveLength(1)
  })
})
