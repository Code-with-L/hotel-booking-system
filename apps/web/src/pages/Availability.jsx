import AvailabilitySection from "@/features/availability/AvailabilitySection.jsx";
import { useDocumentTitle } from "@/hooks/useDocumentTitle.js";

export default function Availability() {
  useDocumentTitle("Availability");
  return (
    <div className="page-top booking-page">
      <div className="container">
        <AvailabilitySection />
      </div>
    </div>
  );
}
