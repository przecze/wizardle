import { canViewFuture, todayStr } from '../utils'
import './TitleBar.css'

interface Props {
  date: string
  atEarliest: boolean
  onNavigate: (delta: -1 | 1) => void
}

export default function TitleBar({ date, atEarliest, onNavigate }: Props) {
  const isLatest = !canViewFuture() && date >= todayStr()
  return (
    <header className="title-bar">
      <h1 className="title-bar__heading">Wizardle</h1>
      <div className="title-bar__nav">
        <button
          className="title-bar__nav-btn"
          onClick={() => onNavigate(-1)}
          disabled={atEarliest}
          aria-label="Previous puzzle"
        >◀</button>
        {/* Hidden (not removed) past the earliest puzzle so the arrows don't shift */}
        <p className={atEarliest ? 'title-bar__date title-bar__date--hidden' : 'title-bar__date'}>{date}</p>
        <button
          className="title-bar__nav-btn"
          onClick={() => onNavigate(1)}
          disabled={isLatest}
          aria-label="Next puzzle"
        >▶</button>
      </div>
    </header>
  )
}
