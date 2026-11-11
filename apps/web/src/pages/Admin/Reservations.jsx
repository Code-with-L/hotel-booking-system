import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { AdminPageHead, EmptyRow, FilterSelect, SearchInput, StatusBadge, Toolbar } from "@/features/administration/AdminUI.jsx";
import { getReservations, getReservationDetail, updateReservationStatus } from "@/services/adminService.js";
import { ROOMS, getRatePlan } from "@/data/rooms.js";
import { formatDate } from "@/utils/dates.js";
import { formatKsh } from "@/utils/format.js";
import Button from "@/components/ui/Button.jsx";

const RESERVATION_STATUSES = ["Pending", "Confirmed", "Checked-in", "Checked-out", "Cancelled", "Expired"];
const TRANSITIONS = { Pending: ["Confirmed", "Cancelled"], Confirmed: ["Checked-in", "Cancelled"], "Checked-in": ["Checked-out"], "Checked-out": [], Cancelled: [], Expired: [] };

const PAID_CLASS = { Paid: "confirmed", Partial: "pending", Unpaid: "cancelled" };
const PaidBadge = ({ status }) =>
  status ? <span className={`badge badge--${PAID_CLASS[status] || "past"}`}>{status}</span> : <span className="small">—</span>;

export default function Reservations() {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [room, setRoom] = useState("");
  const [sort, setSort] = useState("arrival-desc");
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let on = true;
    getReservations()
      .then((list) => on && setRows(list))
      .catch((e) => on && setLoadError(e.message || "Could not load reservations."));
    return () => { on = false; };
  }, []);

  useEffect(() => {
    if (!openId) { setDetail(null); return undefined; }
    const target = rows?.find((r) => r.id === openId);
    if (!target) return undefined;
    let alive = true;
    setDetailLoading(true);
    getReservationDetail(target.reference)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false));
    return () => { alive = false; };
  }, [openId, rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      const hay = `${r.reference} ${r.guestName || ""} ${r.guestEmail || ""} ${r.roomName} ${(r.roomNumbers || []).join(" ")}`.toLowerCase();
      return (!term || hay.includes(term)) && (!status || r.status === status) && (!room || r.roomSlug === room);
    });
    const [key, dir] = sort.split("-");
    list.sort((a, b) => {
      const av = key === "amount" ? a.total : a[key];
      const bv = key === "amount" ? b.total : b[key];
      return (av > bv ? 1 : av < bv ? -1 : 0) * (dir === "asc" ? 1 : -1);
    });
    return list;
  }, [rows, q, status, room, sort]);

  const open = rows?.find((r) => r.id === openId) || null;

  const changeStatus = async (r, nextLabel) => {
    setActionError("");
    try {
      const updated = await updateReservationStatus(r.reference, nextLabel);
      setRows((rs) => rs.map((x) => (x.reference === r.reference ? { ...x, ...updated, id: x.reference } : x)));
      const d = await getReservationDetail(r.reference).catch(() => null);
      setDetail(d);
    } catch (err) {
      setActionError(err.message || "Could not update the reservation.");
    }
  };

  return (
    <>
      <AdminPageHead title="Reservations" note="Live data. Status changes are written to the reservation and recorded in the audit log." />
      <Toolbar count={filtered.length}>
        <SearchInput value={q} onChange={setQ} placeholder="Search guest, reference or room" label="Search reservations" />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={RESERVATION_STATUSES} />
        <FilterSelect label="Room type" value={room} onChange={setRoom} options={ROOMS.map((r) => ({ value: r.slug, label: r.name }))} />
        <FilterSelect
          label="Sort"
          value={sort}
          onChange={setSort}
          allLabel="Arrival (newest)"
          options={[
            { value: "arrival-asc", label: "Arrival (oldest)" },
            { value: "amount-desc", label: "Amount (high-low)" },
            { value: "amount-asc", label: "Amount (low-high)" },
          ]}
        />
      </Toolbar>

      {loadError && <p className="form-alert" role="alert">{loadError}</p>}
      {actionError && <p className="form-alert" role="alert">{actionError}</p>}

      <div className="table-wrap">
        <table className="table table--admin">
          <thead>
            <tr>
              <th scope="col">Reference</th><th scope="col">Guest</th><th scope="col">Room</th>
              <th scope="col">Arrival</th><th scope="col">Departure</th><th scope="col">Status</th><th scope="col">Paid</th>
              <th scope="col" className="num">Amount</th><th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {(rows === null || filtered.length === 0) && <EmptyRow colSpan={9} />}
            {filtered.map((r) => (
              <tr key={r.id} className={openId === r.id ? "is-selected" : ""}>
                <td>{r.reference}</td>
                <td>{r.guestName || "-"}</td>
                <td>{r.roomName}<br /><span className="small">{(r.roomNumbers || []).length ? `Unit ${r.roomNumbers.join(", ")}` : "Room allocated on confirmation"}</span></td>
                <td>{formatDate(r.arrival)}</td>
                <td>{formatDate(r.departure)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td><PaidBadge status={r.paymentStatus} /></td>
                <td className="num price">{formatKsh(r.total)}</td>
                <td><button className="link-arrow" onClick={() => setOpenId(r.id)} aria-label={`View details for ${r.reference}`}><span>View</span></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <aside className="drawer" role="dialog" aria-label={`Reservation ${open.reference}`}>
          <div className="drawer__head">
            <div>
              <p className="eyebrow">Reservation</p>
              <h2 className="ad-panel__title">{open.reference}</h2>
            </div>
            <button className="drawer__close" onClick={() => setOpenId(null)} aria-label="Close details"><X size={18} strokeWidth={1.5} /></button>
          </div>
          <dl className="kv">
            <div><dt>Guest</dt><dd>{open.guestName || "-"}</dd></div>
            <div><dt>Email</dt><dd>{open.guestEmail}</dd></div>
            <div><dt>Phone</dt><dd>{open.guestPhone}</dd></div>
            <div><dt>Room</dt><dd>{open.roomName}{open.roomNumbers?.length ? ` · ${open.roomNumbers.join(", ")}` : ""}</dd></div>
            <div><dt>Rate plan</dt><dd>{getRatePlan(open.ratePlanId)?.name || open.ratePlanId}</dd></div>
            <div><dt>Stay</dt><dd>{formatDate(open.arrival)} → {formatDate(open.departure)} ({open.nights} nights)</dd></div>
            <div><dt>Guests</dt><dd>{open.adults} adults{open.children ? `, ${open.children} child` : ""}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status={open.status} /> · <PaidBadge status={open.paymentStatus} /></dd></div>
            <div><dt>Requests</dt><dd>{open.requests || "-"}</dd></div>
          </dl>

          {detailLoading && <p className="small" aria-live="polite">Loading pricing…</p>}
          {detail?.breakdown && (
            <dl className="kv kv--prices">
              <div><dt>Nightly rate</dt><dd className="price">{formatKsh(Math.round(detail.breakdown.nightlyMinor / 100))}</dd></div>
              <div><dt>Nights × rooms</dt><dd>{open.nights} × {open.rooms}</dd></div>
              <div><dt>Subtotal</dt><dd className="price">{formatKsh(Math.round(detail.breakdown.subtotalMinor / 100))}</dd></div>
              <div><dt>Service charge (10%)</dt><dd className="price">{formatKsh(Math.round(detail.breakdown.serviceChargeMinor / 100))}</dd></div>
              <div><dt>Tourism levy (2%)</dt><dd className="price">{formatKsh(Math.round(detail.breakdown.tourismLevyMinor / 100))}</dd></div>
              <div><dt>VAT (16%)</dt><dd className="price">{formatKsh(Math.round(detail.breakdown.vatMinor / 100))}</dd></div>
              {detail.breakdown.cancelFeeMinor > 0 && (
                <div><dt>Cancellation fee</dt><dd className="price">{formatKsh(Math.round(detail.breakdown.cancelFeeMinor / 100))}</dd></div>
              )}
              <div className="kv__total"><dt>Total</dt><dd className="price">{formatKsh(Math.round(detail.breakdown.totalMinor / 100))}</dd></div>
            </dl>
          )}
          {detail?.payments?.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginTop: "var(--s-4)" }}>Payments</p>
              <ul className="history">
                {detail.payments.map((p) => (
                  <li key={p.id}>
                    <span>{p.provider}</span>
                    <span className={p.status === "succeeded" ? "badge badge--confirmed" : "badge badge--cancelled"}>{p.status}</span>
                    <span className="price">{formatKsh(Math.round((p.amountMinor || 0) / 100))}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <label className="toolbar__select drawer__status">
            <span className="meta">Update status</span>
            <select
              value={open.status}
              onChange={(e) => changeStatus(open, e.target.value)}
            >
              {[open.status, ...(TRANSITIONS[open.status] || [])].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <p className="small">Only valid transitions are offered. Cancellations release the room immediately; the audit log records every change.</p>
          <Button variant="outline" size="sm" onClick={() => setOpenId(null)}>Done</Button>
        </aside>
      )}
    </>
  );
}
