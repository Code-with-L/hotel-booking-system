/**
 * Search strip for pages that don't host the booking flow themselves (e.g. /rooms).
 * Holds local state and hands off to /availability with the chosen party via URL params.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AvailabilityBar, { searchToQuery } from "@/components/booking/AvailabilityBar.jsx";
import Button from "@/components/ui/Button.jsx";
import { defaultSearch } from "@/features/reservations/BookingContext.jsx";

export default function AvailabilityBarLink() {
  const [values, setValues] = useState(() => defaultSearch());
  const navigate = useNavigate();

  return (
    <div className="bar-strip__inner">
      <AvailabilityBar variant="bar" values={values} onChange={setValues} />
      <Button variant="solid" className="bar-strip__cta" onClick={() => navigate(`/availability?${searchToQuery(values)}`)}>
        Check availability
      </Button>
    </div>
  );
}
