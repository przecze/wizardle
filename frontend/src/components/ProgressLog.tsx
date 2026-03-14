import { MoveEntry, BookMeta } from '../types'
import { moveEmoji, moveLabel } from '../utils'
import './ProgressLog.css'

interface Props {
  moveLog: MoveEntry[]
  booksMeta: Record<string, BookMeta>
}

export default function ProgressLog({ moveLog, booksMeta }: Props) {
  if (moveLog.length === 0) return null

  return (
    <div className="progress-log">
      <div className="progress-log__header">
        <p className="progress-log__title">Progress Log</p>
        <span className="progress-log__emoji-trail">
          {moveLog.map(m => moveEmoji(m)).join('')}
        </span>
      </div>
      <div className="move-log">
        {[...moveLog].reverse().map((m, i) => (
          <div key={i}>{moveEmoji(m)} {moveLabel(m, booksMeta)}</div>
        ))}
      </div>
    </div>
  )
}
