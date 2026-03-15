import { useState } from 'react'
import { BookMeta, MoveEntry } from '../types'
const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
import './GuessDialog.css'

interface Props {
  selectedBook: string
  selectedChapter: string | null
  books: string[]
  booksMeta: Record<string, BookMeta>
  moveLog: MoveEntry[]
  loading: boolean
  onSelectChapter: (chapter: string) => void
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
  selectedBook, selectedChapter, books, booksMeta, moveLog, loading,
  onSelectChapter, onClose, onSubmit,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const bookIdx = books.indexOf(selectedBook)
  const chapters = booksMeta[selectedBook]?.chapters ?? []
  const normQ = normalizeSearch(searchQuery).trim()
  const filtered = normQ
    ? chapters.filter((ch: string) => normalizeSearch(booksMeta[selectedBook]?.chapter_names[ch] || ch).includes(normQ))
    : chapters

  const guessedChapters = new Map<string, string>(
    moveLog
      .filter(m => m.kind === 'guess' && m.book === selectedBook)
      .map(m => {
        if (m.kind !== 'guess') return ['', ''] as [string, string]
        const label = m.correct ? 'correct' : m.bookCorrect ? 'right book, wrong chapter' : 'wrong'
        return [m.chapter, label] as [string, string]
      })
  )

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}>

        <div className="dialog-header">
          <span style={{ flexShrink: 0, color: '#7a6a52', fontWeight: 600, fontSize: '15px', fontFamily: 'Georgia, serif', minWidth: '22px', textAlign: 'center' }}>{ROMANS[bookIdx]}</span>
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
          {filtered.map((ch: string) => {
            const name = booksMeta[selectedBook]?.chapter_names[ch] || ch
            const num = ch.match(/(\d+)/)?.[1] ?? ''
            const guessedResult = guessedChapters.get(ch)
            const isGuessed = guessedResult !== undefined
            return (
              <button
                key={ch}
                className={`chapter-btn${selectedChapter === ch ? ' selected' : ''}${isGuessed ? ' guessed' : ''}`}
                onClick={() => { if (!isGuessed) onSelectChapter(ch) }}
                title={isGuessed ? `Already guessed — ${guessedResult}` : undefined}
              >
                <span className="chapter-num">{num}</span>
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
