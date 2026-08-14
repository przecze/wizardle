import { useState, useEffect, useCallback, useRef } from 'react'
import { ChapterNamesRaw, PuzzleResponse, WordResponse, GuessResponse, WinnerInfo, MoveEntry, SplashData, FragmentContextResponse } from '../types'
import { todayStr, apiFetch, buildBooksMeta, chapterTitle, hasCookie, setCookie, WEDDING_DATE } from '../utils'
import chapterNamesRaw from '../data/chapter_names.json'
import TitleBar from './TitleBar'
import TextArea from './TextArea'
import GuessButtons from './GuessButtons'
import ProgressLog from './ProgressLog'
import GuessDialog from './GuessDialog'
import GuessAnimation from './GuessAnimation'
import SuccessDialog from './SuccessDialog'
import AboutDialog from './AboutDialog'
import './Game.css'

const ABOUT_SEEN_KEY = 'wizardle_about_seen'
const MIN_LOADING_DISPLAY_MS = 1000

type GuessPhase = 'idle' | 'chapter'

interface PersistedState {
  words: string[]
  origBigram: string[]
  moveLog: MoveEntry[]
  winner: WinnerInfo | null
  showSuccess: boolean
  leftLimit: boolean
  rightLimit: boolean
  ruledOutBooks: number[]
  confirmedBook: number | null
}

function storageKey(date: string) { return `wizardle_${date}` }
function legacyStorageKey(date: string) { return `${storageKey(date)}.legacy` }

const { books: STATIC_BOOKS, booksMeta: STATIC_BOOKS_META } = buildBooksMeta(chapterNamesRaw as ChapterNamesRaw)

// Reads the puzzle data island the backend embeds in index.html (see
// backend/templates/index.html) so the client can boot without a round-trip
// to /api/puzzle. Falls back to fetching if it's missing or stale (e.g. the
// page was served before midnight UTC and is still open, or the date island
// failed to build server-side).
function readPuzzleDataIsland(date: string): PuzzleResponse | null {
  const el = document.getElementById('__puzzle_data__')
  if (!el?.textContent) return null
  try {
    const data = JSON.parse(el.textContent) as PuzzleResponse | null
    return data && data.date === date ? data : null
  } catch {
    return null
  }
}

function fetchPuzzle(date: string): Promise<PuzzleResponse> {
  const fromIsland = readPuzzleDataIsland(date)
  if (fromIsland) return Promise.resolve(fromIsland)
  return apiFetch<PuzzleResponse>(`/puzzle?date=${date}`)
}

// Older localStorage saves stored full book titles and 'chap-N' chapter strings
// (and a 'context_fragment' field) instead of the current book_num/chapter ids.
// These helpers recover the ids from whichever shape is on disk.
function legacyChapterNum(raw: unknown): number {
  if (typeof raw === 'number') return raw
  const m = String(raw).match(/(\d+)/)
  return m ? Number(m[1]) : NaN
}

function legacyBookNum(raw: unknown): number {
  if (typeof raw === 'number') return raw
  return STATIC_BOOKS.indexOf(String(raw)) + 1
}

function migrateMoveEntry(m: any): MoveEntry {
  if (m.kind !== 'guess') return m
  return {
    kind: 'guess',
    book_num: legacyBookNum(m.book_num ?? m.book),
    chapter: legacyChapterNum(m.chapter),
    correct: m.correct,
    bookCorrect: m.bookCorrect,
  }
}

function migrateWinner(w: any): WinnerInfo | null {
  if (!w) return null
  return {
    book_num: legacyBookNum(w.book_num ?? w.book),
    chapter: legacyChapterNum(w.chapter),
    full_fragment: w.full_fragment ?? w.context_fragment ?? '',
    position_pct: w.position_pct,
    bigram_start: w.bigram_start,
    bigram_len: w.bigram_len,
  }
}

function isLegacyState(parsed: any): boolean {
  if (parsed.winner && (!('book_num' in parsed.winner) || 'book' in parsed.winner)) return true
  if (Array.isArray(parsed.moveLog) && parsed.moveLog.some((m: any) => m.kind === 'guess' && (!('book_num' in m) || typeof m.chapter === 'string'))) return true
  if (Array.isArray(parsed.ruledOutBooks) && parsed.ruledOutBooks.some((b: any) => typeof b !== 'number')) return true
  if (parsed.confirmedBook != null && typeof parsed.confirmedBook !== 'number') return true
  return false
}

function migratePersistedState(parsed: any): PersistedState {
  return {
    words: parsed.words,
    origBigram: parsed.origBigram,
    moveLog: (parsed.moveLog ?? []).map(migrateMoveEntry),
    winner: migrateWinner(parsed.winner),
    showSuccess: parsed.showSuccess,
    leftLimit: parsed.leftLimit,
    rightLimit: parsed.rightLimit,
    ruledOutBooks: (parsed.ruledOutBooks ?? []).map(legacyBookNum),
    confirmedBook: parsed.confirmedBook != null ? legacyBookNum(parsed.confirmedBook) : null,
  }
}

function saveState(date: string, s: PersistedState) {
  try { localStorage.setItem(storageKey(date), JSON.stringify(s)) } catch { /* quota */ }
}

function loadSaved(date: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey(date))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isLegacyState(parsed)) return parsed as PersistedState

    // Preserve the untouched legacy record before overwriting the live key.
    const legacyKey = legacyStorageKey(date)
    if (!localStorage.getItem(legacyKey)) {
      try { localStorage.setItem(legacyKey, raw) } catch { /* quota */ }
    }
    const migrated = migratePersistedState(parsed)
    saveState(date, migrated)
    return migrated
  } catch { return null }
}

function clearSaved(date: string) {
  localStorage.removeItem(storageKey(date))
}

// Synchronously resolves the initial gameplay state (saved progress, or a
// fresh puzzle from the data island) so first render can already show the
// puzzle instead of a placeholder — avoiding the extra mount-then-fetch
// render pass that a useEffect-based load would incur.
function computeInitialGameState(date: string): PersistedState | null {
  const saved = loadSaved(date)
  if (saved) return saved

  const island = readPuzzleDataIsland(date)
  if (!island) return null

  return {
    words: island.words,
    origBigram: island.words,
    moveLog: [],
    winner: null,
    showSuccess: false,
    leftLimit: false,
    rightLimit: false,
    ruledOutBooks: [],
    confirmedBook: null,
  }
}

export default function Game() {
  const [date, setDate] = useState<string>(todayStr)
  const [refreshKey, setRefreshKey] = useState(0)
  const bootRef = useRef<PersistedState | null | undefined>(undefined)
  if (bootRef.current === undefined) bootRef.current = computeInitialGameState(date)
  const boot = bootRef.current

  const [words, setWords] = useState<string[]>(boot?.words ?? [])
  const [origBigram, setOrigBigram] = useState<string[]>(boot?.origBigram ?? [])
  const books = STATIC_BOOKS
  const booksMeta = STATIC_BOOKS_META

  const [animIdx, setAnimIdx] = useState<number | null>(null)

  const [guessPhase, setGuessPhase] = useState<GuessPhase>('idle')
  const [selectedBookNum, setSelectedBookNum] = useState<number | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null)

  const [winner, setWinner] = useState<WinnerInfo | null>(boot?.winner ?? null)
  const [showSuccess, setShowSuccess] = useState(boot?.showSuccess ?? false)
  const [moveLog, setMoveLog] = useState<MoveEntry[]>(boot?.moveLog ?? [])
  const [pendingMove, setPendingMove] = useState<MoveEntry | null>(null)
  const [pendingWinner, setPendingWinner] = useState<WinnerInfo | null>(null)
  const [splash, setSplash] = useState<SplashData | null>(null)

  const [ruledOutBooks, setRuledOutBooks] = useState<Set<number>>(new Set(boot?.ruledOutBooks ?? []))
  const [confirmedBook, setConfirmedBook] = useState<number | null>(boot?.confirmedBook ?? null)

  const [leftLimit, setLeftLimit] = useState(boot?.leftLimit ?? false)
  const [rightLimit, setRightLimit] = useState(boot?.rightLimit ?? false)

  const [fragmentContextText, setFragmentContextText] = useState<string | null>(null)
  const [fragmentContextModel, setFragmentContextModel] = useState<string | null>(null)
  const [fragmentContextLoading, setFragmentContextLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAbout, setShowAbout] = useState(() => !hasCookie(ABOUT_SEEN_KEY))
  const [flashHints, setFlashHints] = useState(false)

  // Fetch AI fragment context whenever winner is set (fires on new win and on page reload with saved state)
  useEffect(() => {
    if (!winner) {
      setFragmentContextText(null)
      setFragmentContextModel(null)
      setFragmentContextLoading(false)
      return
    }
    let ignore = false
    setFragmentContextLoading(true)
    const requestStart = Date.now()
    apiFetch<FragmentContextResponse>('/fragment-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, book_num: winner.book_num, chapter_num: winner.chapter }),
    })
      .then(data => {
        if (ignore) return
        setFragmentContextText(data.context)
        setFragmentContextModel(data.model)
      })
      .catch(() => {
        if (ignore) return
        setFragmentContextText(null)
        setFragmentContextModel(null)
      })
      .finally(() => {
        if (ignore) return
        const remaining = MIN_LOADING_DISPLAY_MS - (Date.now() - requestStart)
        if (remaining > 0) setTimeout(() => setFragmentContextLoading(false), remaining)
        else setFragmentContextLoading(false)
      })
    return () => { ignore = true }
  }, [winner, date])

  // Tracks which date `words`/`origBigram`/etc. actually belong to. Since
  // navigateDate no longer blanks state before the load effect below resolves
  // (that caused a real->blank->real flicker), this stops the persist effect
  // from writing the *previous* date's still-in-state words under the *new*
  // date's storage key during the gap between setDate and the fetch resolving.
  const loadedDateRef = useRef<string | null>(boot ? date : null)

  // Persist gameplay state whenever it changes (skip until puzzle is loaded)
  useEffect(() => {
    if (origBigram.length === 0) return
    if (loadedDateRef.current !== date) return
    saveState(date, {
      words, origBigram, moveLog, winner, showSuccess,
      leftLimit, rightLimit,
      ruledOutBooks: [...ruledOutBooks],
      confirmedBook,
    })
  }, [date, words, origBigram, moveLog, winner, showSuccess, leftLimit, rightLimit, ruledOutBooks, confirmedBook])

  // Fires on date navigation / reset. Skipped on the very first run when
  // `boot` already seeded state synchronously (see computeInitialGameState).
  const skipNextLoadRef = useRef(boot !== null)
  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false
      return
    }
    setLoading(true)
    fetchPuzzle(date)
      .then(data => {
        setAnimIdx(null)
        const saved = loadSaved(date)
        if (saved) {
          setWords(saved.words)
          setOrigBigram(saved.origBigram)
          setMoveLog(saved.moveLog)
          setWinner(saved.winner)
          setShowSuccess(saved.showSuccess)
          setLeftLimit(saved.leftLimit)
          setRightLimit(saved.rightLimit)
          setRuledOutBooks(new Set(saved.ruledOutBooks))
          setConfirmedBook(saved.confirmedBook)
        } else {
          setWords(data.words)
          setOrigBigram(data.words)
          setMoveLog([])
          setWinner(null)
          setShowSuccess(false)
          setLeftLimit(false)
          setRightLimit(false)
          setRuledOutBooks(new Set())
          setConfirmedBook(null)
        }
        loadedDateRef.current = date
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [date, refreshKey])

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
      if (data.word != null) {
        const newWord = data.word
        setWords(prev => direction === 'left' ? [newWord, ...prev] : [...prev, newWord])
        setAnimIdx(direction === 'left' ? 0 : words.length)
        setMoveLog(prev => [...prev, { kind: 'word', direction, word: newWord }])
      }
      if (data.limit_reached) {
        if (direction === 'left') setLeftLimit(true)
        else setRightLimit(true)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [loading, date, words])

  const submitGuess = useCallback(async () => {
    if (!selectedBookNum || !selectedChapter || loading) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<GuessResponse>('/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          book_num: selectedBookNum,
          chapter_num: selectedChapter,
        }),
      })
      const book = books[selectedBookNum - 1]
      const chName = chapterTitle(booksMeta, book, selectedChapter)
      const emoji = data.correct ? (date === WEDDING_DATE ? '❤️' : '💫') : data.book_correct ? '📚' : '❌'
      const resultLabel = data.correct ? 'Correct!' : data.book_correct ? 'Right book, wrong chapter' : 'Wrong book'
      setPendingMove({
        kind: 'guess',
        book_num: selectedBookNum,
        chapter: selectedChapter,
        correct: data.correct,
        bookCorrect: data.correct || !!data.book_correct,
      })
      if (data.correct && data.answer) {
        setPendingWinner({
          ...data.answer,
          book_num: selectedBookNum,
          chapter: selectedChapter,
        })
      } else {
        if (data.book_correct) {
          setConfirmedBook(selectedBookNum)
        } else {
          setRuledOutBooks(prev => new Set([...prev, selectedBookNum]))
        }
        setSelectedBookNum(null)
        setSelectedChapter(null)
      }
      setSplash({ book, chapterName: chName, emoji, resultLabel, isSuccess: data.correct })
      setGuessPhase('idle')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [selectedBookNum, selectedChapter, loading, date, books, booksMeta])

  function navigateDate(delta: -1 | 1) {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    const next = d.toISOString().slice(0, 10)
    if (next > todayStr()) return
    // Gameplay state (words, ruledOutBooks, etc.) is intentionally left as-is
    // here — the load effect below replaces it in one commit once the new
    // date's data is ready. Clearing it eagerly caused a real->blank->real
    // flicker on every navigation (only masked for the has-island date since
    // that one resolves synchronously).
    setDate(next)
    setGuessPhase('idle')
    setSelectedBookNum(null)
    setSelectedChapter(null)
    setError(null)
  }

  function handleReset() {
    clearSaved(date)
    setOrigBigram([])
    setWords([])
    setMoveLog([])
    setWinner(null)
    setShowSuccess(false)
    setLeftLimit(false)
    setRightLimit(false)
    setGuessPhase('idle')
    setSelectedBookNum(null)
    setSelectedChapter(null)
    setRuledOutBooks(new Set())
    setConfirmedBook(null)
    setError(null)
    setRefreshKey(k => k + 1)
  }

  return (
    <div className="game">

      <TitleBar date={date} onNavigate={navigateDate} />

      {error && (
        <p className="game__error">{error}</p>
      )}

      {showSuccess && winner ? (
        <SuccessDialog winner={winner} books={books} booksMeta={booksMeta} moveLog={moveLog} date={date} origBigram={origBigram} onReset={handleReset} fragmentContextText={fragmentContextText} fragmentContextModel={fragmentContextModel} fragmentContextLoading={fragmentContextLoading} />
      ) : (
        <TextArea
          words={words}
          origBigram={origBigram}
          animIdx={animIdx}
          loading={loading}
          leftLimit={leftLimit}
          rightLimit={rightLimit}
          winner={!!winner}
          flashing={flashHints}
          onAddWord={addWord}
        />
      )}

      {!winner && (
        <GuessButtons
          books={books}
          ruledOutBooks={ruledOutBooks}
          confirmedBook={confirmedBook}
          loading={loading}
          flashing={flashHints}
          onSelectBook={bookNum => { setSelectedBookNum(bookNum); setSelectedChapter(null); setGuessPhase('chapter') }}
          onAbout={() => setShowAbout(true)}
        />
      )}

      <ProgressLog moveLog={moveLog} books={books} booksMeta={booksMeta} />

      {guessPhase === 'chapter' && selectedBookNum && (
        <GuessDialog
          selectedBookNum={selectedBookNum}
          selectedChapter={selectedChapter}
          books={books}
          booksMeta={booksMeta}
          moveLog={moveLog}
          loading={loading}
          onSelectChapter={setSelectedChapter}
          onClose={() => setGuessPhase('idle')}
          onSubmit={submitGuess}
        />
      )}

      {splash && (
        <GuessAnimation data={splash} onDismiss={() => {
          if (pendingMove) { setMoveLog(prev => [...prev, pendingMove]); setPendingMove(null) }
          setSplash(null)
          if (splash.isSuccess) {
            if (pendingWinner) { setWinner(pendingWinner); setPendingWinner(null) }
            setShowSuccess(true)
          }
        }} />
      )}

      {showAbout && (
        <AboutDialog bigram={origBigram} onClose={() => {
          setCookie(ABOUT_SEEN_KEY, '1')
          setShowAbout(false)
          setFlashHints(true)
          setTimeout(() => setFlashHints(false), 1600)
        }} />
      )}

      <footer className="game__footer">
        Created by <a href="https://janczechowski.com" target="_blank" rel="noopener noreferrer">Jan Czechowski</a>
        {' | '}
        <a href="https://github.com/przecze/wizardle" target="_blank" rel="noopener noreferrer">view source on GitHub</a>
      </footer>

    </div>
  )
}
