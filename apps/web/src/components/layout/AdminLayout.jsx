import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BedDouble, CalendarDays, ChartColumn, LayoutDashboard, Settings, Tag, Users, Banknote } from "lucide-react";
import { formatDateLong, todayISO } from "@/utils/dates.js";
import { useAuth } from "@/features/guest-account/AuthContext.jsx";
import { TextField } from "@/components/forms/Fields.jsx";
import Button from "@/components/ui/Button.jsx";

const ITEMS = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/reservations", label: "Reservations", icon: CalendarDays },
  { to: "/admin/rooms", label: "Rooms", icon: BedDouble },
  { to: "/admin/guests", label: "Guests", icon: Users },
  { to: "/admin/rates", label: "Rates", icon: Tag },
  { to: "/admin/reports", label: "Reports", icon: ChartColumn },
  { to: "/admin/financials", label: "Financials", icon: Banknote },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const STAFF_ROLES = ["receptionist", "manager", "admin"];

/** Staff sign-in gate. Server enforces RBAC regardless - this only controls what the UI shows. */
function StaffSignIn({ onDone }) {
  const { signIn } = useAuth();
  const [values, setValues] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await signIn(values);
    if (!res.ok) {
      setError(res.errors?.email || res.errors?.form || "Could not sign in.");
      setBusy(false);
      return;
    }
    onDone?.();
  };

  return (
    <div className="signin">
      <div className="signin__intro">
        <p className="eyebrow eyebrow--olive">Operations</p>
        <h1 className="h-xl">Staff sign in.</h1>
        <p className="lede">Front-desk and management access. Use your staff credentials.</p>
      </div>
      <form className="signin__form" onSubmit={submit} noValidate>
        <TextField id="st-email" label="Staff email" type="email" autoComplete="username" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
        <TextField id="st-password" label="Password" type="password" autoComplete="current-password" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} error={error} />
        <Button type="submit" arrow disabled={busy}>{busy ? "Signing in." : "Sign in"}</Button>
      </form>
    </div>
  );
}

/** Separate operational environment: same identity, higher information density. */
export default function AdminLayout() {
  const { pathname } = useLocation();
  const { account, loading, signOut } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.title = "Operations — The Stillhouse";
  }, [pathname]);

  const isStaff = Boolean(account && (account.roles || []).some((r) => STAFF_ROLES.includes(r)));

  if (loading) {
    return (
      <div className="admin">
        <div className="admin__main">
          <div className="admin__content"><p className="small" aria-live="polite">Checking your session…</p></div>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="admin">
        <div className="admin__main">
          <div className="admin__content">
            <StaffSignIn onDone={() => {}} />
            {account && (
              <p className="small">
                Signed in as {account.email}, but this account has no staff role.{" "}
                <button className="link-arrow" onClick={() => signOut()}><span>Sign out</span></button>
              </p>
            )}
            <p className="small"><Link to="/">← Public website</Link></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin">
      <aside className="admin__side">
        <Link to="/admin" className="wordmark admin__brand">The Stillhouse</Link>
        <p className="meta admin__sub">Operations</p>
        <nav className="admin__nav" aria-label="Administration">
          {ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="admin__link">
              <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="admin__exit meta link-arrow" onClick={() => signOut().then(() => navigate("/"))}>Sign out of staff area</button>
        <Link to="/" className="admin__exit meta">← Public website</Link>
      </aside>
      <div className="admin__main">
        <div className="admin__top">
          <p className="meta">{formatDateLong(todayISO())}</p>
          <p className="meta">{account.email} · {account.roles.filter((r) => STAFF_ROLES.includes(r)).join(", ")}</p>
        </div>
        <div className="admin__content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
