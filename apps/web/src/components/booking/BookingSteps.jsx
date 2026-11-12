const STEPS = ["Availability", "Guest details", "Review", "Confirmation"];

export default function BookingSteps({ current }) {
  return (
    <ol className="steps" aria-label="Booking progress">
      {STEPS.map((label, i) => (
        <li key={label} className={i === current ? "is-current" : i < current ? "is-done" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="steps__label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
