import './PensieveBottom.css'

interface Props {
  earliestDate: string
}

export default function PensieveBottom({ earliestDate }: Props) {
  return (
    <div className="pensieve-bottom">
      <div className="pensieve-bottom__swirl" aria-hidden="true">🌀</div>
      <p className="pensieve-bottom__title">Congratulations, you've reached the bottom of the Pensieve</p>
      <p className="pensieve-bottom__body">
        {earliestDate} was the earliest Wizardle puzzle available to play.
      </p>
    </div>
  )
}
