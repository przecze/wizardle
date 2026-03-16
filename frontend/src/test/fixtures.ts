import { PuzzleResponse, WordResponse, GuessResponse, BookMeta } from '../types'

export const TEST_DATE = '2026-01-15'

export const MOCK_BOOKS = [
  "Book 1: Philosopher's Stone",
  'Book 2: Chamber of Secrets',
  'Book 3: Prisoner of Azkaban',
  'Book 4: Goblet of Fire',
  'Book 5: Order of the Phoenix',
  'Book 6: Half-Blood Prince',
  'Book 7: Deathly Hallows',
]

const minimalBook: BookMeta = {
  chapters: ['chap-1'],
  chapter_names: { 'chap-1': 'Chapter 1' },
}

export const MOCK_BOOKS_META: Record<string, BookMeta> = {
  [MOCK_BOOKS[0]]: {
    chapters: ['chap-1', 'chap-2', 'chap-3'],
    chapter_names: {
      'chap-1': 'The Boy Who Lived',
      'chap-2': 'The Vanishing Glass',
      'chap-3': 'The Letters from No One',
    },
  },
  [MOCK_BOOKS[1]]: minimalBook,
  [MOCK_BOOKS[2]]: minimalBook,
  [MOCK_BOOKS[3]]: minimalBook,
  [MOCK_BOOKS[4]]: minimalBook,
  [MOCK_BOOKS[5]]: minimalBook,
  [MOCK_BOOKS[6]]: minimalBook,
}

export const MOCK_PUZZLE: PuzzleResponse = {
  date: TEST_DATE,
  words: ['dark', 'forest'],
  books: MOCK_BOOKS,
  books_meta: MOCK_BOOKS_META,
}

export const MOCK_WORD_LEFT: WordResponse = { word: 'the', limit_reached: false }
export const MOCK_WORD_RIGHT: WordResponse = { word: 'was', limit_reached: false }

export const MOCK_GUESS_WRONG: GuessResponse = {
  correct: false,
  book_correct: false,
  answer: {
    book: MOCK_BOOKS[0],
    chapter: 'chap-1',
    chapter_name: 'The Boy Who Lived',
    position_pct: 42.5,
    context_fragment: 'into the dark forest and found',
    bigram_start: 2,
    bigram_len: 2,
  },
}

export const MOCK_GUESS_RIGHT_BOOK: GuessResponse = {
  correct: false,
  book_correct: true,
  answer: {
    book: MOCK_BOOKS[0],
    chapter: 'chap-1',
    chapter_name: 'The Boy Who Lived',
    position_pct: 42.5,
    context_fragment: 'into the dark forest and found',
    bigram_start: 2,
    bigram_len: 2,
  },
}

export const MOCK_GUESS_CORRECT: GuessResponse = {
  correct: true,
  answer: {
    book: MOCK_BOOKS[0],
    chapter: 'chap-1',
    chapter_name: 'The Boy Who Lived',
    position_pct: 42.5,
    context_fragment: 'into the dark forest and found',
    bigram_start: 2,
    bigram_len: 2,
  },
}
