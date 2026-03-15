import { MoveEntry } from './types'

export const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export function parseChapterNum(chapterId: string): string {
  return chapterId.match(/(\d+)/)?.[1] ?? chapterId
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, opts)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export function moveEmoji(m: MoveEntry): string {
  if (m.kind === 'word') return m.direction === 'left' ? '⬅️' : '➡️'
  if (m.correct) return '✅'
  if (m.bookCorrect) return '📚'
  return '❌'
}

