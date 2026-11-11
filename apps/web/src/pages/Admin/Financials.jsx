import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPageHead, EmptyRow, Panel, Stat, StatusBadge } from "@/features/administration/AdminUI.jsx";
import { getFinancialSummary, getPaymentHealth } from "@/services/adminService.js";
import { formatDate } from "@/utils/dates.js";
import { formatKsh } from "@/utils/format.js";

const SEVERITY_BADGE = { high: "cancelled", medium: "pending", low: "past" };
const PaymentBadge = ({ status }) => {
  const cls = status === "succeeded" ? "confirmed" : status === "pending" ? "pending" : "cancelled";
  const label = status === "succeeded" ? "Succeeded" : status === "pending" ? "Pending" : status;
  return <span className={`badge badge--${cls}`}>{label}</span>;
};
const HealthFindings = ({ health }) => (
  <Panel title="Payment health" className="span-2">
    {health === undefined && <p className="small" aria-live="polite">Loading reconciliation findings…</p>}
    {health === null && <p className="small">Reconciliation findings are unavailable (you may lack manager permissions or the service errored).</p>}
    {health && health.healthy && health.findings.length === 0 && (
      <p className="small">Reconciliation is clean: no anomalies found across payments, attempts, refunds, invoices and totals.</p>
    )}
    {health && health.findings.length > 0 && (
      <ul className="history health-list">
        {health.findings.map((f) => (
          <li key={f.id}>
            <span className={`badge badge--${SEVERITY_BADGE[f.severity] || "past"}`}>{f.severity.toUpperCase()}</span>
            <strong>{f.label}</strong>
            <span className="small">{f.count} · {f.action}</span>
            {f.samples && f.samples.length > 0 && (
              <span className="small">{f.samples.map((s, i) => <code key={i} className="health-sample">{s.reference || s.id || JSON.stringify(s)}</code>)}</span>
            )}
          </li>
        ))}
      </ul>
    )}
    {health && <p className="small">Succeeded totals — payments KSh {(health.totals.succeededMinor / 100).toLocaleString("en-KE")} · attempts KSh {(health.totals.attemptsSucceededMinor / 100).toLocaleString("en-KE")} · refunds KSh {(health.totals.refundsMinor / 100).toLocaleString("en-KE")}. Findings are informational; correct records through the existing flows (desk settlement, requery, refunds) — never by editing the ledger directly.</p>}
  </Panel>
);

export default function Financials() {
  const [fin, setFin] = useState(null);
  const [health, setHealth] = useState(undefined); // undefined loading, null failed, object ready
  const [error, setError] = useState("");

  useEffect(() => {
    let on = true;
    getFinancialSummary()
      .then((d) => on && setFin(d))
      .catch((e) => on && setError(e.message || "Could not load financial summary."));
    getPaymentHealth()
      .then((d) => on && setHealth(d))
      .catch(() => on && setHealth(null));
    return () => { on = false; };
  }, []);

  if (error) return (<><AdminPageHead title="Financials" /><p className="form-alert" role="alert">{error}</p></>);
  if (!fin) return (<><AdminPageHead title="Financials" note="Loading live figures…" /><p className="small" aria-live="polite">Loading…</p></>);

  return (
    <>
      <AdminPageHead title="Financials" note="Derived from recorded payments and reservations. M-Pesa settlements appear once the provider is connected; desk settlements recorded here count immediately." />

      <div className="stats">
        <Stat label="Collected" value={formatKsh(fin.collected)} sub={`${fin.succeededCount} payments`} />
        <Stat label="Outstanding" value={formatKsh(fin.outstanding)} sub="Balances due (confirmed & in-house)" />
        <Stat label="Refunds recorded" value={formatKsh(fin.refunds)} sub={`${fin.refundCount} refund lines`} />
        <Stat label="Cancellation fees" value={formatKsh(fin.cancellationFees)} sub={`${fin.cancelledCount} cancellations`} />
        <Stat label="Pending payment value" value={formatKsh(Math.round((fin.pendingMinor || 0) / 100))} sub={`${fin.pendingCount} pending`} />
      </div>

      <div className="ad-grid">
        <Panel
          title="Outstanding balances"
          action={<Link to="/admin/reservations" className="link-arrow"><span>Open reservations</span></Link>}
          className="span-2"
        >
          <div className="table-wrap">
            <table className="table table--admin">
              <thead>
                <tr><th scope="col">Reference</th><th scope="col">Guest</th><th scope="col">Arrival</th><th scope="col" className="num">Total</th><th scope="col" className="num">Paid</th><th scope="col" className="num">Balance</th><th scope="col">Status</th></tr>
              </thead>
              <tbody>
                {fin.outstandingReservations.length === 0 && <EmptyRow colSpan={7}>No outstanding balances. Everything settled.</EmptyRow>}
                {fin.outstandingReservations.map((r) => (
                  <tr key={r.reference}>
                    <td>{r.reference}</td>
                    <td>{r.guestName || "—"}</td>
                    <td>{formatDate(r.arrival)}</td>
                    <td className="num price">{formatKsh(r.total)}</td>
                    <td className="num">{formatKsh(r.paid)}</td>
                    <td className="num price">{formatKsh(r.balance)}</td>
                    <td><StatusBadge status={r.status === "checked_in" ? "Checked-in" : r.status === "checked_out" ? "Checked-out" : "Confirmed"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Recent payments" className="span-2">
          <div className="table-wrap">
            <table className="table table--admin">
              <thead>
                <tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Guest</th><th scope="col">Provider</th><th scope="col" className="num">Amount</th><th scope="col">Status</th></tr>
              </thead>
              <tbody>
                {fin.recentPayments.length === 0 && <EmptyRow colSpan={6}>No payments recorded yet.</EmptyRow>}
                {fin.recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.date ? new Date(p.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td>{p.reference || "—"}</td>
                    <td>{p.guestName || "—"}</td>
                    <td>{p.provider}</td>
                    <td className="num price">{formatKsh(p.amount)}</td>
                    <td><PaymentBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <HealthFindings health={health} />
      </div>

      <p className="small">
        Amounts reflect only money recorded through this system (desk settlement, and M-Pesa when configured). Card
        provider payouts, county levies and statutory taxes are out of scope of this view.
      </p>
    </>
  );
}
