import { GuessAnswer, MoveEntry } from '../types'
import { moveEmoji } from '../utils'
import './SuccessDialog.css'

interface Props {
  winner: GuessAnswer
  moveLog: MoveEntry[]
  date: string
}

export default function SuccessDialog({ winner, moveLog, date }: Props) {
  function shareText(): string {
    return `Wizardle ${date}\n${moveLog.map(m => moveEmoji(m)).join('')}`
  }

  return (
    <div className="success-dialog">
      <p className="success-dialog__label">Correct!</p>
      <p className="success-dialog__book">{winner.book}</p>
      <p className="success-dialog__chapter">{winner.chapter_name || winner.chapter}</p>
      <p className="success-dialog__position">{winner.position_pct.toFixed(1)}% into chapter</p>
      <div className="success-dialog__fragment">{winner.context_fragment}</div>
      <button className="btn-primary" onClick={() => navigator.clipboard.writeText(shareText())}>
        Copy result
      </button>
      <pre className="success-dialog__share">{shareText()}</pre>
    </div>
  )
}
