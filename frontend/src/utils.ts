import { BookMeta, MoveEntry } from './types'
import { BOOK_ICONS } from './bookIcons'

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

export function moveLabel(m: MoveEntry, booksMeta: Record<string, BookMeta>): string {
  if (m.kind === 'word') {
    return `added word on the ${m.direction}: "${m.word}"`
  }
  const bookNumStr = m.book.match(/Book (\d+)/)?.[1] ?? '?'
  const bookRoman = BOOK_ICONS[parseInt(bookNumStr) - 1]?.roman ?? bookNumStr
  const chNum = m.chapter.match(/(\d+)/)?.[1] ?? '?'
  const chName = booksMeta[m.book]?.chapter_names[m.chapter] || m.chapter
  const result = m.correct ? 'Correct!' : m.bookCorrect ? 'Right book, wrong chapter' : 'Wrong book'
  return `Book ${bookRoman}, Ch. ${chNum} "${chName}" → ${result}`
}
