import { useState } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";
import { TextField } from "@/components/forms/Fields.jsx";
import Button from "@/components/ui/Button.jsx";
import { request, minorToMajor } from "@/services/api.js";
import { formatKsh } from "@/utils/format.js";
import { formatDateLong } from "@/utils/dates.js";

const OAUTH_ERRORS = {
  "google-not-configured": "Google sign-in is not configured yet. Use your email and password above.",
  "google-failed": "Google sign-in failed. Please try again or use your email and password above.",
  "google-cancelled": "Google sign-in was cancelled.",
};
const GoogleGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.89 2.7-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.35-1.59-5.06-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.94 10.7a5.4 5.4 0 0 1 0-3.4V4.97H.96a9 9 0 0 0 0 8.06l2.98-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.97l2.98 2.33C4.65 5.17 6.65 3.58 9 3.58z"/>
  </svg>
);

function ReservationLookup() {
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      const data = await request(`/reservations/${encodeURIComponent(reference.trim())}?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      setResult(data);
    } catch (err) {
      setError(err?.status === 404 || err?.status === 403
        ? "No reservation found for that reference and email address."
        : "Could not check that reservation right now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lookup">
      <p className="eyebrow">Track my booking</p>
      <p className="small">Reserved without an account? Enter the booking reference and the email you used and we&apos;ll show the booking&apos;s status.</p>
      <form className="lookup__form" onSubmit={submit} noValidate>
        <TextField id="lookup-reference" label="Booking reference" autoComplete="off" placeholder="STL-2026-…" value={reference} onChange={(e) => setReference(e.target.value)} required />
        <TextField id="lookup-email" label="Email used for the booking" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {error && <p className="form-alert" role="alert">{error}</p>}
        <Button type="submit" variant="text" disabled={busy || !reference.trim() || !email.trim()}>{busy ? "Checking…" : "Check booking"}</Button>
      </form>
      {result && (
        <div className="lookup__result" aria-live="polite">
          <p className="eyebrow">{result.reference}</p>
          <p className="lede">{result.room?.name} · {formatDateLong(result.checkIn)} – {formatDateLong(result.checkOut)}</p>
          <p className="small">Status: <strong>{result.status}</strong> · Total {formatKsh(minorToMajor(result.pricing?.totalMinor || 0))}</p>
          <p className="small">Sign in above with this email to see full details, or message the front desk on WhatsApp with this reference.</p>
        </div>
      )}
    </div>
  );
}

function SignInPanel() {
  const { signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const oauthError = searchParams.get("error");
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await signIn(values);
    setErrors(res.ok ? {} : res.errors || { form: "Could not sign in." });
    setBusy(false);
  };

  return (
    <div className="signin">
      <div className="signin__intro">
        <p className="eyebrow eyebrow--olive">My reservation</p>
        <h1 className="h-xl">Welcome back.</h1>
        <p className="lede">Sign in to view upcoming stays, past stays and your guest profile.</p>
      </div>
      <form className="signin__form" onSubmit={submit} noValidate>
        <TextField id="si-email" label="Email" type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} error={errors.email} />
        <TextField id="si-password" label="Password" type="password" autoComplete="current-password" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} error={errors.password} />
        {errors.form && <p className="form-alert" role="alert">{errors.form}</p>}
        <Button type="submit" arrow disabled={busy}>{busy ? "Signing in." : "Sign in"}</Button>
      </form>
      <div className="signin__oauth">
        <p className="signin__or"><span>or</span></p>
        <a className="btn--google" href="/api/v1/auth/google" data-testid="sign-in-google">
          <GoogleGlyph />
          Continue with Google
        </a>
        {oauthError && <p className="form-alert" role="alert">{OAUTH_ERRORS[oauthError] || "Google sign-in failed."}</p>}
      </div>
      <ReservationLookup />
    </div>
  );
}

const TABS = [
  { to: "/account", label: "Overview", end: true },
  { to: "/account/reservations", label: "Reservations" },
  { to: "/account/profile", label: "Profile" },
];

/** Account pages behind a real session (server-verified). */
export default function AccountShell({ children }) {
  const { account, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="page-top account">
        <div className="container">
          <p className="small" aria-live="polite">Checking your session…</p>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="page-top account">
        <div className="container">
          <SignInPanel />
        </div>
      </div>
    );
  }

  return (
    <div className="page-top account">
      <div className="container">
        <div className="account__bar">
          <nav className="tabs" aria-label="Account">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className="tabs__link">
                {t.label}
              </NavLink>
            ))}
          </nav>
          <button
            className="signout"
            onClick={() => {
              signOut().then(() => navigate("/account"));
            }}
          >
            <LogOut size={15} strokeWidth={1.5} aria-hidden="true" /> Sign out
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
