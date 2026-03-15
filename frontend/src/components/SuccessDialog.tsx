import { useState, useRef, useEffect } from 'react'
import { GuessAnswer, MoveEntry } from '../types'
import { moveEmoji, parseChapterNum } from '../utils'
import './SuccessDialog.css'

interface Props {
  winner: GuessAnswer
  moveLog: MoveEntry[]
  date: string
  origBigram: string[]
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatReadableDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']
  return `${months[month - 1]} ${ordinal(day)} ${year}`
}

export default function SuccessDialog({ winner, moveLog, date, origBigram }: Props) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chapNum = parseChapterNum(winner.chapter)
  const tokens = winner.context_fragment.split(' ')

  useEffect(() => {
    return () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }
  }, [])

  function shareText(): string {
    const bigram = origBigram.join(' ')
    const q = bigram.includes('"') ? "'" : '"'
    const emojis = moveLog.map(m => moveEmoji(m)).join('')
    return `wizardle.janczechowski.com\n${formatReadableDate(date)}\n${q}...${bigram}...${q}\n${emojis}`
  }

  async function handleShare() {
    const text = shareText()
    const isMobile = navigator.maxTouchPoints > 0
    if (isMobile && navigator.share) {
      try { await navigator.share({ text }) } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      copiedTimer.current = setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="success-dialog">
      <p className="success-dialog__book">📚 {winner.book} 📚</p>
      <p className="success-dialog__chapter">
        ✨ Chapter {chapNum}{winner.chapter_name ? `: ${winner.chapter_name}` : ''} ✨
      </p>

      <div className="success-dialog__fragment">
        <span className="word-placeholder">… </span>
        {tokens.map((tok, i) => {
          const isOrig = i >= winner.bigram_start && i < winner.bigram_start + winner.bigram_len
          return (
            <span key={i}>
              <span className={`word-token${isOrig ? ' word-token--orig' : ''}`}>{tok}</span>
              {i < tokens.length - 1 ? ' ' : ''}
            </span>
          )
        })}
        <span className="word-placeholder"> …</span>
      </div>

      <p className="success-dialog__position">{winner.position_pct.toFixed(1)}% into chapter</p>

      <div className="success-dialog__share-wrap">
        <button className="btn-primary success-dialog__share" onClick={handleShare}>
          Share result
        </button>
        {copied && <span className="success-dialog__toast">Copied to clipboard!</span>}
      </div>
    </div>
  )
}
