import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BookMeta {
  chapters: string[]
  chapter_names: Record<string, string>
}

interface PuzzleResponse {
  date: string
  words: string[]
  books: string[]
  books_meta: Record<string, BookMeta>
}

interface WordResponse {
  word: string | null
  limit_reached: boolean
}

interface GuessAnswer {
  book: string
  chapter: string
  chapter_name: string
  position_pct: number
  context_fragment: string
}

interface GuessResponse {
  correct: boolean
  book_correct?: boolean
  answer: GuessAnswer | null
}

// ── Book icons (SVG inner HTML, 24×24 viewBox) ────────────────────────────────

const BOOK_ICONS: Array<{ label: string; roman: string; svg: string }> = [
  {
    label: "Philosopher's Stone",
    roman: 'I',
    svg: `<path d="M12 3 L8 14 L11 14 L9.5 21 L16 10 L13 10 Z" fill="currentColor"/>`,
  },
  {
    label: 'Chamber of Secrets',
    roman: 'II',
    svg: `<path d="M7 7 C4 10 4 15 7 18 C10 21 17 19 17 14 C17 9 11 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M7 7 L5.5 4.5 M7 7 L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  {
    label: 'Prisoner of Azkaban',
    roman: 'III',
    svg: `<path d="M19 13 A7 7 0 1 1 13 6 A9 9 0 0 0 19 13" fill="currentColor"/>`,
  },
  {
    label: 'Goblet of Fire',
    roman: 'IV',
    svg: `<path d="M9 17 L15 17 L13.5 11 L10.5 11 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M8 11 L16 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M12 9 C10.5 7 10.5 4.5 12 3 C13.5 4.5 13.5 7 12 9" fill="currentColor"/>`,
  },
  {
    label: 'Order of the Phoenix',
    roman: 'V',
    svg: `<path d="M12 20 C9 17 4 12 7.5 7.5 C9.5 5 11.5 6 12 6 C12.5 6 14.5 5 16.5 7.5 C20 12 15 17 12 20" fill="currentColor"/>
          <path d="M12 20 L10 23.5 M12 20 L12 23.5 M12 20 L14 23.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  {
    label: 'Half-Blood Prince',
    roman: 'VI',
    svg: `<ellipse cx="12" cy="14" rx="5" ry="6" fill="none" stroke="currentColor" stroke-width="1.8"/>
          <path d="M10 8 Q12 4 14 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="10" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="14" cy="5.5" r="0.9" fill="currentColor"/>`,
  },
  {
    label: 'Deathly Hallows',
    roman: 'VII',
    svg: `<path d="M12 3 L3.5 20.5 L20.5 20.5 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <circle cx="12" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
          <line x1="12" y1="3" x2="12" y2="20.5" stroke="currentColor" stroke-width="1.5"/>`,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch('/api' + path, opts)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// Animated word — each character appears with a stagger
function AnimatedWord({ word }: { word: string }) {
  return (
    <>
      {word.split('').map((ch, i) => (
        <span key={i} className="char-animated" style={{ animationDelay: `${i * 35}ms` }}>
          {ch}
        </span>
      ))}
    </>
  )
}

// ── Guess splash ──────────────────────────────────────────────────────────────

interface SplashData {
  book: string
  chapterName: string
  emoji: string
  resultLabel: string
}

function GuessSplash({ data, onDismiss }: { data: SplashData; onDismiss: () => void }) {
  const [phase, setPhase] = useState<'hourglass' | 'result'>('hourglass')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('result'), 1200)
    const t2 = setTimeout(() => onDismiss(), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDismiss])

  return (
    <div className="splash-backdrop" onClick={onDismiss}>
      <div className="splash-card">
        <div className="splash-location">
          <div className="splash-book">{data.book}</div>
          <div className="splash-chapter">{data.chapterName}</div>
        </div>
        <div className="splash-emoji-area">
          {phase === 'hourglass'
            ? <span className="splash-hourglass">⏳</span>
            : <span className="splash-result">{data.emoji}</span>
          }
        </div>
        {phase === 'result' && (
          <div className="splash-result-label">{data.resultLabel}</div>
        )}
        <div className="splash-hint">tap to continue</div>
      </div>
    </div>
  )
}

// ── Move log ──────────────────────────────────────────────────────────────────

type MoveEntry =
  | { kind: 'word'; direction: 'left' | 'right'; word: string }
  | { kind: 'guess'; book: string; chapter: string; chapterName: string; correct: boolean; bookCorrect: boolean }

function moveEmoji(m: MoveEntry): string {
  if (m.kind === 'word') return m.direction === 'left' ? '⬅️' : '➡️'
  if (m.correct) return '✅'
  if (m.bookCorrect) return '📚'
  return '❌'
}

function moveLabel(m: MoveEntry, booksMeta: Record<string, BookMeta>): string {
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

// ── Search helpers ────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

type GuessPhase = 'idle' | 'chapter'

export default function Game() {
  const [date, setDate] = useState<string>(todayStr)
  const [words, setWords] = useState<string[]>([])
  const [origBigram, setOrigBigram] = useState<string[]>([])
  const [booksMeta, setBooksMeta] = useState<Record<string, BookMeta>>({})
  const [books, setBooks] = useState<string[]>([])

  // Track which word index should animate (set to the newly added index)
  const [animIdx, setAnimIdx] = useState<number | null>(null)

  // Guess flow
  const [guessPhase, setGuessPhase] = useState<GuessPhase>('idle')
  const [selectedBook, setSelectedBook] = useState<string | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Result & log
  const [winner, setWinner] = useState<GuessAnswer | null>(null)
  const [moveLog, setMoveLog] = useState<MoveEntry[]>([])

  // Guess splash
  const [splash, setSplash] = useState<SplashData | null>(null)

  // Book button state derived from guesses
  const [ruledOutBooks, setRuledOutBooks] = useState<Set<string>>(new Set())
  const [confirmedBook, setConfirmedBook] = useState<string | null>(null)

  // Limits
  const [leftLimit, setLeftLimit] = useState(false)
  const [rightLimit, setRightLimit] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Stable key for word spans — so re-renders don't re-trigger animations
  const wordKeys = useRef<Map<number, number>>(new Map())
  const keyCounter = useRef(0)

  function getWordKey(idx: number): number {
    if (!wordKeys.current.has(idx)) {
      wordKeys.current.set(idx, keyCounter.current++)
    }
    return wordKeys.current.get(idx)!
  }

  useEffect(() => {
    setLoading(true)
    apiFetch<PuzzleResponse>(`/puzzle?date=${date}`)
      .then(data => {
        setWords(data.words)
        setOrigBigram(data.words)
        setBooks(data.books)
        setBooksMeta(data.books_meta)
        setAnimIdx(null) // will animate via initial mount
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [date])

  const addWord = useCallback(async (direction: 'left' | 'right') => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<WordResponse>('/word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, direction, revealed_words: words }),
      })
      if (data.limit_reached || data.word == null) {
        if (direction === 'left') setLeftLimit(true)
        else setRightLimit(true)
      } else {
        const newWord = data.word
        setWords(prev => {
          const next = direction === 'left' ? [newWord, ...prev] : [...prev, newWord]
          const newIdx = direction === 'left' ? 0 : next.length - 1
          // Invalidate key so AnimatedWord remounts for this index
          wordKeys.current.delete(newIdx)
          setAnimIdx(newIdx)
          return next
        })
        setMoveLog(prev => [...prev, { kind: 'word', direction, word: newWord }])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [loading, date, words])

  const submitGuess = useCallback(async () => {
    if (!selectedBook || !selectedChapter || loading) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<GuessResponse>('/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, book: selectedBook, chapter: selectedChapter }),
      })
      const chName = booksMeta[selectedBook]?.chapter_names[selectedChapter] || selectedChapter
      const emoji = data.correct ? '💫' : data.book_correct ? '📚' : '❌'
      const resultLabel = data.correct ? 'Correct!' : data.book_correct ? 'Right book, wrong chapter' : 'Wrong book'
      setMoveLog(prev => [...prev, {
        kind: 'guess',
        book: selectedBook,
        chapter: selectedChapter,
        chapterName: chName,
        correct: data.correct,
        bookCorrect: data.correct || !!data.book_correct,
      }])
      setSplash({ book: selectedBook, chapterName: chName, emoji, resultLabel })
      setGuessPhase('idle')
      if (data.correct && data.answer) {
        setWinner(data.answer)
      } else {
        if (data.book_correct) {
          setConfirmedBook(selectedBook)
        } else {
          setRuledOutBooks(prev => new Set([...prev, selectedBook]))
        }
        setSelectedBook(null)
        setSelectedChapter(null)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [selectedBook, selectedChapter, loading, date, booksMeta])

  function navigateDate(delta: -1 | 1) {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    const next = d.toISOString().slice(0, 10)
    if (next > todayStr()) return
    setDate(next)
    setWords([])
    setOrigBigram([])
    setMoveLog([])
    setWinner(null)
    setLeftLimit(false)
    setRightLimit(false)
    setGuessPhase('idle')
    setSelectedBook(null)
    setSelectedChapter(null)
    setRuledOutBooks(new Set())
    setConfirmedBook(null)
    setError(null)
    wordKeys.current.clear()
  }

  const origIdx = words.indexOf(origBigram[0])
  const wordsLeft = origIdx > 0 ? origIdx : 0
  const wordsRight = words.length - wordsLeft - origBigram.length

  function shareText(): string {
    return `Wizardle ${date}\n${moveLog.map(m => moveEmoji(m)).join('')}`
  }

  // Plus-circle button shared style
  function plusBtn(disabled: boolean): React.CSSProperties {
    return {
      flexShrink: 0,
      width: 30, height: 30,
      borderRadius: '50%',
      border: `1.5px solid ${disabled ? '#d8ccb4' : '#a09080'}`,
      background: 'none',
      cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: disabled ? '#d8ccb4' : '#7a6a52',
      fontSize: 18,
      lineHeight: 1,
      padding: 0,
      opacity: disabled ? 0.4 : 1,
      transition: 'opacity 120ms',
      userSelect: 'none' as const,
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 16px' }}>

      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 'normal', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#2c2416' }}>
          Wizardle
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 3 }}>
          <button
            onClick={() => navigateDate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a8a72', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
            aria-label="Previous puzzle"
          >◀</button>
          <p style={{ fontSize: 11, color: '#9a8a72', letterSpacing: '0.08em', margin: 0 }}>{date}</p>
          <button
            onClick={() => navigateDate(1)}
            disabled={date >= todayStr()}
            style={{ background: 'none', border: 'none', cursor: date >= todayStr() ? 'default' : 'pointer', color: date >= todayStr() ? '#d0c4ae' : '#9a8a72', fontSize: 13, padding: '0 2px', lineHeight: 1 }}
            aria-label="Next puzzle"
          >▶</button>
        </div>
      </header>

      {error && (
        <p style={{ color: '#8b2020', fontSize: 12.5, textAlign: 'center', marginBottom: 12 }}>{error}</p>
      )}

      {/* Fragment + inline add buttons */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#fffdf7',
        border: '1px solid #d8ccb4',
        borderRadius: 6,
        padding: '18px 12px',
        marginBottom: 24,
        minHeight: 72,
        boxShadow: '0 1px 4px rgba(44,36,22,0.05)',
      }}>
        {!winner && (
          <button
            style={plusBtn(loading || leftLimit)}
            onClick={() => addWord('left')}
            disabled={loading || leftLimit}
            title={leftLimit ? '15-word limit reached' : `Add word left (${wordsLeft}/15)`}
            aria-label="Add word to the left"
          >+</button>
        )}

        <div style={{
          flex: 1,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 18,
          lineHeight: 1.55,
          textAlign: 'center',
          letterSpacing: '0.01em',
          wordBreak: 'break-word',
          color: '#2c2416',
        }}>
          {words.map((w, i) => {
            const isOrig = i >= origIdx && i < origIdx + origBigram.length
            const isNew = i === animIdx
            const key = getWordKey(i)
            return (
              <span key={key}>
                <span style={{
                  display: 'inline-block',
                  fontWeight: isOrig ? 700 : 400,
                  color: isOrig ? '#2c2416' : '#6a5a42',
                }}>
                  {isNew ? <AnimatedWord word={w} /> : w}
                </span>
                {i < words.length - 1 ? ' ' : ''}
              </span>
            )
          })}
          {words.length === 0 && <span style={{ color: '#c8b89a' }}>…</span>}
        </div>

        {!winner && (
          <button
            style={plusBtn(loading || rightLimit)}
            onClick={() => addWord('right')}
            disabled={loading || rightLimit}
            title={rightLimit ? '15-word limit reached' : `Add word right (${wordsRight}/15)`}
            aria-label="Add word to the right"
          >+</button>
        )}
      </div>

      {/* Book icon buttons */}
      {!winner && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a8a72', textAlign: 'center', marginBottom: 12 }}>
            Guess the location
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            {books.map((book, i) => {
              const icon = BOOK_ICONS[i]
              const isRuledOut = ruledOutBooks.has(book)
              const isLockedOut = confirmedBook !== null && book !== confirmedBook
              const isDisabled = loading || isRuledOut || isLockedOut
              const enabledBooks = books.filter(b => !ruledOutBooks.has(b) && (confirmedBook === null || b === confirmedBook))
              const isLastEnabled = !isDisabled && enabledBooks.length === 1

              let title = icon?.label ?? ''
              if (isRuledOut || isLockedOut) title = 'You know the fragment is not from this book'
              else if (isLastEnabled) title = 'You know the fragment comes from this book'

              const btn = (
                <button
                  key={book}
                  onClick={() => { if (!isDisabled) { setSelectedBook(book); setSelectedChapter(null); setGuessPhase('chapter') } }}
                  disabled={isDisabled}
                  title={title}
                  style={{
                    width: 52, height: 52,
                    borderRadius: '50%',
                    border: `1.5px solid ${isDisabled ? '#e0d8cc' : '#c8b89a'}`,
                    background: isDisabled ? '#f0ece4' : '#fffdf7',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2,
                    color: isDisabled ? '#c0b8a8' : '#5a4a32',
                    boxShadow: isDisabled ? 'none' : '0 1px 3px rgba(44,36,22,0.07)',
                    transition: 'background 100ms, border-color 100ms',
                    padding: 0,
                    opacity: isDisabled ? 0.45 : 1,
                  }}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" style={{ display: 'block' }}
                    dangerouslySetInnerHTML={{ __html: icon?.svg ?? '' }} />
                  <span style={{ fontSize: 7.5, letterSpacing: '0.05em', color: isDisabled ? '#c0b8a8' : '#9a8a72', lineHeight: 1 }}>
                    {icon?.roman}
                  </span>
                </button>
              )
              if (i === 4) return <React.Fragment key={book}><div className="book-row-break" />{btn}</React.Fragment>
              return btn
            })}
          </div>
        </div>
      )}

      {/* Progress log */}
      {moveLog.length > 0 && (
        <div style={{ padding: '12px 14px', background: '#fffdf7', border: '1px solid #e0d4be', borderRadius: 6, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <p style={{ fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a8a72', margin: 0 }}>
              Progress Log
            </p>
            <span style={{ fontSize: 12, color: '#b0a090', fontFamily: "'Courier New', Courier, monospace" }}>
              {moveLog.map(m => moveEmoji(m)).join('')}
            </span>
          </div>
          <div className="move-log">
            {[...moveLog].reverse().map((m, i) => (
              <div key={i}>{moveEmoji(m)} {moveLabel(m, booksMeta)}</div>
            ))}
          </div>
        </div>
      )}

      {/* Win panel */}
      {winner && (
        <div style={{ padding: '20px 16px', background: '#fffdf7', border: '1px solid #c8b89a', borderRadius: 6, textAlign: 'center' }}>
          <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a8a72', marginBottom: 10 }}>Correct!</p>
          <p style={{ fontSize: 15, marginBottom: 3 }}>{winner.book}</p>
          <p style={{ fontSize: 13.5, color: '#5a4a32', marginBottom: 2 }}>{winner.chapter_name || winner.chapter}</p>
          <p style={{ fontSize: 10.5, color: '#9a8a72', marginBottom: 16 }}>{winner.position_pct.toFixed(1)}% into chapter</p>
          <div style={{
            background: '#f5f0e8', borderRadius: 4, padding: '10px 12px',
            textAlign: 'left', marginBottom: 16,
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: 13, lineHeight: 1.65, color: '#3a2e20',
          }}>
            {winner.context_fragment}
          </div>
          <button className="btn-primary" onClick={() => navigator.clipboard.writeText(shareText())}>
            Copy result
          </button>
          <pre style={{ marginTop: 10, fontSize: 13, color: '#9a8a72', fontFamily: "'Courier New', Courier, monospace" }}>
            {shareText()}
          </pre>
        </div>
      )}

      {/* Dialog: chapter selection */}
      {guessPhase === 'chapter' && selectedBook && (() => {
        const bookIdx = books.indexOf(selectedBook)
        const icon = BOOK_ICONS[bookIdx]
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
          <div className="dialog-backdrop" onClick={() => setGuessPhase('idle')}>
            <div className="dialog" onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}>

              {/* Fixed header */}
              <div className="dialog-header">
                <svg viewBox="0 0 24 24" width="22" height="22" style={{ flexShrink: 0, color: '#7a6a52' }}
                  dangerouslySetInnerHTML={{ __html: icon?.svg ?? '' }} />
                <span className="dialog-book-title">{selectedBook}</span>
                <button
                  className={`search-toggle${searchOpen ? ' active' : ''}`}
                  onClick={() => { setSearchOpen((o: boolean) => !o); setSearchQuery('') }}
                  title="Search chapters"
                  aria-label="Toggle chapter search"
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="10.5" cy="10.5" r="6.5"/>
                    <line x1="15.5" y1="15.5" x2="21" y2="21"/>
                  </svg>
                </button>
              </div>

              {/* Search bar */}
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

              {/* Scrollable chapter list */}
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
                      onClick={() => { if (!isGuessed) setSelectedChapter(ch) }}
                      title={isGuessed ? `Already guessed — ${guessedResult}` : undefined}
                    >
                      <span className="chapter-num">{num}</span>
                      <span className="chapter-name">{highlightMatch(name, searchQuery)}</span>
                    </button>
                  )
                })}
              </div>

              {/* Fixed bottom bar */}
              <div className="confirm-bar">
                <button className="btn-ghost" onClick={() => setGuessPhase('idle')}>Cancel</button>
                <button className="btn-primary" onClick={submitGuess} disabled={!selectedChapter || loading}>
                  Submit guess
                </button>
              </div>

            </div>
          </div>
        )
      })()}

      {/* Guess splash */}
      {splash && (
        <GuessSplash data={splash} onDismiss={() => setSplash(null)} />
      )}
    </div>
  )
}
