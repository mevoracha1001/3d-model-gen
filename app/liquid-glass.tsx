/*
  LiquidGlass — single source of truth for all glass surfaces.
  Pure CSS implementation: no JS, no SVG filters, no mouse tracking.
  All visual behaviour lives in globals.css (.lg-* classes).
*/

type LiquidGlassVariant = "pill" | "chip" | "bubble" | "panel" | "card";

export interface LiquidGlassProps {
  as?: React.ElementType;
  variant?: LiquidGlassVariant;
  tint?: "green";
  className?: string;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLElement>;
  onSubmit?: React.FormEventHandler<HTMLElement>;
  onChange?: React.ChangeEventHandler<HTMLElement>;
  type?: "button" | "submit" | "reset";
  "aria-label"?: string;
  "aria-expanded"?: boolean | "true" | "false";
  disabled?: boolean;
  style?: React.CSSProperties;
  id?: string;
  role?: string;
  tabIndex?: number;
  htmlFor?: string;
}

export function LiquidGlass({
  as: Tag = "div",
  variant = "panel",
  tint,
  className = "",
  children,
  ...rest
}: LiquidGlassProps) {
  const cls = ["lg-surface", `lg-${variant}`, tint ? `lg-tint-${tint}` : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
