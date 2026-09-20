// Tracks the words revealed so far around the puzzle's original bigram.
// Callers never need to know how the original bigram's position is tracked
// internally (an index that shifts on left-reveals) — they just ask this
// object for the ordered word list, which positions are part of the
// original bigram, and how many words have been revealed each direction.
export interface RevealedWordsData {
  words: string[]
  origIdx: number
}

// Older localStorage saves predate origIdx tracking and only recorded the
// words and origBigram. Fall back to a first-match search to reconstruct
// it — the same approach that used to live in the UI layer and could
// mis-highlight if origBigram's first word recurs earlier in `words`, but
// it's the best we can do after the fact, and only runs once per legacy save.
function fallbackOrigIdx(words: string[], origBigram: string[]): number {
  const idx = words.indexOf(origBigram[0])
  return idx > 0 ? idx : 0
}

export class RevealedWords {
  private constructor(
    private readonly words: string[],
    private readonly origIdx: number,
    private readonly origLen: number,
  ) {}

  static fromOrigBigram(origBigram: string[]): RevealedWords {
    return new RevealedWords([...origBigram], 0, origBigram.length)
  }

  static fromData(data: RevealedWordsData, origBigram: string[]): RevealedWords {
    const origIdx = typeof data.origIdx === 'number' ? data.origIdx : fallbackOrigIdx(data.words, origBigram)
    return new RevealedWords(data.words, origIdx, origBigram.length)
  }

  toArray(): string[] {
    return this.words
  }

  get length(): number {
    return this.words.length
  }

  get wordsLeft(): number {
    return this.origIdx
  }

  get wordsRight(): number {
    return this.words.length - this.origIdx - this.origLen
  }

  isOrig(i: number): boolean {
    return i >= this.origIdx && i < this.origIdx + this.origLen
  }

  get origBigram(): string[] {
    return this.words.slice(this.origIdx, this.origIdx + this.origLen)
  }

  // Index the newly revealed word will land at, for animation/key purposes.
  nextIndex(direction: 'left' | 'right'): number {
    return direction === 'left' ? 0 : this.words.length
  }

  addWord(direction: 'left' | 'right', word: string): RevealedWords {
    return direction === 'left'
      ? new RevealedWords([word, ...this.words], this.origIdx + 1, this.origLen)
      : new RevealedWords([...this.words, word], this.origIdx, this.origLen)
  }

  toData(): RevealedWordsData {
    return { words: this.words, origIdx: this.origIdx }
  }
}
