import { Fragment, useEffect, useMemo, useState } from "react";
import { AdminPageHead, EmptyRow, SearchInput, StatusBadge, Toolbar } from "@/features/administration/AdminUI.jsx";
import { getGuests } from "@/services/adminService.js";
import { formatDate } from "@/utils/dates.js";
import { formatKsh } from "@/utils/format.js";

export default function Guests() {
  const [guests, setGuests] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let on = true;
    getGuests()
      .then((list) => on && setGuests(list))
      .catch((e) => on && setLoadError(e.message || "Could not load guests."));
    return () => { on = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!guests) return [];
    const term = q.trim().toLowerCase();
    return guests.filter((g) => !term || `${g.firstName} ${g.lastName} ${g.email} ${g.country} ${g.phone}`.toLowerCase().includes(term));
  }, [guests, q]);

  return (
    <>
      <AdminPageHead title="Guests" note="Live guest records with stay history. Notes you save are stored on the guest profile." />
      <Toolbar count={filtered.length}>
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email, country." label="Search guests" />
      </Toolbar>
      {loadError && <p className="form-alert" role="alert">{loadError}</p>}
      <div className="table-wrap">
        <table className="table table--admin">
          <thead>
            <tr><th scope="col">Guest</th><th scope="col">Email</th><th scope="col">Phone</th><th scope="col">Country</th><th scope="col" className="num">Stays</th><th scope="col"><span className="sr-only">History</span></th></tr>
          </thead>
          <tbody>
            {(guests === null || filtered.length === 0) && <EmptyRow colSpan={6} />}
            {filtered.map((g) => {
              const history = [...(g.reservations || [])].sort((a, b) => b.arrival.localeCompare(a.arrival));
              const open = openId === g.id;
              return (
                <Fragment key={g.id}>
                  <tr className={open ? "is-selected" : ""}>
                    <td><strong>{g.firstName} {g.lastName}</strong><br /><span className="small">G-{String(g.id).padStart(4, "0")}</span></td>
                    <td><a href={`mailto:${g.email}`}>{g.email}</a></td>
                    <td>{g.phone}</td>
                    <td>{g.country}</td>
                    <td className="num">{history.length}</td>
                    <td>
                      <button className="link-arrow" aria-expanded={open} onClick={() => setOpenId(open ? null : g.id)}>
                        <span>{open ? "Hide history" : "History"}</span>
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="expand">
                      <td colSpan={6}>
                        {g.notes && <p className="small"><strong>Notes:</strong> {g.notes}</p>}
                        {history.length === 0 ? (
                          <p className="small">No reservations on record.</p>
                        ) : (
                          <ul className="history">
                            {history.map((r) => (
                              <li key={r.id}>
                                <span>{r.reference}</span>
                                <span>{r.roomName}</span>
                                <span>{formatDate(r.arrival)} → {formatDate(r.departure)}</span>
                                <StatusBadge status={r.status} />
                                <span className="price">{formatKsh(r.total)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
