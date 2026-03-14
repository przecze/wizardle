import { useState, useEffect } from 'react'
import { SplashData } from '../types'
import './GuessAnimation.css'

interface Props {
  data: SplashData
  onDismiss: () => void
}

export default function GuessAnimation({ data, onDismiss }: Props) {
  const [phase, setPhase] = useState<'hourglass' | 'result'>('hourglass')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('result'), 1200)
    const t2 = setTimeout(() => onDismiss(), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDismiss])

  return (
    <div className="splash-backdrop" onClick={onDismiss}>
      <div className="splash-card">
        <div className="splash-location">
          <div className="splash-book">{data.book}</div>
          <div className="splash-chapter">{data.chapterName}</div>
        </div>
        <div className="splash-emoji-area">
          {phase === 'hourglass'
            ? <span className="splash-hourglass">⏳</span>
            : <span className="splash-result">{data.emoji}</span>
          }
        </div>
        {phase === 'result' && (
          <div className="splash-result-label">{data.resultLabel}</div>
        )}
        <div className="splash-hint">tap to continue</div>
      </div>
    </div>
  )
}
