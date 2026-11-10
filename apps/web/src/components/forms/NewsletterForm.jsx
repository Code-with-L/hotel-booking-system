import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { isEmail } from "@/utils/validators.js";
import { subscribeNewsletter } from "@/services/enquiryService.js";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!isEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await subscribeNewsletter(email.trim());
      setDone(true);
    } catch (err) {
      setError(err.message || "Could not subscribe you right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="newsletter__done" role="status">
        Thank you — you've been added to the list for The Stillhouse letters.
      </p>
    );
  }

  return (
    <form className="newsletter" onSubmit={submit} noValidate>
      <label htmlFor="newsletter-email" className="meta">
        Letters from the valley
      </label>
      <div className="newsletter__row">
        <input
          id="newsletter-email"
          type="email"
          autoComplete="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? "newsletter-error" : undefined}
        />
        <button type="submit" disabled={busy} aria-label="Subscribe to newsletter">
          <ArrowRight size={18} strokeWidth={1.5} />
        </button>
      </div>
      {error && (
        <p id="newsletter-error" className="field__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
