import { Fragment } from 'react'
import { ROMANS } from '../utils'
import './GuessButtons.css'

interface Props {
  books: string[]
  ruledOutBooks: Set<number>
  confirmedBook: number | null
  loading: boolean
  flashing: boolean
  onSelectBook: (bookNum: number) => void
  onAbout: () => void
}

export default function GuessButtons({ books, ruledOutBooks, confirmedBook, loading, flashing, onSelectBook, onAbout }: Props) {
  return (
    <div className="guess-buttons">
      <p className="guess-buttons__label">
        Guess the location
        <button className="guess-buttons__about" onClick={onAbout} aria-label="How to play">?</button>
      </p>
      <div className="guess-buttons__grid">
        {books.map((book, i) => {
          const bookNum = i + 1
          const isRuledOut = ruledOutBooks.has(bookNum)
          const isLockedOut = confirmedBook !== null && bookNum !== confirmedBook
          const isDisabled = loading || isRuledOut || isLockedOut
          const enabledCount = books.filter((_, j) => !ruledOutBooks.has(j + 1) && (confirmedBook === null || j + 1 === confirmedBook)).length
          const isLastEnabled = !isDisabled && enabledCount === 1

          let title = book
          if (isRuledOut || isLockedOut) title = 'You know the fragment is not from this book'
          else if (isLastEnabled) title = 'You know the fragment comes from this book'

          const btn = (
            <button
              key={book}
              className={`guess-btn${isDisabled ? ' guess-btn--disabled' : ''}${flashing && !isDisabled ? ' flash-hint' : ''}`}
              onClick={() => { if (!isDisabled) onSelectBook(bookNum) }}
              disabled={isDisabled}
              title={title}
            >
              {ROMANS[i]}
            </button>
          )

          if (i === 4) return <Fragment key={book}><div className="book-row-break" />{btn}</Fragment>
          return btn
        })}
      </div>
    </div>
  )
}
