import React, { useRef } from 'react'
import { RevealedWords } from '../revealedWords'
import './TextArea.css'

interface Props {
  revealed: RevealedWords
  animIdx: number | null
  loading: boolean
  leftLimit: boolean
  rightLimit: boolean
  winner: boolean
  flashing: boolean
  onAddWord: (direction: 'left' | 'right') => void
}

function AnimatedWord({ word }: { word: string }) {
  return (
    <>
      {word.split('').map((ch, i) => (
        <span key={i} className="char-animated" style={{ '--char-index': i } as React.CSSProperties}>
          {ch}
        </span>
      ))}
    </>
  )
}

export default function TextArea({ revealed, animIdx, loading, leftLimit, rightLimit, winner, flashing, onAddWord }: Props) {
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

  const words = revealed.toArray()
  const leftDisabled = loading || leftLimit
  const rightDisabled = loading || rightLimit

  return (
    <div className="text-area">
      {!winner && (
        <button
          className={`text-area__plus${leftDisabled ? ' text-area__plus--disabled' : ''}${flashing && !leftDisabled ? ' flash-hint' : ''}`}
          onClick={() => onAddWord('left')}
          disabled={leftDisabled}
          title={leftLimit ? 'Max 15 words can be revealed on either side' : `Add word left (${revealed.wordsLeft}/15)`}
          aria-label="Add word to the left"
        >+</button>
      )}

      <div className="text-area__content">
        {words.map((w, i) => {
          const isNew = i === animIdx
          const key = getWordKey(i)
          return (
            <span key={key}>
              <span className={`word-token${revealed.isOrig(i) ? ' word-token--orig' : ''}`}>
                {isNew ? <AnimatedWord word={w} /> : w}
              </span>
              {i < words.length - 1 ? ' ' : ''}
            </span>
          )
        })}
        {words.length === 0 && <span className="word-placeholder">…</span>}
      </div>

      {!winner && (
        <button
          className={`text-area__plus${rightDisabled ? ' text-area__plus--disabled' : ''}${flashing && !rightDisabled ? ' flash-hint' : ''}`}
          onClick={() => onAddWord('right')}
          disabled={rightDisabled}
          title={rightLimit ? 'Max 15 words can be revealed on either side' : `Add word right (${revealed.wordsRight}/15)`}
          aria-label="Add word to the right"
        >+</button>
      )}
    </div>
  )
}
