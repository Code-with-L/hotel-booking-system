import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import BookingSteps from "@/components/booking/BookingSteps.jsx";
import BookingSummary from "@/components/booking/BookingSummary.jsx";
import { CheckField, TextField } from "@/components/forms/Fields.jsx";
import Button from "@/components/ui/Button.jsx";
import { useBooking } from "@/features/reservations/BookingContext.jsx";
import { useAuth } from "@/features/guest-account/AuthContext.jsx";
import { SITE } from "@/data/site.js";
import { quoteStay } from "@/services/reservationService.js";
import { validateGuest } from "@/utils/validators.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

const stripLeading254 = (p) => (p || "").replace(/\D/g, "").replace(/^254/, "");
const capWords = (s) => (s || "").replace(/(^|\s)(\w)/g, (_, sp, ch) => sp + ch.toUpperCase());
const phoneLocal = (p) => (p || "").replace(/\D/g, "").replace(/^254/, "").replace(/^0/, "").slice(0, 9);

export default function GuestDetails() {
  useDocumentTitle("Guest details");
  const { search, selection, guest, setGuest } = useBooking();
  const { account } = useAuth();
  const navigate = useNavigate();
  const waDigits = SITE.phone.replace(/\D/g, "");
  const [values, setValues] = useState(
    guest || {
      firstName: account?.firstName || "",
      lastName: account?.lastName || "",
      email: account?.email || "",
      idNumber: guest?.idNumber || "",
      phone: stripLeading254(account?.phone),
      country: "Kenya",
      privacy: false,
    }
  );
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [pricing, setPricing] = useState(null);

  useEffect(() => {
    if (!selection) return undefined;
    let cancelled = false;
    quoteStay({
      roomTypeSlug: selection.roomSlug,
      ratePlanKey: selection.ratePlanId,
      checkIn: search.checkIn,
      checkOut: search.checkOut,
      adults: search.adults,
      children: search.children,
      rooms: search.rooms,
    })
      .then((q) => !cancelled && setPricing(q))
      .catch(() => !cancelled && setPricing(null));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.roomSlug, selection?.ratePlanId, search.checkIn, search.checkOut, search.adults, search.children, search.rooms]);

  if (!selection) return <Navigate to="/availability" replace />;

  const set = (k) => (e) => {
    let value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    if (k === "phone" || k === "idNumber") value = String(value).replace(/\D/g, "").slice(0, 12);
    const next = { ...values, [k]: value };
    setValues(next);
    if (touched[k] || errors[k]) setErrors((prev) => ({ ...prev, [k]: validateGuest(next)[k] }));
  };
  const blur = (k) => () => {
    setTouched((t) => ({ ...t, [k]: true }));
    if (k === "firstName" || k === "lastName") {
      setValues((v) => ({ ...v, [k]: capWords(v[k]) }));
      return setErrors((prev) => ({ ...prev, [k]: validateGuest({ ...values, [k]: capWords(values[k]) })[k] }));
    }
    if (k === "phone") {
      const digits = phoneLocal(values.phone);
      setValues((v) => ({ ...v, phone: digits }));
      return setErrors((prev) => ({ ...prev, phone: validateGuest({ ...values, phone: digits }).phone }));
    }
    setErrors((prev) => ({ ...prev, [k]: validateGuest(values)[k] }));
  };
  const field = (k) => ({ value: values[k], onChange: set(k), onBlur: blur(k), error: errors[k] });

  const submit = (e) => {
    e.preventDefault();
    const local = phoneLocal(values.phone);
    const payload = { ...values, phone: `254${local}`, country: "Kenya" };
    const errs = validateGuest({ ...values, phone: local });
    setErrors(errs);
    setTouched({ firstName: true, lastName: true, email: true, idNumber: true, phone: true, privacy: true });
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(`guest-${first}`)?.focus();
      return;
    }
    setGuest(payload);
    navigate("/booking/review");
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <div className="page-top booking-page">
      <div className="container">
        <BookingSteps current={1} />
        <header className="booking-head">
          <p className="eyebrow eyebrow--olive">Step 2</p>
          <h1 className="h-xl">Who is staying?</h1>
        </header>
        <div className="booking-layout">
          <form onSubmit={submit} noValidate className="booking-form" aria-describedby={errorCount ? "form-errors" : undefined}>
            {errorCount > 0 && (
              <p id="form-errors" className="form-alert" role="alert">
                Please correct {errorCount === 1 ? "the highlighted field" : `the ${errorCount} highlighted fields`} to continue.
              </p>
            )}
            <div className="form-grid">
              <TextField id="guest-firstName" label="First name" autoComplete="given-name" autoCapitalize="words" {...field("firstName")} />
              <TextField id="guest-lastName" label="Last name" autoComplete="family-name" autoCapitalize="words" {...field("lastName")} />
              <TextField id="guest-email" label="Email" type="email" autoComplete="email" className="span-2" {...field("email")} />
              <TextField id="guest-idNumber" label="National ID number" autoComplete="off" inputMode="numeric" pattern="[0-9]*" hint="Required for hotel guest registration in Kenya. Digits only." {...field("idNumber")} />
              <div className="field span-2">
                <label className="field__label" htmlFor="guest-phone">Phone number</label>
                <div className="input-prefix">
                  <span className="input-prefix__tag">+254</span>
                  <input
                    id="guest-phone"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    pattern="[0-9]*"
                    placeholder="7XXXXXXXX"
                    className="input-prefix__input"
                    value={values.phone}
                    onChange={set("phone")}
                    onBlur={blur("phone")}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby="guest-phone-hint"
                  />
                </div>
                <p id="guest-phone-hint" className="field__hint">{errors.phone ? <span className="field__error">{errors.phone}</span> : "Kenyan numbers only — no 254 needed, just the 9 digits after 07."}</p>
              </div>
            </div>

            <div className="privacy-note">
              <h2 className="eyebrow">Guest privacy notice</h2>
              <p className="small">
                Your name, contact details and ID number are stored by the property to register your stay in Kenya, used solely to manage your reservation - see the{" "}
                <Link to="/privacy">privacy policy</Link>.
              </p>
              <CheckField id="guest-privacy" checked={values.privacy} onChange={set("privacy")} error={errors.privacy}>
                I have read the privacy notice.
              </CheckField>
            </div>

            <div className="whatsapp-block">
              <p className="eyebrow eyebrow--olive">Quick questions?</p>
              <a className="whatsapp-btn" href={`https://wa.me/${waDigits}?text=${encodeURIComponent("Hi! I'd like to ask about booking at The Stillhouse.")}`} target="_blank" rel="noreferrer">
                Chat with us on WhatsApp →
              </a>
            </div>

            <div className="form-actions">
              <Button to="/availability" variant="text">&larr; Back to rooms</Button>
              <Button type="submit" arrow>Continue to review</Button>
            </div>
          </form>

          <BookingSummary search={search} selection={selection} pricing={pricing} />
        </div>
      </div>
    </div>
  );
}


