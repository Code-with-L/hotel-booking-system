import { useEffect, useMemo, useState } from "react";
import { AdminPageHead, FilterSelect, Panel, Stat } from "@/features/administration/AdminUI.jsx";
import { Legend, OccupancyBars, StackedRevenue, TrendLine } from "@/features/administration/charts.jsx";
import { getEtimsInvoices, getMonthlySeries, getOccupancySeries } from "@/services/adminService.js";
import { formatKsh } from "@/utils/format.js";
import { formatDate } from "@/utils/dates.js";

const SERIES = [
  { key: "garden", label: "The Garden Room" },
  { key: "valley", label: "The Valley Suite" },
  { key: "signature", label: "The Signature Retreat" },
];

export default function Reports() {
  const [occupancy, setOccupancy] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [invoices, setInvoices] = useState(null); // eTIMS invoice history (manager+)
  const [error, setError] = useState("");
  const [range, setRange] = useState("30");

  useEffect(() => {
    let on = true;
    Promise.all([getOccupancySeries(Number(range)), getMonthlySeries()])
      .then(([occ, mon]) => { if (on) { setOccupancy(occ); setMonthly(mon); } })
      .catch((e) => on && setError(e.message || "Could not load reports."));
    getEtimsInvoices({ pageSize: 10 })
      .then((d) => on && setInvoices(d))
      .catch(() => on && setInvoices({ unavailable: true, rows: [] }));
    return () => { on = false; };
  }, [range]);

  const avg = useMemo(() => (occupancy && occupancy.length ? Math.round(occupancy.reduce((s, d) => s + d.value, 0) / occupancy.length) : 0), [occupancy]);
  const peak = useMemo(() => (occupancy && occupancy.length ? Math.max(...occupancy.map((d) => d.value)) : 0), [occupancy]);
  const totalRevenue = useMemo(() => (monthly || []).reduce((s, m) => s + m.garden + m.valley + m.signature, 0), [monthly]);

  if (error) return (<><AdminPageHead title="Reports" /><p className="form-alert" role="alert">{error}</p></>);
  if (!occupancy || !monthly) {
    return (<><AdminPageHead title="Reports" note="Loading live figures…" /><p className="small" aria-live="polite">Loading reports…</p></>);
  }

  return (
    <>
      <AdminPageHead title="Reports" note="Occupancy and revenue from actual allocations and settled reservations." />
      <div className="stats stats--3">
        <Stat label={`Average occupancy · ${range} days`} value={`${avg}%`} />
        <Stat label="Peak day" value={`${peak}%`} />
        <Stat label="Revenue · 6 months" value={formatKsh(totalRevenue)} />
      </div>

      <div className="ad-grid">
        <Panel
          title="Occupancy"
          className="span-2"
          action={<FilterSelect label="Range" value={range} onChange={(v) => setRange(v || "30")} allLabel="30 days" options={[{ value: "14", label: "14 days" }, { value: "7", label: "7 days" }]} />}
        >
          <OccupancyBars data={occupancy} />
        </Panel>
        <Panel title="Reservation trend · per month">
          <TrendLine data={monthly} valueKey="reservations" label="Reservations per month" />
        </Panel>
        <Panel title="Revenue by room type · per month (KSh)">
          <StackedRevenue data={monthly} series={SERIES} />
          <Legend items={SERIES} />
        </Panel>
        <Panel
          title="Invoice history (eTIMS)"
          className="span-2"
        >
          <p className="small">System-of-record of issued invoices. Nothing is issued until KRA certifies the integration — see docs/ACTIVATE_ETIMS.md.</p>
          {!invoices && <p className="small" aria-live="polite">Loading invoice history…</p>}
          {invoices?.unavailable && <p className="small">Invoice history unavailable (manager+ access, or the service errored).</p>}
          {invoices && !invoices.unavailable && (
            <>
              <p className="small">
                {["issued", "pending", "failed", "skipped"].map((s) => `${s}: ${invoices.countsByStatus?.[s] ?? 0}`).join(" · ")}
              </p>
              {invoices.rows.length === 0 ? (
                <p className="small">No invoices recorded yet. Invoice rows appear when reservations settle; issuance itself requires KRA certification.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table table--admin">
                    <thead>
                      <tr><th scope="col">Reservation</th><th scope="col">Status</th><th scope="col">Receipt</th><th scope="col">Invoice no.</th><th scope="col" className="num">Total</th><th scope="col">Attempts</th><th scope="col">Last issued</th></tr>
                    </thead>
                    <tbody>
                      {invoices.rows.map((inv) => (
                        <tr key={inv.id}>
                          <td>{inv.reference || `#${inv.id}`}</td>
                          <td><span className={`badge badge--${inv.status === "issued" ? "confirmed" : inv.status === "failed" ? "cancelled" : "pending"}`}>{inv.status}</span></td>
                          <td>{inv.receiptNumber ?? "—"}</td>
                          <td>{inv.etimsInvoiceNumber || "—"}</td>
                          <td className="num price">{formatKsh(Math.round((inv.totalMinor || 0) / 100))}</td>
                          <td>{inv.attempts}</td>
                          <td>{inv.issuedAt ? formatDate(new Date(inv.issuedAt).toISOString().slice(0, 10)) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </>
  );
}
