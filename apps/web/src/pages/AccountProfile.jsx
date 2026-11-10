import { useState } from "react";
import AccountShell from "@/features/guest-account/AccountShell.jsx";
import { useAuth } from "@/features/guest-account/AuthContext.jsx";
import { SelectField, TextField } from "@/components/forms/Fields.jsx";
import Button from "@/components/ui/Button.jsx";
import { COUNTRIES } from "@/data/site.js";

import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

function Profile() {
  const { account, updateProfile } = useAuth();
  const [values, setValues] = useState(account);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const set = (k) => (e) => {
    setValues({ ...values, [k]: e.target.value });
    setSaved(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!values.firstName?.trim()) errs.firstName = "Please enter your first name.";
    if (!values.lastName?.trim()) errs.lastName = "Please enter your last name.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setActionError("");
    try {
      await updateProfile(values);
      setSaved(true);
    } catch (err) {
      setActionError(err.message || "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="account__head">
        <p className="eyebrow eyebrow--olive">Profile</p>
        <h1 className="h-xl">Your details.</h1>
      </header>
      <form className="booking-form profile-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <TextField id="pf-first" label="First name" value={values.firstName || ""} onChange={set("firstName")} error={errors.firstName} autoComplete="given-name" />
          <TextField id="pf-last" label="Last name" value={values.lastName || ""} onChange={set("lastName")} error={errors.lastName} autoComplete="family-name" />
          <TextField id="pf-email" label="Email" type="email" value={values.email || ""} readOnly autoComplete="email" />
          <TextField id="pf-phone" label="Phone" type="tel" value={values.phone || ""} onChange={set("phone")} autoComplete="tel" />
          <SelectField id="pf-country" label="Country" options={COUNTRIES} value={values.country || "Kenya"} onChange={set("country")} className="span-2" />
        </div>
        <div className="form-actions">
          {actionError && <p className="form-alert" role="alert">{actionError}</p>}
          <Button type="submit" arrow disabled={busy}>{busy ? "Saving." : "Save profile"}</Button>
          {saved && <p className="small" role="status">Saved to your profile.</p>}
        </div>
      </form>
    </>
  );
}

export default function AccountProfile() {
  useDocumentTitle("Profile");
  return (
    <AccountShell>
      <Profile />
    </AccountShell>
  );
}
