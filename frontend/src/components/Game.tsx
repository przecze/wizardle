import { useState, useEffect, useCallback } from 'react'
import { BookMeta, PuzzleResponse, WordResponse, GuessResponse, GuessAnswer, MoveEntry, SplashData } from '../types'
import { todayStr, apiFetch } from '../utils'
import TitleBar from './TitleBar'
import TextArea from './TextArea'
import GuessButtons from './GuessButtons'
import ProgressLog from './ProgressLog'
import GuessDialog from './GuessDialog'
import GuessAnimation from './GuessAnimation'
import SuccessDialog from './SuccessDialog'
import AboutDialog from './AboutDialog'
import PensieveBackdrop from './PensieveBackdrop'
import './Game.css'

type GuessPhase = 'idle' | 'chapter'

export default function Game() {
  const [date, setDate] = useState<string>(todayStr)
  const [words, setWords] = useState<string[]>([])
  const [origBigram, setOrigBigram] = useState<string[]>([])
  const [booksMeta, setBooksMeta] = useState<Record<string, BookMeta>>({})
  const [books, setBooks] = useState<string[]>([])

  const [animIdx, setAnimIdx] = useState<number | null>(null)

  const [guessPhase, setGuessPhase] = useState<GuessPhase>('idle')
  const [selectedBook, setSelectedBook] = useState<string | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)

  const [winner, setWinner] = useState<GuessAnswer | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [moveLog, setMoveLog] = useState<MoveEntry[]>([])
  const [splash, setSplash] = useState<SplashData | null>(null)

  const [ruledOutBooks, setRuledOutBooks] = useState<Set<string>>(new Set())
  const [confirmedBook, setConfirmedBook] = useState<string | null>(null)

  const [leftLimit, setLeftLimit] = useState(false)
  const [rightLimit, setRightLimit] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiFetch<PuzzleResponse>(`/puzzle?date=${date}`)
      .then(data => {
        setWords(data.words)
        setOrigBigram(data.words)
        setBooks(data.books)
        setBooksMeta(data.books_meta)
        setAnimIdx(null)
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
      setSplash({ book: selectedBook, chapterName: chName, emoji, resultLabel, isSuccess: data.correct })
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
    setShowSuccess(false)
    setLeftLimit(false)
    setRightLimit(false)
    setGuessPhase('idle')
    setSelectedBook(null)
    setSelectedChapter(null)
    setRuledOutBooks(new Set())
    setConfirmedBook(null)
    setError(null)
  }

  return (
    <div className="game">
      <PensieveBackdrop />

      <TitleBar date={date} onNavigate={navigateDate} />

      {error && (
        <p className="game__error">{error}</p>
      )}

      {showSuccess && winner ? (
        <SuccessDialog winner={winner} moveLog={moveLog} date={date} origBigram={origBigram} />
      ) : (
        <TextArea
          words={words}
          origBigram={origBigram}
          animIdx={animIdx}
          loading={loading}
          leftLimit={leftLimit}
          rightLimit={rightLimit}
          winner={!!winner}
          onAddWord={addWord}
        />
      )}

      {!winner && (
        <GuessButtons
          books={books}
          ruledOutBooks={ruledOutBooks}
          confirmedBook={confirmedBook}
          loading={loading}
          onSelectBook={book => { setSelectedBook(book); setSelectedChapter(null); setGuessPhase('chapter') }}
          onAbout={() => setShowAbout(true)}
        />
      )}

      <ProgressLog moveLog={moveLog} booksMeta={booksMeta} />

      {guessPhase === 'chapter' && selectedBook && (
        <GuessDialog
          selectedBook={selectedBook}
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
        <GuessAnimation data={splash} onDismiss={() => { setSplash(null); if (splash.isSuccess) setShowSuccess(true) }} />
      )}

      {showAbout && (
        <AboutDialog bigram={origBigram} onClose={() => setShowAbout(false)} />
      )}

    </div>
  )
}
