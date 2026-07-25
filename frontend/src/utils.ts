import { BookMeta, ChapterNamesRaw, MoveEntry } from './types'

export const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

// Defaults to the actual wedding date so a deploy with no VITE_WEDDING_DATE
// set is always locked to it; set VITE_WEDDING_DATE to today's date locally
// (e.g. in docker-compose.yml) to preview the special puzzle early.
export const WEDDING_DATE = import.meta.env.VITE_WEDDING_DATE || '2026-07-25'

// Kept in sync (by hand) with the identical inline computation in
// public/prefetch-puzzle.js, which runs outside the build/type-check pipeline.
// If this logic changes, update that file too or the prefetch silently stops matching.
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
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

export async function parseApiResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
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

