import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPageHead, Panel, Stat, StatusBadge } from "@/features/administration/AdminUI.jsx";
import { getDashboard } from "@/services/adminService.js";
import { formatDate } from "@/utils/dates.js";
import { formatKsh } from "@/utils/format.js";

function MovementList({ title, items, empty }) {
  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <p className="small">{empty}</p>
      ) : (
        <ul className="move-list">
          {items.map((r) => (
            <li key={r.id || r.reference}>
              <div>
                <p className="move-list__name">{r.guestName || "Guest"}</p>
                <p className="small">{r.reference} · {r.roomName}{r.roomNumbers?.length ? ` · ${r.roomNumbers.join(", ")}` : ""}</p>
              </div>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Dashboard() {
  const [dash, setDash] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let on = true;
    getDashboard()
      .then((d) => on && setDash(d))
      .catch((e) => on && setError(e.message || "Could not load the dashboard."));
    return () => { on = false; };
  }, []);

  if (error) return (<><AdminPageHead title="Dashboard" /><p className="form-alert" role="alert">{error}</p></>);
  if (!dash) return (<><AdminPageHead title="Dashboard" note="Loading live figures…" /><p className="small" aria-live="polite">Loading the dashboard…</p></>);

  const payments = dash.paymentSummary || {};
  const succeeded = payments.succeeded || { count: 0, amountMinor: 0 };
  const pendingPay = payments.pending || { count: 0, amountMinor: 0 };
  const failedPay = payments.failed || { count: 0 };

  return (
    <>
      <AdminPageHead title="Dashboard" note="Live figures from the property's reservation system." />

      <div className="stats">
        <Stat label="Total reservations" value={dash.totalReservations} sub="Excluding cancelled" />
        <Stat label="Needs action" value={dash.pendingCount ?? 0} sub="Pending reservations" />
        <Stat label="Confirmed" value={dash.confirmedCount ?? 0} sub="Awaiting arrival" />
        <Stat label="Occupancy" value={`${dash.occupancy}%`} sub={`${dash.inHouse} of ${dash.sellable} sellable rooms`} />
        <Stat label="Revenue" value={formatKsh(dash.revenue)} sub="Confirmed and staying" />
      </div>

      <div className="ad-grid">
        <Panel
          title="Recent reservations"
          action={<Link to="/admin/reservations" className="link-arrow"><span>View all</span></Link>}
          className="span-2"
        >
          <div className="table-wrap">
            <table className="table table--admin">
              <thead>
                <tr><th scope="col">Reference</th><th scope="col">Guest</th><th scope="col">Room</th><th scope="col">Arrival</th><th scope="col">Status</th><th scope="col" className="num">Amount</th></tr>
              </thead>
              <tbody>
                {dash.recent.map((r) => (
                  <tr key={r.reference}>
                    <td>{r.reference}</td>
                    <td>{r.guestName || "—"}</td>
                    <td>{r.roomName}</td>
                    <td>{formatDate(r.arrival)}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="num price">{formatKsh(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <MovementList title="Arrivals today" items={dash.arrivals || []} empty="No arrivals expected today." />
        <MovementList title="Departures today" items={dash.departures || []} empty="No departures expected today." />

        <Panel
          title="Pending actions"
          action={<Link to="/admin/reservations" className="link-arrow"><span>Manage</span></Link>}
        >
          {dash.pendingCount > 0 ? (
            <p className="small">
              <strong>{dash.pendingCount} reservation{dash.pendingCount === 1 ? "" : "s"} awaiting action.</strong>{" "}
              Confirm or cancel them from Reservations — rooms are held only while the reservation is pending.
            </p>
          ) : (
            <p className="small">No pending reservations. The diary is clear.</p>
          )}
        </Panel>

        <Panel title="Payments">
          <dl className="kv">
            <div><dt>Succeeded</dt><dd>{succeeded.count} · {formatKsh(Math.round(succeeded.amountMinor / 100))}</dd></div>
            <div><dt>Pending</dt><dd>{pendingPay.count} · {formatKsh(Math.round(pendingPay.amountMinor / 100))}</dd></div>
            <div><dt>Failed</dt><dd>{failedPay.count}</dd></div>
            <div><dt>Outstanding balance</dt><dd>{formatKsh(dash.outstanding ?? 0)}</dd></div>
            <div><dt>Cancellations (30d)</dt><dd>{dash.cancelledLast30Days ?? 0}</dd></div>
          </dl>
          <p className="small"><Link to="/admin/financials" className="link-arrow"><span>Open financial overview</span></Link></p>
        </Panel>

        <Panel title="Room availability summary" action={<Link to="/admin/rooms" className="link-arrow"><span>Manage rooms</span></Link>} className="span-2">
          <ul className="avail-sum">
            {dash.byType.map((t) => (
              <li key={t.slug}>
                <div className="avail-sum__head">
                  <p className="avail-sum__name">{t.name}</p>
                  <p className="small">{t.occupied} occupied · {t.ready} ready · {t.outOfService} out of service · {t.total} total</p>
                </div>
                <div className="segbar" role="img" aria-label={`${t.name}: ${t.occupied} occupied, ${t.ready} ready, ${t.outOfService} out of service of ${t.total}`}>
                  <span className="segbar__occ" style={{ width: `${(t.occupied / t.total) * 100}%` }} />
                  <span className="segbar__ready" style={{ width: `${(t.ready / t.total) * 100}%` }} />
                  <span className="segbar__oos" style={{ width: `${(t.outOfService / t.total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
