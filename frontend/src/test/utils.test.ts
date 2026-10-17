import { shiftDate } from '../utils'

describe('shiftDate', () => {
  const originalTz = process.env.TZ
  afterEach(() => { process.env.TZ = originalTz })

  it.each(['UTC', 'Europe/Warsaw', 'America/New_York', 'Australia/Sydney'])('crosses DST changes in %s', (tz) => {
    process.env.TZ = tz
    expect(shiftDate('2026-03-29', 1)).toBe('2026-03-30')   // EU spring forward
    expect(shiftDate('2026-03-30', -1)).toBe('2026-03-29')
    expect(shiftDate('2026-10-26', -1)).toBe('2026-10-25')  // EU fall back
    expect(shiftDate('2026-10-25', 1)).toBe('2026-10-26')
    expect(shiftDate('2026-03-08', 1)).toBe('2026-03-09')   // US spring forward
    expect(shiftDate('2026-04-05', -1)).toBe('2026-04-04')  // AU fall back
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })
})
