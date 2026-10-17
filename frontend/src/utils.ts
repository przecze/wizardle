import { BookMeta, ChapterNamesRaw, MoveEntry } from './types'

export const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

// The wedding special puzzle (frozen in the backend DB) gets a ❤️ and a note.
export const WEDDING_DATE = '2026-07-25'

// Kept in sync (by hand) with the identical computation in backend/main.py's
// _today_str(). If this logic changes, update that too or the server-rendered
// puzzle data island silently stops matching.
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// Shifts a YYYY-MM-DD date by whole days. Pure UTC arithmetic: shifting in
// local time breaks across DST changes (e.g. +1 from 2026-03-29 in CET stays
// on 2026-03-29, -1 from 2026-10-26 skips to 2026-10-24).
export function shiftDate(date: string, days: number): string {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The Vite dev server lets you navigate past today to preview upcoming puzzles
// (the dev backend serves them, see DEV_MODE in backend/main.py). Always false
// in production builds.
export function canViewFuture(): boolean {
  return import.meta.env.DEV
}

export function getCookie(name: string): string | null {
  const match = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : null
}

export function hasCookie(name: string): boolean {
  return getCookie(name) !== null
}

export function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; max-age=31536000; path=/`
}

// Single place resolving a chapter number to its display title (falls back to
// the bare number if the title is somehow missing).
export function chapterTitle(booksMeta: Record<string, BookMeta>, book: string, chapter: number): string {
  return booksMeta[book]?.chapter_names[chapter] || String(chapter)
}

export function buildBooksMeta(raw: ChapterNamesRaw): { books: string[]; booksMeta: Record<string, BookMeta> } {
  const books = raw.map(entry => entry.book)
  const booksMeta: Record<string, BookMeta> = {}
  for (const entry of raw) {
    const nums = Object.keys(entry.chapters).map(Number).sort((a, b) => a - b)
    booksMeta[entry.book] = {
      chapters: nums,
      chapter_names: Object.fromEntries(Object.entries(entry.chapters).map(([k, v]) => [Number(k), v])),
    }
  }
  return { books, booksMeta }
}

// Carries the parsed FastAPI `detail` so callers can react to specific errors
// (e.g. the earliest-puzzle 404) instead of only showing the message.
export class ApiError extends Error {
  constructor(readonly status: number, readonly detail: unknown, text: string) {
    super(`API ${status}: ${text}`)
  }
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    let detail: unknown = null
    try { detail = JSON.parse(text).detail } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, detail, text)
  }
  return res.json() as Promise<T>
}

// The backend answers a date before the first-ever puzzle with
// 404 {detail: {earliest_date}}; returns that date, or null for any other error.
export function earliestDateFromError(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 404) return null
  const detail = e.detail as { earliest_date?: unknown } | null
  return typeof detail?.earliest_date === 'string' ? detail.earliest_date : null
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, opts)
  return parseApiResponse<T>(res)
}

function guessEmoji(m: Extract<MoveEntry, { kind: 'guess' }>): string {
  if (m.correct) return '✅'
  if (m.bookCorrect) return '📚'
  return '❌'
}

// Used by the in-app Progress Log, which always shows word moves as directional arrows.
export function moveEmoji(m: MoveEntry): string {
  if (m.kind === 'word') return m.direction === 'left' ? '⬅️' : '➡️'
  return guessEmoji(m)
}

// Used by the shareable result text, where word moves default to a generic emoji
// (arrows are opt-in via the useArrows toggle) so the trail doesn't leak hint direction.
export function shareMoveEmoji(m: MoveEntry, useArrows: boolean): string {
  if (m.kind === 'word') return useArrows ? (m.direction === 'left' ? '⬅️' : '➡️') : '➕'
  return guessEmoji(m)
}

