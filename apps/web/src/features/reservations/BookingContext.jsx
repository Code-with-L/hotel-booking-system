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
  checkIn: todayISO(),
  checkOut: addDays(todayISO(), 1),
  adults: 1,
  children: 0,
  rooms: 1,
});

const initial = () => {
  const saved = session.get(KEY, null);
  // Never initialise the booking form from a saved draft — the party starts
  // fresh (1/0/1) every visit; only an explicit choice this session, a URL
  // param, or the guest-details/review pages use the draft.
  return {
    search: defaultSearch(),
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
