import '@testing-library/jest-dom/vitest'

// happy-dom doesn't provide clipboard API — must be configurable
// so @testing-library/user-event can attach its own stub
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
})
