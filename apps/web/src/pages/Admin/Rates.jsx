import { useEffect, useMemo, useState } from "react";
import { AdminPageHead, EmptyRow, FilterSelect, StatusBadge, Toolbar } from "@/features/administration/AdminUI.jsx";
import { getRates, updateRate } from "@/services/adminService.js";
import { RATE_PLANS, ROOMS } from "@/data/rooms.js";
import { formatDate } from "@/utils/dates.js";
import Button from "@/components/ui/Button.jsx";

export default function Rates() {
  const [rates, setRates] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [type, setType] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => getRates()
    .then((list) => { setRates(list); })
    .catch((e) => setLoadError(e.message || "Could not load rates."));

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const filtered = useMemo(
    () => (rates || []).filter((r) => (!type || r.roomSlug === type) && (!plan || r.planId === plan) && (!status || r.status === status)),
    [rates, type, plan, status]
  );

  const update = (id, patch) => {
    setRates((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const save = async (row) => {
    setSaving(true);
    setActionError("");
    try {
      const updated = await updateRate(row.id, { nightly: row.nightly, status: row.status });
      setRates((rs) => rs.map((r) => (r.id === row.id ? { ...r, nightly: updated.nightly ?? row.nightly, status: updated.status ?? row.status } : r)));
    } catch (err) {
      setActionError(err.message || "Could not save the rate.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminPageHead title="Rates" note="Seasonal rate cards from the live pricing engine. Edits apply immediately and are audit-logged." />
      <Toolbar count={filtered.length}>
        <FilterSelect label="Room type" value={type} onChange={setType} options={ROOMS.map((r) => ({ value: r.slug, label: r.name }))} />
        <FilterSelect label="Rate plan" value={plan} onChange={setPlan} options={RATE_PLANS.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={["Active", "Scheduled", "Paused"]} />
      </Toolbar>
      {loadError && <p className="form-alert" role="alert">{loadError}</p>}
      {actionError && <p className="form-alert" role="alert">{actionError}</p>}
      <div className="table-wrap">
        <table className="table table--admin">
          <thead>
            <tr><th scope="col">Room type</th><th scope="col">Rate plan</th><th scope="col">Season</th><th scope="col">Date range</th><th scope="col" className="num">Nightly (KSh)</th><th scope="col">Status</th><th scope="col">Save / set status</th></tr>
          </thead>
          <tbody>
            {(rates === null || filtered.length === 0) && <EmptyRow colSpan={7} />}
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.roomName}</td>
                <td>{r.planName}</td>
                <td>{r.season}</td>
                <td>{formatDate(r.from)} - {formatDate(r.to)}</td>
                <td className="num">
                  <input
                    className="inline-input inline-input--num"
                    type="number"
                    min="0"
                    step="100"
                    aria-label={`Nightly rate for ${r.roomName}, ${r.planName}, ${r.season}`}
                    value={r.nightly}
                    onChange={(e) => update(r.id, { nightly: Math.max(0, Number(e.target.value)) })}
                  />
                </td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <div className="rates-row">
                    <select className="inline-select" aria-label={`Status for ${r.roomName} ${r.planName} ${r.season}`} value={r.status} onChange={(e) => update(r.id, { status: e.target.value })}>
                      {["Active", "Scheduled", "Paused"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <Button variant="outline" size="sm" onClick={() => save(r)} disabled={saving}>Save</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
