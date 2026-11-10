/** Small shared building blocks for the admin environment. */

export function AdminPageHead({ title, eyebrow = "Operations", children, note }) {
  return (
    <header className="ad-head">
      <div>
        <p className="eyebrow eyebrow--olive">{eyebrow}</p>
        <h1 className="ad-title">{title}</h1>
        {note && <p className="small">{note}</p>}
      </div>
      {children && <div className="ad-head__actions">{children}</div>}
    </header>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <p className="meta">{label}</p>
      <p className="stat__value">{value}</p>
      {sub && <p className="small">{sub}</p>}
    </div>
  );
}

const STATUS_CLASS = {
  Pending: "pending",
  Confirmed: "confirmed",
  "Checked-in": "inhouse",
  "Checked-out": "past",
  Cancelled: "cancelled",
  Active: "confirmed",
  Scheduled: "pending",
  Paused: "past",
  "Vacant clean": "confirmed",
  "Vacant dirty": "pending",
  Occupied: "inhouse",
  "Out of service": "cancelled",
};

export function StatusBadge({ status }) {
  return <span className={`badge badge--${STATUS_CLASS[status] || "past"}`}>{status}</span>;
}

export function Panel({ title, action, children, className = "" }) {
  return (
    <section className={`ad-panel ${className}`.trim()}>
      {(title || action) && (
        <div className="ad-panel__head">
          <h2 className="ad-panel__title">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Toolbar({ children, count }) {
  return (
    <div className="toolbar">
      <div className="toolbar__controls">{children}</div>
      {count !== undefined && <p className="small" aria-live="polite">{count} {count === 1 ? "result" : "results"}</p>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label = "Search" }) {
  return (
    <label className="toolbar__search">
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function FilterSelect({ label, value, onChange, options, allLabel = "All" }) {
  return (
    <label className="toolbar__select">
      <span className="meta">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function EmptyRow({ colSpan, children = "No results match your filters." }) {
  return (
    <tr>
      <td colSpan={colSpan} className="empty">
        {children}
      </td>
    </tr>
  );
}
