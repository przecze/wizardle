import './AboutDialog.css'

interface Props {
  bigram: string[]
  onClose: () => void
}

export default function AboutDialog({ bigram, onClose }: Props) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>

        <div className="about-bigram">
          {bigram.join(' ')}
        </div>

        <div className="about-body">
          <p>
            These two words appear together <strong>exactly once</strong> in the whole Harry Potter books series.
          </p>
          <p>
            Can you guess the <strong>exact chapter</strong>?
          </p>
          <p>
            If you need a <strong>hint</strong> you can reveal additional words
            before and after the phrase.
          </p>
          <p>
            Try to get to the right answer with the minimal number of hints and
            incorrect guesses.
          </p>
        </div>

        <div className="confirm-bar">
          <button className="btn-primary" onClick={onClose}>Got it</button>
        </div>

      </div>
    </div>
  )
}
