import React from 'react'
import { BOOK_ICONS } from '../bookIcons'
import './GuessButtons.css'

interface Props {
  books: string[]
  ruledOutBooks: Set<string>
  confirmedBook: string | null
  loading: boolean
  onSelectBook: (book: string) => void
}

export default function GuessButtons({ books, ruledOutBooks, confirmedBook, loading, onSelectBook }: Props) {
  return (
    <div className="guess-buttons">
      <p className="guess-buttons__label">Guess the location</p>
      <div className="guess-buttons__grid">
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
              className={`guess-btn${isDisabled ? ' guess-btn--disabled' : ''}`}
              onClick={() => { if (!isDisabled) onSelectBook(book) }}
              disabled={isDisabled}
              title={title}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" style={{ display: 'block' }}
                dangerouslySetInnerHTML={{ __html: icon?.svg ?? '' }} />
              <span className="guess-btn__roman">{icon?.roman}</span>
            </button>
          )

          if (i === 4) return <React.Fragment key={book}><div className="book-row-break" />{btn}</React.Fragment>
          return btn
        })}
      </div>
    </div>
  )
}
