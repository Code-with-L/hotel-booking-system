/** Global site content: navigation, contact placeholders, legal copy. */

export const NAV_LINKS = [
  { label: "Stay", to: "/rooms" },
  { label: "Experiences", to: "/experiences" },
  { label: "Dining", to: "/dining" },
  { label: "Our Story", to: "/story" },
];

export const SITE = {
  name: "The Stillhouse",
  tagline: "A quieter kind of extraordinary.",
  location: "Naivasha, Kenya",
  coordinates: "0°43′S · 36°26′E",
  // Contact: WhatsApp only — no email, no social channels.
  phone: "+254 708 097 490",
  whatsappMessage: "Hi! I'd like to ask about booking at The Stillhouse.",
};

export const COUNTRIES = [
  "Kenya", "Tanzania", "Uganda", "Rwanda", "Ethiopia", "South Africa", "Nigeria", "Egypt",
  "United Kingdom", "Ireland", "France", "Germany", "Italy", "Spain", "Netherlands",
  "Switzerland", "Sweden", "Norway", "United States", "Canada", "Australia", "New Zealand",
  "United Arab Emirates", "India", "Japan", "Singapore", "China", "Brazil", "Other",
];

export const LEGAL = {
  privacy: {
    title: "Privacy policy",
    intro:
      "This policy explains how The Stillhouse collects, uses and protects your personal data when you book with us or contact us.",
    sections: [
      {
        heading: "What we collect",
        body:
          "To hold a reservation we collect your name, contact details (email and phone), National ID number (required for hotel guest registration in Kenya), country, and details of your stay. Account passwords are stored only as bcrypt hashes. Payment providers process card and M-Pesa details directly; The Stillhouse never stores raw card numbers or PINs.",
      },
      {
        heading: "Why we collect it and how long we keep it",
        body:
          "We use your details to manage your booking, register your stay and meet our tax obligations in Kenya, and respond to your enquiries. Reservation records are retained as required for accounting; marketing consent is opt-in and can be withdrawn at any time by contacting reservations.",
      },
      {
        heading: "Your rights",
        body:
          "You may request access to, correction of, or erasure of your personal data, subject to legal and tax retention requirements. Chat to us on WhatsApp (+254 708 097 490).",
      },
    ],
  },
  terms: {
    title: "Terms and conditions",
    intro:
      "These terms govern reservations made with The Stillhouse.",
    sections: [
      {
        heading: "Rates and payment",
        body:
          "All prices are shown in Kenyan shillings and include service charge, tourism levy and VAT as itemised at the time of booking. Payment is collected on arrival or by M-Pesa via the secure Daraja link once you confirm your booking.",
      },
      {
        heading: "Cancellation",
        body:
          "Cancellation terms attached to each rate plan are binding at the time of booking: the Flexible rate is free to cancel up to 7 days before arrival; Advance purchase is non-refundable.",
      },
    ],
  },
};
