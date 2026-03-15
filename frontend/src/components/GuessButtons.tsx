import React from 'react'
import './GuessButtons.css'

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

interface Props {
  books: string[]
  ruledOutBooks: Set<string>
  confirmedBook: string | null
  loading: boolean
  onSelectBook: (book: string) => void
  onAbout: () => void
}

export default function GuessButtons({ books, ruledOutBooks, confirmedBook, loading, onSelectBook, onAbout }: Props) {
  return (
    <div className="guess-buttons">
      <p className="guess-buttons__label">
        Guess the location
        <button className="guess-buttons__about" onClick={onAbout} aria-label="How to play">?</button>
      </p>
      <div className="guess-buttons__grid">
        {books.map((book, i) => {
          const isRuledOut = ruledOutBooks.has(book)
          const isLockedOut = confirmedBook !== null && book !== confirmedBook
          const isDisabled = loading || isRuledOut || isLockedOut
          const enabledBooks = books.filter(b => !ruledOutBooks.has(b) && (confirmedBook === null || b === confirmedBook))
          const isLastEnabled = !isDisabled && enabledBooks.length === 1

          let title = book
          if (isRuledOut || isLockedOut) title = 'You know the fragment is not from this book'
          else if (isLastEnabled) title = 'You know the fragment comes from this book'

          const btn = (
            <button
              key={book}
              className={`guess-btn${isDisabled ? ' guess-btn--disabled' : ''}`}
              onClick={() => { if (!isDisabled) onSelectBook(book) }}
              disabled={isDisabled}
              title={title}
            >
              {ROMANS[i]}
            </button>
          )

          if (i === 4) return <React.Fragment key={book}><div className="book-row-break" />{btn}</React.Fragment>
          return btn
        })}
      </div>
    </div>
  )
}
