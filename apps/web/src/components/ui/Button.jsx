import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

/**
 * Button / link-button.
 * variant: solid (olive) | outline | light | ghost-light | text
 * Renders <Link> when `to`, <a> when `href`, otherwise <button>.
 */
export default function Button({
  to,
  href,
  variant = "solid",
  size,
  arrow = false,
  className = "",
  children,
  ...rest
}) {
  const cls = `btn btn--${variant}${size ? ` btn--${size}` : ""} ${className}`.trim();
  const content = (
    <>
      <span>{children}</span>
      {arrow && <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />}
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return <button type="button" className={cls} {...rest}>{content}</button>;
}

/** Understated underlined text link with a small moving arrow. */
export function ArrowLink({ to, href, children, className = "", ...rest }) {
  const cls = `link-arrow ${className}`.trim();
  const inner = (
    <>
      <span>{children}</span>
      <ArrowRight size={15} strokeWidth={1.5} aria-hidden="true" />
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <button type="button" className={cls} {...rest}>{inner}</button>;
}
