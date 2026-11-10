import { useState } from "react";
import { RouterProvider } from "react-router-dom";
import { createRouter } from "./router.jsx";
import { BookingProvider } from "@/features/reservations/BookingContext.jsx";
import { AuthProvider } from "@/features/guest-account/AuthContext.jsx";

export default function App() {
  // Created once per mount (browser only).
  const [router] = useState(createRouter);
  return (
    <AuthProvider>
      <BookingProvider>
        <RouterProvider router={router} />
      </BookingProvider>
    </AuthProvider>
  );
}
