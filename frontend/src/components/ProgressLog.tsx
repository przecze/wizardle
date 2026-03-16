import { useRef } from 'react'
import { MoveEntry, BookMeta } from '../types'
import { moveEmoji, ROMANS, parseChapterNum } from '../utils'
import './ProgressLog.css'

interface Props {
  moveLog: MoveEntry[]
  booksMeta: Record<string, BookMeta>
}

function MoveLabel({ m, booksMeta }: { m: MoveEntry; booksMeta: Record<string, BookMeta> }) {
  if (m.kind === 'word') {
    return <span>added word on the {m.direction}: <span className="move-log__badge">{m.word}</span></span>
  }
  const bookNumStr = m.book.match(/Book (\d+)/)?.[1] ?? '?'
  const bookRoman = ROMANS[parseInt(bookNumStr) - 1] ?? bookNumStr
  const chNum = parseChapterNum(m.chapter)
  const chName = booksMeta[m.book]?.chapter_names[m.chapter] || m.chapter
  const result = m.correct ? 'Correct!' : m.bookCorrect ? 'Right book, wrong chapter' : 'Wrong book'
  return (
    <span>Book {bookRoman}, Ch. {chNum} <span className="move-log__chapter">{chName}</span> → {result}</span>
  )
}

export default function ProgressLog({ moveLog, booksMeta }: Props) {
  const prevLengthRef = useRef(moveLog.length)
  const latestAnimIdxRef = useRef<number | null>(null)

  if (moveLog.length > prevLengthRef.current) {
    latestAnimIdxRef.current = moveLog.length - 1
    prevLengthRef.current = moveLog.length
  }

  if (moveLog.length === 0) return null

  return (
    <div className="progress-log">
      <div className="progress-log__header">
        <p className="progress-log__title">Progress Log</p>
        <span className="progress-log__emoji-trail">
          {moveLog.map(m => moveEmoji(m)).join('')}
        </span>
      </div>
      <div className="move-log">
        {[...moveLog].reverse().map((m, _i, arr) => {
          const origIdx = arr.length - 1 - _i
          const isNew = origIdx === latestAnimIdxRef.current
          return (
            <div key={origIdx} className={isNew ? 'move-log__entry--new' : ''}>
              {moveEmoji(m)} <MoveLabel m={m} booksMeta={booksMeta} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
