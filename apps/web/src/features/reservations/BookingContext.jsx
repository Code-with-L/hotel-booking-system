/**
 * Booking draft state, persisted in sessionStorage across the booking flow:
 *   search     { checkIn, checkOut, adults, children, rooms }
 *   selection  { roomSlug, roomName, ratePlanId, ratePlanName, nightly, nights, image }
 *   guest      { firstName, lastName, email, phone, country, requests, privacy }
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { session } from "@/utils/storage.js";
import { addDays, todayISO } from "@/utils/dates.js";

const KEY = "stillhouse.booking";

export const defaultSearch = () => ({
  checkIn: addDays(todayISO(), 21),
  checkOut: addDays(todayISO(), 24),
  adults: 2,
  children: 0,
  rooms: 1,
});

const initial = () => {
  const saved = session.get(KEY, null);
  return {
    search: saved?.search || defaultSearch(),
    selection: saved?.selection || null,
    guest: saved?.guest || null,
  };
};

const BookingContext = createContext(null);

export function BookingProvider({ children }) {
  const [state, setState] = useState(initial);

  const update = useCallback((patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      session.set(KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      setSearch: (search) => update({ search, selection: null }),
      setSelection: (selection) => update({ selection }),
      setGuest: (guest) => update({ guest }),
      clearDraft: () => {
        session.remove(KEY);
        setState({ search: defaultSearch(), selection: null, guest: null });
      },
    }),
    [state, update]
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used inside <BookingProvider>");
  return ctx;
}
