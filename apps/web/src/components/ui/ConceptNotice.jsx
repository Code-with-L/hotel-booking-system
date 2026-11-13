/**
 * ConceptNotice — owner-approved concept-property disclosure (M8-D2).
 * Used at booking decision points; do not duplicate copy inline.
 */
export default function ConceptNotice({ compact = false }) {
  return (
    <p className="concept-note" role="note">
      {compact
        ? "The Stillhouse is a concept property; details here are illustrative."
        : "The Stillhouse is a concept property. Imagery, prices, availability and reservation details shown on this site are illustrative of a fictional retreat — not a real booking at a real hotel."}
    </p>
  );
}
