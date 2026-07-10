import './NewFeatureDialog.css'

interface Props {
  onClose: () => void
}

export default function NewFeatureDialog({ onClose }: Props) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="new-feature-dialog" onClick={(e) => e.stopPropagation()}>

        <div className="new-feature-header">
          Greetings, Wizardler!
        </div>

        <div className="new-feature-body">
          <span className="new-feature-badge">NEW</span>
          <p>
            Shared results now use a generic ➕ instead of directional arrows for revealed-word moves.
          </p>
          <p>
            Prefer the old look? There's a toggle on the win screen, next to the <strong>Share result</strong> button, to switch back to <strong>⬅️➡️</strong>.
          </p>
        </div>

        <div className="confirm-bar">
          <button className="btn-primary" onClick={onClose}>Got it</button>
        </div>

      </div>
    </div>
  )
}
