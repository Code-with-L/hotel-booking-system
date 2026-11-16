const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isEmail = (v) => EMAIL_RE.test((v || "").trim());

export function validateGuest(values) {
  const e = {};
  if (!values.firstName?.trim()) e.firstName = "Please enter your first name.";
  if (!values.lastName?.trim()) e.lastName = "Please enter your last name.";
  if (!values.email?.trim()) e.email = "Please enter your email address.";
  else if (!isEmail(values.email)) e.email = "That email address doesn't look right.";
  if (!values.idNumber?.trim()) e.idNumber = "Please enter your national ID number.";
  else if (!/^\d{5,12}$/.test(values.idNumber.trim())) e.idNumber = "National ID is digits only (5-12).";
  if (!values.phone?.trim()) e.phone = "Please enter your phone number (9 digits).";
  else if (!/^\d{9}$/.test(values.phone.replace(/\D/g, ""))) e.phone = "Kenyan numbers only — enter the 9 digits after the country code.";
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
  if (checkIn && checkOut && checkOut > checkIn) {
    const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
    if (nights > 14) e.checkOut = "Stays longer than 14 nights can't be booked online. Please contact the front desk.";
  }
  if (adults < 1) e.adults = "At least one adult.";
  if (rooms < 1) e.rooms = "At least one room.";
  if (children < 0) e.children = "Invalid.";
  if (rooms >= 1 && adults > rooms * 2) e.adults = "Each room sleeps up to 2 adults. Pick more rooms or fewer guests.";
  if (rooms >= 1 && children > rooms * 2) e.children = "Up to two children per room, please.";
  return e;
}
