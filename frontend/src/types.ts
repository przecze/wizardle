export interface BookMeta {
  chapters: number[]
  chapter_names: Record<number, string>
}

export interface PuzzleResponse {
  date: string
  words: string[]
}

// Raw shape of the static chapter_names.json asset — an ordered list (list order
// is the canonical book order, matching the physical order in the source text).
export interface ChapterNamesEntry {
  book: string
  chapters: Record<string, string>
}
export type ChapterNamesRaw = ChapterNamesEntry[]

export interface WordResponse {
  word: string | null
  limit_reached: boolean
}

// Server only confirms the win and provides what it alone knows (the fragment
// text and its position) — book/chapter/title are already known by the client
// from the guess it just submitted, so the server doesn't resend them.
export interface GuessAnswer {
  full_fragment: string
  position_pct: number
  bigram_start: number
  bigram_len: number
}

export interface GuessResponse {
  correct: boolean
  book_correct?: boolean
  answer: GuessAnswer | null
}

// Client-composed winning-guess info: the book/chapter identity the player
// already guessed (as ids — titles are resolved via books/booksMeta at render
// time), merged with the server's GuessAnswer confirmation.
export interface WinnerInfo extends GuessAnswer {
  book_num: number
  chapter: number
}

export type MoveEntry =
  | { kind: 'word'; direction: 'left' | 'right'; word: string }
  | { kind: 'guess'; book_num: number; chapter: number; correct: boolean; bookCorrect: boolean }

export interface SplashData {
  book: string
  chapterName: string
  emoji: string
  resultLabel: string
  isSuccess?: boolean
}

export interface FragmentContextResponse {
  context: string
  model: string
  cached: boolean
}
