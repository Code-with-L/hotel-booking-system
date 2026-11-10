import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import BookingSteps from "@/components/booking/BookingSteps.jsx";
import BookingSummary from "@/components/booking/BookingSummary.jsx";
import { CheckField, SelectField, TextAreaField, TextField } from "@/components/forms/Fields.jsx";
import Button from "@/components/ui/Button.jsx";
import { useBooking } from "@/features/reservations/BookingContext.jsx";
import { useAuth } from "@/features/guest-account/AuthContext.jsx";
import { COUNTRIES } from "@/data/site.js";
import { quoteStay } from "@/services/reservationService.js";
import { validateGuest } from "@/utils/validators.js";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function GuestDetails() {
  useDocumentTitle("Guest details");
  const { search, selection, guest, setGuest } = useBooking();
  const { account } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState(
    guest || {
      firstName: account?.firstName || "",
      lastName: account?.lastName || "",
      email: account?.email || "",
      phone: account?.phone || "",
      country: account?.country || "",
      requests: "",
      privacy: false,
    }
  );
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [pricing, setPricing] = useState(null);

  // Live price from the server (never trust a client-side quote).
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
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    const next = { ...values, [k]: value };
    setValues(next);
    if (touched[k] || errors[k]) setErrors((prev) => ({ ...prev, [k]: validateGuest(next)[k] }));
  };
  const blur = (k) => () => {
    setTouched((t) => ({ ...t, [k]: true }));
    setErrors((prev) => ({ ...prev, [k]: validateGuest(values)[k] }));
  };
  const field = (k) => ({ value: values[k], onChange: set(k), onBlur: blur(k), error: errors[k] });

  const submit = (e) => {
    e.preventDefault();
    const errs = validateGuest(values);
    setErrors(errs);
    setTouched({ firstName: true, lastName: true, email: true, phone: true, country: true, privacy: true });
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(`guest-${first}`)?.focus();
      return;
    }
    setGuest(values);
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
              <TextField id="guest-firstName" label="First name" autoComplete="given-name" {...field("firstName")} />
              <TextField id="guest-lastName" label="Last name" autoComplete="family-name" {...field("lastName")} />
              <TextField id="guest-email" label="Email" type="email" autoComplete="email" {...field("email")} />
              <TextField id="guest-phone" label="Phone number" type="tel" autoComplete="tel" hint="Include country code, e.g. +254…" {...field("phone")} />
              <SelectField id="guest-country" label="Country" placeholder="Select your country" options={COUNTRIES} autoComplete="country-name" className="span-2" {...field("country")} />
              <TextAreaField
                id="guest-requests"
                label="Special requests (optional)"
                rows={4}
                hint="Arrival time, dietary needs, celebrations. Requests are noted, not guaranteed."
                className="span-2"
                {...field("requests")}
              />
            </div>

            <div className="privacy-note">
              <h2 className="eyebrow">Guest privacy notice</h2>
              <p className="small">
                In this prototype your details are held only in your browser session and are never sent anywhere. In a live version they would be used solely to manage your reservation — see the{" "}
                <Link to="/privacy">privacy policy</Link>.
              </p>
              <CheckField id="guest-privacy" checked={values.privacy} onChange={set("privacy")} error={errors.privacy}>
                I have read the privacy notice.
              </CheckField>
            </div>

            <div className="form-actions">
              <Button to="/availability" variant="text">← Back to rooms</Button>
              <Button type="submit" arrow>Continue to review</Button>
            </div>
          </form>

          <BookingSummary search={search} selection={selection} pricing={pricing} />
        </div>
      </div>
    </div>
  );
}
