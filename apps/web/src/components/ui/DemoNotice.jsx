import { Info } from "lucide-react";

/**
 * Clearly distinguishes demonstration / sample content from confirmed facts.
 * variant: inline (small tag) | block (bordered notice)
 */
export default function DemoNotice({ children, variant = "block", label = "Demonstration" }) {
  if (variant === "inline") {
    return <span className="demo-tag">{label}</span>;
  }
  return (
    <div className="demo-notice" role="note">
      <Info size={16} strokeWidth={1.5} aria-hidden="true" />
      <p>
        <strong>{label}.</strong> {children}
      </p>
    </div>
  );
}
