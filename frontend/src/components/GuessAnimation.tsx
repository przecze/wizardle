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
    const t1 = setTimeout(() => setPhase('result'), 1500)
    const t2 = setTimeout(() => onDismiss(), data.isSuccess ? 2500 : 3500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDismiss, data.isSuccess])

  return (
    <div className="splash-backdrop" onClick={onDismiss}>
      <div className="splash-card">
        <div className="splash-location">
          <div className="splash-book">{data.book}</div>
          <div className="splash-chapter">{data.chapterName}</div>
        </div>
        <div className="splash-emoji-area">
          {phase === 'hourglass'
            ? (
              <svg className="splash-hourglass-svg" viewBox="0 0 24 24" width="56" height="56" fill="none">
                {/* caps */}
                <rect x="4" y="2.5" width="16" height="2" rx="1" fill="#6e6890"/>
                <rect x="4" y="19.5" width="16" height="2" rx="1" fill="#6e6890"/>
                {/* top liquid */}
                <path d="M5.5 4.5 L18.5 4.5 L12 11 Z" fill="#8878c0" opacity="0.7"/>
                {/* bottom liquid */}
                <path d="M8.5 19.5 L15.5 19.5 L12 14.5 Z" fill="#8878c0" opacity="0.7"/>
                {/* glass lines */}
                <line x1="5.5" y1="4.5" x2="12" y2="11" stroke="#6e6890" strokeWidth="1.3"/>
                <line x1="18.5" y1="4.5" x2="12" y2="11" stroke="#6e6890" strokeWidth="1.3"/>
                <line x1="5.5" y1="19.5" x2="12" y2="13" stroke="#6e6890" strokeWidth="1.3"/>
                <line x1="18.5" y1="19.5" x2="12" y2="13" stroke="#6e6890" strokeWidth="1.3"/>
              </svg>
            )
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
