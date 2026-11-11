import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { AdminPageHead, EmptyRow, FilterSelect, Panel, SearchInput, StatusBadge, Toolbar } from "@/features/administration/AdminUI.jsx";
import { getUnits, getRoomHistory, updateUnit } from "@/services/adminService.js";
import { ROOMS } from "@/data/rooms.js";
import { formatDate, todayISO } from "@/utils/dates.js";
import { formatKsh } from "@/utils/format.js";

const ROOM_STATUSES = ["Vacant clean", "Occupied", "Out of service"];
const ALLOCATION_BADGE = {
  released: { cls: "past", label: "Released" },
  expired: { cls: "cancelled", label: "Expired" },
};
const allocationBadge = (h) =>
  h.state !== "occupying"
    ? ALLOCATION_BADGE[h.state] || { cls: "past", label: h.state }
    : h.checkOut >= todayISO()
      ? { cls: "confirmed", label: "In effect" }
      : { cls: "past", label: "Completed" };

export default function Rooms() {
  const [units, setUnits] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [historyRoom, setHistoryRoom] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let on = true;
    getUnits()
      .then((list) => on && setUnits(list))
      .catch((e) => on && setLoadError(e.message || "Could not load rooms."));
    return () => { on = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!units) return [];
    const term = q.trim().toLowerCase();
    return units.filter(
      (u) =>
        (!term || `${u.number} ${u.roomName} ${u.maintenance}`.toLowerCase().includes(term)) &&
        (!type || u.roomSlug === type) &&
        (!status || u.status === status)
    );
  }, [units, q, type, status]);

  const update = async (number, patch) => {
    setActionError("");
    // Optimistic display update
    setUnits((us) => us.map((u) => (u.number === number ? { ...u, ...patch } : u)));
    try {
      await updateUnit(number, patch);
    } catch (err) {
      setActionError(err.message || "Could not update the room.");
      // Reconcile from server
      getUnits().then(setUnits).catch(() => {});
    }
  };

  const openHistory = (u) => {
    setHistoryRoom(u);
    setHistory(null);
    setHistoryError("");
    getRoomHistory(u.number)
      .then((d) => setHistory(d.history))
      .catch((e) => setHistoryError(e.message || "Could not load history."));
  };

  return (
    <>
      <AdminPageHead title="Rooms" note="Live housekeeping and inventory. Taking a room out of service is blocked while it has active reservations — resolve those first. Releasing returns it to sale." />

      {loadError && <p className="form-alert" role="alert">{loadError}</p>}
      {actionError && <p className="form-alert" role="alert">{actionError}</p>}

      <div className="type-grid">
        {ROOMS.map((room) => {
          const mine = (units || []).filter((u) => u.roomSlug === room.slug);
          return (
            <Panel key={room.slug} title={room.name}>
              <dl className="kv">
                <div><dt>Rooms</dt><dd>{mine.length}</dd></div>
                <div><dt>Occupancy</dt><dd>{room.occupancy.label} · {room.size} m²</dd></div>
                <div><dt>Occupied now</dt><dd>{mine.filter((u) => u.status === "Occupied").length}</dd></div>
                <div><dt>Out of service</dt><dd>{mine.filter((u) => u.status === "Out of service").length}</dd></div>
                <div><dt>Rack rate</dt><dd>{formatKsh(room.fromPrice)}</dd></div>
              </dl>
            </Panel>
          );
        })}
      </div>

      <Toolbar count={filtered.length}>
        <SearchInput value={q} onChange={setQ} placeholder="Search room number or note." label="Search rooms" />
        <FilterSelect label="Room type" value={type} onChange={setType} options={ROOMS.map((r) => ({ value: r.slug, label: r.name }))} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={ROOM_STATUSES} />
      </Toolbar>

      <div className="table-wrap">
        <table className="table table--admin">
          <thead>
            <tr><th scope="col">Room</th><th scope="col">Type</th><th scope="col">Location</th><th scope="col">Sleeps</th><th scope="col">Status</th><th scope="col">Maintenance note</th><th scope="col">Set status</th><th scope="col"><span className="sr-only">History</span></th></tr>
          </thead>
          <tbody>
            {(units === null || filtered.length === 0) && <EmptyRow colSpan={8} />}
            {filtered.map((u) => (
              <tr key={u.number}>
                <td><strong>{u.number}</strong></td>
                <td>{u.roomName}</td>
                <td>{u.floor}</td>
                <td>{u.capacity}</td>
                <td><StatusBadge status={u.status} /></td>
                <td>
                  {u.status === "Out of service" ? (
                    <input className="inline-input" aria-label={`Maintenance note for ${u.number}`} value={u.maintenance} placeholder="Describe the issue" onChange={(e) => update(u.number, { maintenance: e.target.value })} />
                  ) : (
                    <span className="small">-</span>
                  )}
                </td>
                <td>
                  <select className="inline-select" aria-label={`Status for room ${u.number}`} value={u.status} onChange={(e) => update(u.number, { status: e.target.value, maintenance: e.target.value === "Out of service" ? u.maintenance || "Unspecified" : "" })}>
                    {ROOM_STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td><button className="link-arrow" onClick={() => openHistory(u)} aria-label={`History for room ${u.number}`}><span>History</span></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {historyRoom && (
        <aside className="drawer drawer--wide" role="dialog" aria-label={`Allocation history for ${historyRoom.number}`}>
          <div className="drawer__head">
            <div>
              <p className="eyebrow">Allocation history</p>
              <h2 className="ad-panel__title">Room {historyRoom.number}</h2>
              <p className="small">{historyRoom.roomName}</p>
            </div>
            <button className="drawer__close" onClick={() => setHistoryRoom(null)} aria-label="Close history"><X size={18} strokeWidth={1.5} /></button>
          </div>
          {historyError && <p className="form-alert" role="alert">{historyError}</p>}
          {!history && !historyError && <p className="small" aria-live="polite">Loading…</p>}
          {history && history.length === 0 && <p className="small">No allocations on record for this room yet.</p>}
          {history && history.length > 0 && (
            <div className="table-wrap">
              <table className="table table--admin">
                <thead>
                  <tr><th scope="col">Dates</th><th scope="col">Type</th><th scope="col">State</th><th scope="col">Source</th><th scope="col">Outcome</th></tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td>{formatDate(h.checkIn)} → {formatDate(h.checkOut)}</td>
                      <td>{h.kind === "block" ? "Maintenance" : h.kind === "hold" ? "Hold" : "Reservation"}</td>
                      <td><span className={`badge badge--${allocationBadge(h).cls}`}>{allocationBadge(h).label}</span></td>
                      <td>{h.reference ? (
                        <>
                          <span>{h.reference}</span>
                          {h.guestName && <span className="small"> · {h.guestName}</span>}
                        </>
                      ) : (h.kind === "block" ? <span className="small">Maintenance block</span> : <span className="small">—</span>)}</td>
                      <td>{h.reservationStatus || (h.kind === "hold" ? "Hold expired or converted" : h.kind === "block" ? "Block recorded" : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
