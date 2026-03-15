export interface BookMeta {
  chapters: string[]
  chapter_names: Record<string, string>
}

export interface PuzzleResponse {
  date: string
  words: string[]
  books: string[]
  books_meta: Record<string, BookMeta>
}

export interface WordResponse {
  word: string | null
  limit_reached: boolean
}

export interface GuessAnswer {
  book: string
  chapter: string
  chapter_name: string
  position_pct: number
  context_fragment: string
  bigram_start: number
  bigram_len: number
}

export interface GuessResponse {
  correct: boolean
  book_correct?: boolean
  answer: GuessAnswer | null
}

export type MoveEntry =
  | { kind: 'word'; direction: 'left' | 'right'; word: string }
  | { kind: 'guess'; book: string; chapter: string; chapterName: string; correct: boolean; bookCorrect: boolean }

export interface SplashData {
  book: string
  chapterName: string
  emoji: string
  resultLabel: string
  isSuccess?: boolean
}
