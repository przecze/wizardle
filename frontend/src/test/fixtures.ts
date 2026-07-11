import { PuzzleResponse, WordResponse, GuessResponse } from '../types'

export const TEST_DATE = '2026-01-15'

// Book/chapter data now comes from the real static import (frontend/src/data/chapter_names.json),
// not a mock — these fixtures reference its real, stable content (canonical chapter titles).
export const MOCK_BOOKS = [
  "Book 1: Philosopher's Stone",
  'Book 2: Chamber of Secrets',
  'Book 3: Prisoner of Azkaban',
  'Book 4: Goblet of Fire',
  'Book 5: Order of the Phoenix',
  'Book 6: Half-Blood Prince',
  'Book 7: Deathly Hallows',
]

export const MOCK_PUZZLE: PuzzleResponse = {
  date: TEST_DATE,
  words: ['dark', 'forest'],
}

export const MOCK_WORD_LEFT: WordResponse = { word: 'the', limit_reached: false }
export const MOCK_WORD_RIGHT: WordResponse = { word: 'was', limit_reached: false }

export const MOCK_GUESS_WRONG: GuessResponse = {
  correct: false,
  book_correct: false,
  answer: {
    position_pct: 42.5,
    full_fragment: 'into the dark forest and found',
    bigram_start: 2,
    bigram_len: 2,
  },
}

export const MOCK_GUESS_RIGHT_BOOK: GuessResponse = {
  correct: false,
  book_correct: true,
  answer: {
    position_pct: 42.5,
    full_fragment: 'into the dark forest and found',
    bigram_start: 2,
    bigram_len: 2,
  },
}

export const MOCK_GUESS_CORRECT: GuessResponse = {
  correct: true,
  answer: {
    position_pct: 42.5,
    full_fragment: 'into the dark forest and found',
    bigram_start: 2,
    bigram_len: 2,
  },
}
