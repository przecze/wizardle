import { useState } from 'react'
import { BookMeta, MoveEntry } from '../types'
import { ROMANS, chapterTitle } from '../utils'
import './GuessDialog.css'

interface Props {
  selectedBookNum: number
  selectedChapter: number | null
  books: string[]
  booksMeta: Record<string, BookMeta>
  moveLog: MoveEntry[]
  loading: boolean
  onSelectChapter: (chapter: number) => void
  onClose: () => void
  onSubmit: () => void
}

function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '')
}

function highlightMatch(name: string, query: string) {
  const normQuery = normalizeSearch(query).trim()
  if (!normQuery) return name

  const normToOrig: number[] = []
  let normStr = ''
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]
    if (/[a-z0-9\s]/i.test(ch)) {
      normToOrig.push(i)
      normStr += ch.toLowerCase()
    }
  }

  const matchIdx = normStr.indexOf(normQuery)
  if (matchIdx === -1) return name

  const origStart = normToOrig[matchIdx]
  const origEnd = normToOrig[matchIdx + normQuery.length - 1] + 1

  return (
    <>
      {name.slice(0, origStart)}
      <mark>{name.slice(origStart, origEnd)}</mark>
      {name.slice(origEnd)}
    </>
  )
}

export default function GuessDialog({
  selectedBookNum, selectedChapter, books, booksMeta, moveLog, loading,
  onSelectChapter, onClose, onSubmit,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const bookIdx = selectedBookNum - 1
  const selectedBook = books[bookIdx]
  const chapters = booksMeta[selectedBook]?.chapters ?? []
  const normQ = normalizeSearch(searchQuery).trim()
  const filtered = normQ
    ? chapters.filter((ch: number) => normalizeSearch(chapterTitle(booksMeta, selectedBook, ch)).includes(normQ))
    : chapters

  const guessedChapters = new Map<number, string>(
    moveLog
      .filter(m => m.kind === 'guess' && m.book_num === selectedBookNum)
      .map(m => {
        const g = m as Extract<MoveEntry, { kind: 'guess' }>
        const label = g.correct ? 'correct' : g.bookCorrect ? 'right book, wrong chapter' : 'wrong'
        return [g.chapter, label] as [number, string]
      })
  )

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}>

        <div className="dialog-header">
          <span className="dialog-book-roman">{ROMANS[bookIdx]}</span>
          <span className="dialog-book-title">{selectedBook}</span>
          <button
            className={`search-toggle${searchOpen ? ' active' : ''}`}
            onClick={() => { setSearchOpen(o => !o); setSearchQuery('') }}
            title="Search chapters"
            aria-label="Toggle chapter search"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="10.5" cy="10.5" r="6.5"/>
              <line x1="15.5" y1="15.5" x2="21" y2="21"/>
            </svg>
          </button>
        </div>

        {searchOpen && (
          <div className="search-bar">
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chapters…"
            />
          </div>
        )}

        <div className="chapter-list">
          {filtered.map((ch: number) => {
            const name = chapterTitle(booksMeta, selectedBook, ch)
            const guessedResult = guessedChapters.get(ch)
            const isGuessed = guessedResult !== undefined
            return (
              <button
                key={ch}
                className={`chapter-btn${selectedChapter === ch ? ' selected' : ''}${isGuessed ? ' guessed' : ''}`}
                onClick={() => { if (!isGuessed) onSelectChapter(ch) }}
                title={isGuessed ? `Already guessed — ${guessedResult}` : undefined}
              >
                <span className="chapter-num">{ch}</span>
                <span className="chapter-name">{highlightMatch(name, searchQuery)}</span>
              </button>
            )
          })}
        </div>

        <div className="confirm-bar">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onSubmit} disabled={!selectedChapter || loading}>
            Submit guess
          </button>
        </div>

      </div>
    </div>
  )
}
