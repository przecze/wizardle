import { todayStr } from '../utils'
import './TitleBar.css'

interface Props {
  date: string
  onNavigate: (delta: -1 | 1) => void
}

export default function TitleBar({ date, onNavigate }: Props) {
  const isLatest = date >= todayStr()
  return (
    <header className="title-bar">
      <h1 className="title-bar__heading">Wizardle</h1>
      <div className="title-bar__nav">
        <button
          className="title-bar__nav-btn"
          onClick={() => onNavigate(-1)}
          aria-label="Previous puzzle"
        >◀</button>
        <p className="title-bar__date">{date}</p>
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
