import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "action" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-white hover:bg-black disabled:bg-ink-faint border border-transparent",
  secondary:
    "bg-paper text-ink border border-ink hover:bg-surface disabled:opacity-50",
  ghost:
    "bg-transparent text-ink-soft border border-transparent hover:bg-surface-high disabled:opacity-50",
  action:
    "bg-transparent text-evidence border border-transparent hover:bg-evidence/10 disabled:opacity-50",
  danger:
    "bg-transparent text-danger border border-transparent hover:bg-danger/10 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[0.8125rem]",
  md: "h-9 px-3.5 text-sm",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "secondary", size = "md", className = "", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-1.5 rounded font-medium whitespace-nowrap transition-colors focus-ring disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  },
);
