import { MoveEntry } from './types'

export const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export function parseChapterNum(chapterId: string): string {
  return chapterId.match(/(\d+)/)?.[1] ?? chapterId
}

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

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, opts)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
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

