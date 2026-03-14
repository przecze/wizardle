import { useRef } from 'react'
import './TextArea.css'

interface Props {
  words: string[]
  origBigram: string[]
  animIdx: number | null
  loading: boolean
  leftLimit: boolean
  rightLimit: boolean
  winner: boolean
  onAddWord: (direction: 'left' | 'right') => void
}

function AnimatedWord({ word }: { word: string }) {
  return (
    <>
      {word.split('').map((ch, i) => (
        <span key={i} className="char-animated" style={{ animationDelay: `${i * 35}ms` }}>
          {ch}
        </span>
      ))}
    </>
  )
}

export default function TextArea({ words, origBigram, animIdx, loading, leftLimit, rightLimit, winner, onAddWord }: Props) {
  const wordKeys = useRef<Map<number, number>>(new Map())
  const keyCounter = useRef(0)
  const prevAnimIdx = useRef<number | null>(null)

  // Invalidate the key for the newly added word so AnimatedWord remounts
  if (animIdx !== null && animIdx !== prevAnimIdx.current) {
    wordKeys.current.delete(animIdx)
    prevAnimIdx.current = animIdx
  }

  function getWordKey(idx: number): number {
    if (!wordKeys.current.has(idx)) {
      wordKeys.current.set(idx, keyCounter.current++)
    }
    return wordKeys.current.get(idx)!
  }

  const origIdx = words.indexOf(origBigram[0])
  const safeOrigIdx = origIdx > 0 ? origIdx : 0
  const wordsLeft = safeOrigIdx
  const wordsRight = words.length - safeOrigIdx - origBigram.length

  const leftDisabled = loading || leftLimit
  const rightDisabled = loading || rightLimit

  return (
    <div className="text-area">
      {!winner && (
        <button
          className={`text-area__plus${leftDisabled ? ' text-area__plus--disabled' : ''}`}
          onClick={() => onAddWord('left')}
          disabled={leftDisabled}
          title={leftLimit ? '15-word limit reached' : `Add word left (${wordsLeft}/15)`}
          aria-label="Add word to the left"
        >+</button>
      )}

      <div className="text-area__content">
        {words.map((w, i) => {
          const isOrig = i >= origIdx && i < origIdx + origBigram.length
          const isNew = i === animIdx
          const key = getWordKey(i)
          return (
            <span key={key}>
              <span className={`text-area__word${isOrig ? ' text-area__word--orig' : ''}`}>
                {isNew ? <AnimatedWord word={w} /> : w}
              </span>
              {i < words.length - 1 ? ' ' : ''}
            </span>
          )
        })}
        {words.length === 0 && <span className="text-area__placeholder">…</span>}
      </div>

      {!winner && (
        <button
          className={`text-area__plus${rightDisabled ? ' text-area__plus--disabled' : ''}`}
          onClick={() => onAddWord('right')}
          disabled={rightDisabled}
          title={rightLimit ? '15-word limit reached' : `Add word right (${wordsRight}/15)`}
          aria-label="Add word to the right"
        >+</button>
      )}
    </div>
  )
}
