/** Route-chunk fallback. Brand-colored shell; never a spinner on a blank page. */
export default function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-label="Loading page">
      <span className="route-fallback__wordmark">The Stillhouse</span>
    </div>
  );
}
