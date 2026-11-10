import { createBrowserRouter } from "react-router-dom";
import PublicLayout from "@/components/layout/PublicLayout.jsx";
import AdminLayout from "@/components/layout/AdminLayout.jsx";
import Legal from "@/pages/Legal.jsx";

/** Route-level code splitting: each page module is loaded on demand. */
const page = (load) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export const routes = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, ...page(() => import("@/pages/Home.jsx")) },
      { path: "rooms", ...page(() => import("@/pages/Rooms.jsx")) },
      { path: "rooms/:slug", ...page(() => import("@/pages/RoomDetails.jsx")) },
      { path: "experiences", ...page(() => import("@/pages/Experiences.jsx")) },
      { path: "dining", ...page(() => import("@/pages/Dining.jsx")) },
      { path: "story", ...page(() => import("@/pages/Story.jsx")) },
      { path: "availability", ...page(() => import("@/pages/Availability.jsx")) },
      { path: "booking/guest-details", ...page(() => import("@/pages/GuestDetails.jsx")) },
      { path: "booking/review", ...page(() => import("@/pages/BookingReview.jsx")) },
      { path: "booking/confirmation", ...page(() => import("@/pages/BookingConfirmation.jsx")) },
      { path: "account", ...page(() => import("@/pages/Account.jsx")) },
      { path: "account/reservations", ...page(() => import("@/pages/AccountReservations.jsx")) },
      { path: "account/profile", ...page(() => import("@/pages/AccountProfile.jsx")) },
      { path: "privacy", element: <Legal doc="privacy" /> },
      { path: "terms", element: <Legal doc="terms" /> },
      { path: "*", ...page(() => import("@/pages/NotFound.jsx")) },
    ],
  },
  {
    path: "admin",
    element: <AdminLayout />,
    children: [
      { index: true, ...page(() => import("@/pages/Admin/Dashboard.jsx")) },
      { path: "reservations", ...page(() => import("@/pages/Admin/Reservations.jsx")) },
      { path: "rooms", ...page(() => import("@/pages/Admin/Rooms.jsx")) },
      { path: "guests", ...page(() => import("@/pages/Admin/Guests.jsx")) },
      { path: "rates", ...page(() => import("@/pages/Admin/Rates.jsx")) },
      { path: "reports", ...page(() => import("@/pages/Admin/Reports.jsx")) },
      { path: "settings", ...page(() => import("@/pages/Admin/Settings.jsx")) },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
