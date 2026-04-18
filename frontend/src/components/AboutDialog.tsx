import './AboutDialog.css'

interface Props {
  bigram: string[]
  onClose: () => void
}

export default function AboutDialog({ bigram, onClose }: Props) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="about-dialog" onClick={(e) => e.stopPropagation()}>

        <div className="about-header">
          Welcome to Wizardle 💫
        </div>

        <div className="about-bigram">
          <span className="about-bigram__surround">…</span>
          {' '}
          {bigram.join(' ')}
          {' '}
          <span className="about-bigram__surround">…</span>
        </div>

        <div className="about-body">
          <p>
            These two words appear together <strong>exactly once</strong> in the whole <strong>Harry Potter book series</strong>.
          </p>
          <p>
            Can you guess the <strong>exact chapter</strong>?
          </p>
          <p>
            <span className="about-inline-btn">I</span>
            {' '}
            <span className="about-inline-btn">VI</span>
            {' '}— tap to <strong>pick the book</strong>, then select <strong>the chapter</strong>.
          </p>
          <p>
            <span className="about-inline-plus">+</span>
            {' '}
            <span className="about-inline-plus">+</span>
            {' '}— reveal <strong>additional words</strong> before or after the fragment if you need a <strong>hint</strong>.
          </p>
          <p>
            Try to get the right answer with the fewest hints and incorrect guesses.
          </p>
          <p className="about-good-luck">
            Good luck!
          </p>
        </div>

        <div className="confirm-bar">
          <button className="btn-primary" onClick={onClose}>Got it</button>
        </div>

      </div>
    </div>
  )
}
