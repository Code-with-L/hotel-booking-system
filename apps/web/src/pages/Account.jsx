import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AccountShell from "@/features/guest-account/AccountShell.jsx";
import { useAuth } from "@/features/guest-account/AuthContext.jsx";
import { listGuestReservations } from "@/services/reservationService.js";
import Button from "@/components/ui/Button.jsx";
import { formatDate } from "@/utils/dates.js";
import { formatKsh } from "@/utils/format.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

function Overview() {
  const { account } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    let live = true;
    listGuestReservations(account.email).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [account.email]);

  const next = data?.upcoming?.[0];

  return (
    <>
      <header className="account__head">
        <p className="eyebrow eyebrow--olive">Account overview</p>
        <h1 className="h-xl">Hello, {account.firstName || "guest"}.</h1>
      </header>

      <div className="account__grid">
        <section className="panel panel--lead" aria-labelledby="next-title">
          <p className="eyebrow" id="next-title">Next stay</p>
          {!data && <p className="small">Loading…</p>}
          {data && next && (
            <>
              <h2 className="h-lg">{next.roomName}</h2>
              <p className="lede">{formatDate(next.arrival)} → {formatDate(next.departure)} · {next.nights} nights</p>
              <p className="small">Reference {next.reference} · {formatKsh(next.total)} · {next.status}</p>
              <Button to="/account/reservations" variant="outline" arrow>View reservation</Button>
            </>
          )}
          {data && !next && (
            <>
              <h2 className="h-lg">No upcoming stays.</h2>
              <p className="body">When you're ready, we'll keep a room's worth of quiet for you.</p>
              <Button to="/availability" arrow>Check availability</Button>
            </>
          )}
        </section>

        <section className="panel" aria-label="Summary">
          <dl className="facts facts--stack">
            <div><dt className="numeral">{data ? data.upcoming.length : "–"}</dt><dd className="meta">Upcoming</dd></div>
            <div><dt className="numeral">{data ? data.previous.length : "–"}</dt><dd className="meta">Previous</dd></div>
          </dl>
        </section>

        <section className="panel" aria-label="Profile">
          <p className="eyebrow">Profile</p>
          <p className="h-sm">{account.firstName} {account.lastName}</p>
          <p className="small">{account.email}</p>
          <Link to="/account/profile" className="link-arrow"><span>Edit profile</span></Link>
        </section>
      </div>
    </>
  );
}

export default function Account() {
  useDocumentTitle("My Account");
  return (
    <AccountShell>
      <Overview />
    </AccountShell>
  );
}
