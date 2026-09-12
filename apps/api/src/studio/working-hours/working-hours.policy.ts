import { BadRequestException, Injectable } from '@nestjs/common'
import type { EffectiveWorkingHoursView, WorkingHoursEntryView } from '@clivyra/types'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

@Injectable()
export class WorkingHoursPolicy {
  assertEntries(entries: WorkingHoursEntryView[]): WorkingHoursEntryView[] {
    if (!Array.isArray(entries)) {
      throw new BadRequestException({ code: 'INVALID_HOURS', message: 'entries must be an array' })
    }
    const normalized: WorkingHoursEntryView[] = entries.map((entry) => ({
      weekday: entry.weekday,
      startTime: entry.startTime,
      endTime: entry.endTime,
    }))

    const byDay = new Map<number, WorkingHoursEntryView[]>()
    for (const entry of normalized) {
      if (!Number.isInteger(entry.weekday) || entry.weekday < 0 || entry.weekday > 6) {
        throw new BadRequestException({ code: 'INVALID_HOURS', message: 'weekday must be 0..6' })
      }
      if (!TIME_RE.test(entry.startTime) || !TIME_RE.test(entry.endTime)) {
        throw new BadRequestException({ code: 'INVALID_HOURS', message: 'time must be HH:mm' })
      }
      const start = toMinutes(entry.startTime)
      const end = toMinutes(entry.endTime)
      if (start % 5 !== 0 || end % 5 !== 0) {
        throw new BadRequestException({ code: 'INVALID_HOURS', message: 'time must be in 5-minute steps' })
      }
      if (start >= end) {
        throw new BadRequestException({ code: 'INVALID_HOURS', message: 'startTime must be before endTime' })
      }
      const list = byDay.get(entry.weekday) ?? []
      list.push(entry)
      byDay.set(entry.weekday, list)
    }

    for (const [, dayEntries] of byDay) {
      if (dayEntries.length > 4) {
        throw new BadRequestException({ code: 'INVALID_HOURS', message: 'at most 4 intervals per day' })
      }
      const sorted = [...dayEntries].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))
      for (let i = 1; i < sorted.length; i += 1) {
        if (toMinutes(sorted[i].startTime) < toMinutes(sorted[i - 1].endTime)) {
          throw new BadRequestException({ code: 'INVALID_HOURS', message: 'intervals overlap' })
        }
      }
    }

    return normalized
  }

  /**
   * Override replaces studio defaults entirely when the professional has any override rows.
   * Days without an override entry are empty (no merge).
   */
  effective(input: {
    professionalId: string
    date: string
    weekday: number
    overrides: WorkingHoursEntryView[]
    defaults: WorkingHoursEntryView[]
    hasAnyOverride: boolean
  }): EffectiveWorkingHoursView {
    if (input.hasAnyOverride) {
      return {
        professionalId: input.professionalId,
        date: input.date,
        weekday: input.weekday,
        source: 'override',
        entries: input.overrides.filter((entry) => entry.weekday === input.weekday),
      }
    }
    return {
      professionalId: input.professionalId,
      date: input.date,
      weekday: input.weekday,
      source: 'default',
      entries: input.defaults.filter((entry) => entry.weekday === input.weekday),
    }
  }
}
