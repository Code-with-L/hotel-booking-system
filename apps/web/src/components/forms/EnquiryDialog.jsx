import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { TextField, TextAreaField } from "./Fields.jsx";
import Button from "@/components/ui/Button.jsx";
import { validateEnquiry } from "@/utils/validators.js";
import { submitEnquiry } from "@/services/enquiryService.js";
import { todayISO } from "@/utils/dates.js";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll.js";

/**
 * Enquiry modal used by Experiences and Dining.
 * `topic` = { kind: "experience" | "dining", title }. Stored server-side for the team to follow up.
 */
export default function EnquiryDialog({ topic, onClose }) {
  const open = Boolean(topic);
  const [values, setValues] = useState({ name: "", email: "", date: "", guests: "2", message: "" });
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const firstRef = useRef(null);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return undefined;
    setSent(null);
    setErrors({});
    const t = setTimeout(() => firstRef.current?.focus(), 50);
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = validateEnquiry(values);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setSent(null);
    try {
      const record = await submitEnquiry({
        kind: topic.kind,
        subject: topic.title,
        name: values.name.trim(),
        email: values.email.trim(),
        date: values.date || undefined,
        guests: Math.max(1, parseInt(values.guests, 10) || 1),
        message: values.message.trim(),
      });
      setSent(record);
    } catch (err) {
      setErrors({ form: err.message || "Your enquiry could not be sent. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog__panel" role="dialog" aria-modal="true" aria-labelledby="enquiry-title">
        <button className="dialog__close" onClick={onClose} aria-label="Close enquiry form">
          <X size={20} strokeWidth={1.5} />
        </button>
        {sent ? (
          <div className="dialog__done">
            <p className="eyebrow eyebrow--olive">Enquiry received</p>
            <h2 id="enquiry-title" className="h-md">Thank you, {values.name.split(" ")[0]}.</h2>
            <p className="body">
              The Stillhouse team will be in touch within one working day. Your enquiry reference is{" "}
              <strong>#{sent.id}</strong>.
            </p>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="eyebrow eyebrow--olive">{topic.kind === "dining" ? "Dining enquiry" : "Experience enquiry"}</p>
            <h2 id="enquiry-title" className="h-md">{topic.title}</h2>
            <p className="small">The team replies within one working day.</p>
            <div className="form-grid">
              <TextField id="enq-name" label="Name" value={values.name} onChange={set("name")} error={errors.name} autoComplete="name" inputRef={firstRef} />
              <TextField id="enq-email" label="Email" type="email" value={values.email} onChange={set("email")} error={errors.email} autoComplete="email" />
              <TextField id="enq-date" label="Preferred date (optional)" type="date" min={todayISO()} value={values.date} onChange={set("date")} />
              <TextField id="enq-guests" label="Guests" type="number" min="1" max="12" value={values.guests} onChange={set("guests")} />
              <TextAreaField id="enq-message" label="Message" rows={4} value={values.message} onChange={set("message")} error={errors.message} className="span-2" />
            </div>
            {errors.form && <p className="form-alert" role="alert">{errors.form}</p>}
            <Button type="submit" arrow disabled={busy}>{busy ? "Sending…" : "Send enquiry"}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
