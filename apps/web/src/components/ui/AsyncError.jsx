/** Consistent async error state: what failed, why, and a single retry action. */
export default function AsyncError({
  title = "We couldn't load this right now.",
  detail,
  onRetry,
  retryLabel = "Try again",
  className = "",
}) {
  return (
    <div className={`async-error ${className}`.trim()} role="alert">
      <p className="async-error__title">{title}</p>
      <p className="async-error__detail">{detail || "Check your connection and try again. If it keeps failing, the front desk can always help on WhatsApp."}</p>
      {onRetry && (
        <button type="button" className="btn btn--outline btn--sm" onClick={onRetry}>{retryLabel}</button>
      )}
    </div>
  );
}
