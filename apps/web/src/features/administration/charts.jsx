/** Lightweight SVG charts (no chart library). Figures come from the API. */
import { formatCompact } from "@/utils/format.js";
import { formatShort } from "@/utils/dates.js";

const W = 640;
const H = 240;
const PAD = { t: 12, r: 12, b: 28, l: 40 };
const innerW = W - PAD.l - PAD.r;
const innerH = H - PAD.t - PAD.b;

function Grid({ max, ticks = 4, format = (v) => v }) {
  return Array.from({ length: ticks + 1 }, (_, i) => {
    const v = (max / ticks) * i;
    const y = PAD.t + innerH - (v / max) * innerH;
    return (
      <g key={i}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className="chart__grid" />
        <text x={PAD.l - 8} y={y + 4} textAnchor="end" className="chart__tick">
          {format(Math.round(v))}
        </text>
      </g>
    );
  });
}

export function OccupancyBars({ data }) {
  if (!data?.length) return <p className="small">No occupancy data for this range yet.</p>;
  const max = 100;
  const bw = innerW / data.length;
  const step = Math.ceil(data.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Occupancy percentage by day, live data. Latest ${data[data.length - 1]?.value}%.`}>
      <Grid max={max} format={(v) => `${v}%`} />
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        return (
          <g key={d.date}>
            <rect x={PAD.l + i * bw + bw * 0.18} y={PAD.t + innerH - h} width={bw * 0.64} height={h} className="chart__bar">
              <title>{`${formatShort(d.date)}: ${d.value}%`}</title>
            </rect>
            {i % step === 0 && (
              <text x={PAD.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="chart__tick">
                {formatShort(d.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function TrendLine({ data, valueKey, label }) {
  if (!data?.length) return <p className="small">No reservation data yet.</p>;
  const max = Math.ceil(Math.max(...data.map((d) => d[valueKey])) / 20) * 20 || 20;
  const pts = data.map((d, i) => [PAD.l + (i / (data.length - 1)) * innerW, PAD.t + innerH - (d[valueKey] / max) * innerH, d]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${label}.`}>
      <Grid max={max} />
      <polyline points={pts.map((p) => `${p[0]},${p[1]}`).join(" ")} className="chart__line" fill="none" />
      {pts.map(([x, y, d]) => (
        <g key={d.month}>
          <circle cx={x} cy={y} r="3.5" className="chart__dot">
            <title>{`${d.month}: ${d[valueKey]}`}</title>
          </circle>
          <text x={x} y={H - 8} textAnchor="middle" className="chart__tick">
            {d.month}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function StackedRevenue({ data, series }) {
  if (!data?.length) return <p className="small">No settled revenue yet.</p>;
  const totals = data.map((d) => series.reduce((s, k) => s + d[k.key], 0));
  const max = Math.ceil(Math.max(...totals) / 500000) * 500000;
  if (!Number.isFinite(max) || max <= 0) return <p className="small">No settled revenue in this period yet.</p>;
  const bw = innerW / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Revenue by room type per month.">
      <Grid max={max} format={(v) => formatCompact(v)} />
      {data.map((d, i) => {
        let acc = 0;
        return (
          <g key={d.month}>
            {series.map((k) => {
              const h = (d[k.key] / max) * innerH;
              const y = PAD.t + innerH - acc - h;
              acc += h;
              return (
                <rect key={k.key} x={PAD.l + i * bw + bw * 0.22} y={y} width={bw * 0.56} height={h} className={`chart__stack chart__stack--${k.key}`}>
                  <title>{`${d.month} · ${k.label}: KSh ${Math.round(d[k.key]).toLocaleString()}`}</title>
                </rect>
              );
            })}
            <text x={PAD.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="chart__tick">
              {d.month}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ items }) {
  return (
    <ul className="legend">
      {items.map((i) => (
        <li key={i.key}>
          <span className={`legend__swatch chart__stack--${i.key}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
