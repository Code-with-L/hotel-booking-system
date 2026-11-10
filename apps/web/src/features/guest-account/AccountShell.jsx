import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";
import { TextField } from "@/components/forms/Fields.jsx";
import Button from "@/components/ui/Button.jsx";

function SignInPanel() {
  const { signIn } = useAuth();
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
