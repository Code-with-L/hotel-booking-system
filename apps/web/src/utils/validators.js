const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\d][\d\s().-]{6,}$/;

export const isEmail = (v) => EMAIL_RE.test((v || "").trim());

export function validateGuest(values) {
  const e = {};
  if (!values.firstName?.trim()) e.firstName = "Please enter your first name.";
  if (!values.lastName?.trim()) e.lastName = "Please enter your last name.";
  if (!values.email?.trim()) e.email = "Please enter your email address.";
  else if (!isEmail(values.email)) e.email = "That email address doesn't look right.";
  if (!values.phone?.trim()) e.phone = "Please enter a phone number.";
  else if (!PHONE_RE.test(values.phone.trim())) e.phone = "Use digits, spaces and an optional leading +.";
  if (!values.country) e.country = "Please choose your country.";
  if (values.requests && values.requests.length > 600) e.requests = "Please keep requests under 600 characters.";
  if (!values.privacy) e.privacy = "Please acknowledge the privacy notice to continue.";
  return e;
}

export function validateEnquiry(values) {
  const e = {};
  if (!values.name?.trim()) e.name = "Please enter your name.";
  if (!values.email?.trim()) e.email = "Please enter your email address.";
  else if (!isEmail(values.email)) e.email = "That email address doesn't look right.";
  if (!values.message?.trim()) e.message = "Please add a short message.";
  return e;
}

export function validateSearch({ checkIn, checkOut, adults, children, rooms }) {
  const e = {};
  if (!checkIn) e.checkIn = "Choose a check-in date.";
  if (!checkOut) e.checkOut = "Choose a check-out date.";
  if (checkIn && checkOut && checkOut <= checkIn) e.checkOut = "Check-out must be after check-in.";
  if (adults < 1) e.adults = "At least one adult.";
  if (rooms < 1) e.rooms = "At least one room.";
  if (children < 0) e.children = "Invalid.";
  return e;
}
