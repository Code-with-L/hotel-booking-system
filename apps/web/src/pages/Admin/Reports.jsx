import { useEffect, useMemo, useState } from "react";
import { AdminPageHead, FilterSelect, Panel, Stat } from "@/features/administration/AdminUI.jsx";
import { Legend, OccupancyBars, StackedRevenue, TrendLine } from "@/features/administration/charts.jsx";
import { getMonthlySeries, getOccupancySeries } from "@/services/adminService.js";
import { formatKsh } from "@/utils/format.js";

const SERIES = [
  { key: "garden", label: "The Garden Room" },
  { key: "valley", label: "The Valley Suite" },
  { key: "signature", label: "The Signature Retreat" },
];

export default function Reports() {
  const [occupancy, setOccupancy] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("30");

  useEffect(() => {
    let on = true;
    Promise.all([getOccupancySeries(Number(range)), getMonthlySeries()])
      .then(([occ, mon]) => { if (on) { setOccupancy(occ); setMonthly(mon); } })
      .catch((e) => on && setError(e.message || "Could not load reports."));
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
      </div>
    </>
  );
}
