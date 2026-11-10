import { useEffect, useState } from "react";
import { AdminPageHead, Panel } from "@/features/administration/AdminUI.jsx";
import { TextAreaField, TextField } from "@/components/forms/Fields.jsx";
import Button from "@/components/ui/Button.jsx";
import { getSettings, saveSettings } from "@/services/adminService.js";
import { isEmail } from "@/utils/validators.js";

export default function Settings() {
  const [s, setS] = useState(null);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let on = true;
    getSettings()
      .then((value) => on && setS(value))
      .catch((e) => on && setLoadError(e.message || "Could not load settings."));
    return () => { on = false; };
  }, []);

  const set = (group, key, num) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : num ? Number(e.target.value) : e.target.value;
    setS((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));
    setSaved(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!s.hotel.name.trim()) errs.name = "Hotel name is required.";
    if (!isEmail(s.contact.email)) errs.email = "Enter a valid email address.";
    if (s.booking.minNights < 1) errs.minNights = "Minimum stay must be at least 1 night.";
    if (s.booking.maxNights < s.booking.minNights) errs.maxNights = "Maximum must be at least the minimum.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setActionError("");
    try {
      await saveSettings(s);
      setSaved(true);
    } catch (err) {
      setActionError(err.message || "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return (<><AdminPageHead title="Settings" /><p className="form-alert" role="alert">{loadError}</p></>);
  if (!s) return (<><AdminPageHead title="Settings" note="Loading…" /><p className="small" aria-live="polite">Loading settings…</p></>);

  return (
    <>
      <AdminPageHead title="Settings" note="Hotel, contact, policy and booking settings. Saved to the server and audit-logged." />
      <form onSubmit={submit} noValidate className="settings">
        <Panel title="Hotel information">
          <div className="form-grid">
            <TextField id="s-name" label="Hotel name" value={s.hotel.name} onChange={set("hotel", "name")} error={errors.name} />
            <TextField id="s-legal" label="Legal name" value={s.hotel.legalName} onChange={set("hotel", "legalName")} />
            <TextField id="s-loc" label="Location" value={s.hotel.location} onChange={set("hotel", "location")} />
            <TextField id="s-rooms" label="Total rooms" type="number" value={s.hotel.rooms} onChange={set("hotel", "rooms", true)} />
          </div>
        </Panel>
        <Panel title="Contact details">
          <div className="form-grid">
            <TextField id="s-email" label="Reservations email" type="email" value={s.contact.email} onChange={set("contact", "email")} error={errors.email} />
            <TextField id="s-phone" label="Phone" value={s.contact.phone} onChange={set("contact", "phone")} />
            <TextField id="s-web" label="Website" value={s.contact.website} onChange={set("contact", "website")} className="span-2" />
          </div>
        </Panel>
        <Panel title="Policies">
          <div className="form-grid">
            <TextField id="s-ci" label="Check-in time" type="time" value={s.policies.checkIn} onChange={set("policies", "checkIn")} />
            <TextField id="s-co" label="Check-out time" type="time" value={s.policies.checkOut} onChange={set("policies", "checkOut")} />
            <TextAreaField id="s-cx" label="Cancellation policy" rows={3} value={s.policies.cancellation} onChange={set("policies", "cancellation")} className="span-2" />
            <TextAreaField id="s-ch" label="Children policy" rows={3} value={s.policies.children} onChange={set("policies", "children")} className="span-2" />
          </div>
        </Panel>
        <Panel title="Booking settings">
          <div className="form-grid">
            <TextField id="s-min" label="Minimum nights" type="number" min="1" value={s.booking.minNights} onChange={set("booking", "minNights", true)} error={errors.minNights} />
            <TextField id="s-max" label="Maximum nights" type="number" min="1" value={s.booking.maxNights} onChange={set("booking", "maxNights", true)} error={errors.maxNights} />
            <TextField id="s-rpb" label="Max rooms per booking" type="number" min="1" value={s.booking.maxRoomsPerBooking} onChange={set("booking", "maxRoomsPerBooking", true)} />
            <TextField id="s-adv" label="Advance purchase window (days)" type="number" min="0" value={s.booking.advancePurchaseDays} onChange={set("booking", "advancePurchaseDays", true)} />
            <div className="check span-2">
              <input id="s-enq" type="checkbox" checked={s.booking.acceptEnquiriesOnly} onChange={set("booking", "acceptEnquiriesOnly")} />
              <label htmlFor="s-enq">Accept enquiries only (disable online booking)</label>
            </div>
          </div>
        </Panel>
        <div className="form-actions">
          <Button type="submit" arrow disabled={busy}>{busy ? "Saving." : "Save settings"}</Button>
          {saved && <p className="small" role="status">Saved to the server.</p>}
          {actionError && <p className="form-alert" role="alert">{actionError}</p>}
        </div>
      </form>
    </>
  );
}
