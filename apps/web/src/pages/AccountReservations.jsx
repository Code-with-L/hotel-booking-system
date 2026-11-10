import { useEffect, useState } from "react";
import AccountShell from "@/features/guest-account/AccountShell.jsx";
import { useAuth } from "@/features/guest-account/AuthContext.jsx";
import { listGuestReservations } from "@/services/reservationService.js";
import { getRatePlan } from "@/data/rooms.js";
import Button from "@/components/ui/Button.jsx";
import { formatDate } from "@/utils/dates.js";
import { formatKsh, pluralise } from "@/utils/format.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

function Detail({ r, onClose }) {
  return (
    <div className="detail-panel" role="region" aria-label={`Reservation ${r.reference} details`}>
      <div className="detail-panel__head">
        <h3 className="h-sm">{r.roomName}</h3>
        <button className="link-arrow" onClick={onClose}><span>Close details</span></button>
      </div>
      <dl className="kv kv--large">
        <div><dt>Reference</dt><dd>{r.reference}</dd></div>
        <div><dt>Status</dt><dd>{r.status}</dd></div>
        <div><dt>Stay</dt><dd>{formatDate(r.arrival)} → {formatDate(r.departure)} ({pluralise(r.nights, "night")})</dd></div>
        <div><dt>Guests</dt><dd>{pluralise(r.adults, "adult")}{r.children > 0 && `, ${pluralise(r.children, "child", "children")}`} · {pluralise(r.rooms, "room")}</dd></div>
        <div><dt>Rate plan</dt><dd>{getRatePlan(r.ratePlanId)?.name}</dd></div>
        <div><dt>Total</dt><dd>{formatKsh(r.total)}</dd></div>
        {r.requests && <div><dt>Requests</dt><dd>{r.requests}</dd></div>}
      </dl>
    </div>
  );
}

function List({ items, empty, openId, setOpenId }) {
  if (!items.length) return <p className="body">{empty}</p>;
  return (
    <ul className="res-list">
      {items.map((r) => (
        <li key={r.id}>
          <div className="res-row">
            <div>
              <p className="eyebrow eyebrow--terra">{r.status}</p>
              <p className="h-sm">{r.roomName}</p>
              <p className="small">Ref {r.reference}</p>
            </div>
            <p className="small">{formatDate(r.arrival)} → {formatDate(r.departure)}<br />{pluralise(r.nights, "night")}</p>
            <p className="price">{formatKsh(r.total)}</p>
            <Button variant="outline" size="sm" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
              {openId === r.id ? "Hide details" : "View details"}
            </Button>
          </div>
          {openId === r.id && <Detail r={r} onClose={() => setOpenId(null)} />}
        </li>
      ))}
    </ul>
  );
}

function Reservations() {
  const { account } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("upcoming");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let live = true;
    listGuestReservations(account.email).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [account.email]);

  return (
    <>
      <header className="account__head">
        <p className="eyebrow eyebrow--olive">Reservations</p>
        <h1 className="h-xl">Your stays.</h1>
      </header>
      <div className="seg" role="tablist" aria-label="Reservation period">
        {["upcoming", "previous"].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "is-active" : ""} onClick={() => { setTab(t); setOpenId(null); }}>
            {t === "upcoming" ? "Upcoming" : "Previous stays"}
            {data && <span> ({data[t].length})</span>}
          </button>
        ))}
      </div>
      {!data ? (
        <p className="small" aria-live="polite">Loading reservations…</p>
      ) : (
        <List
          items={data[tab]}
          openId={openId}
          setOpenId={setOpenId}
          empty={tab === "upcoming" ? "You have no upcoming reservations. Make one from the rooms page." : "No previous stays yet."}
        />
      )}
    </>
  );
}

export default function AccountReservations() {
  useDocumentTitle("My Reservations");
  return (
    <AccountShell>
      <Reservations />
    </AccountShell>
  );
}
