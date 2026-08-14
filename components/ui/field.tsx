import { forwardRef, useId } from "react";

/**
 * Minimalist input from DESIGN.md: no fill, single bottom border that thickens
 * and turns to ink on focus.
 */
export const TextField = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string }
>(function TextField({ label, className = "", id, ...props }, ref) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-xs font-medium tracking-[0.01em] text-ink-soft"
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={`h-9 w-full border-0 border-b border-line bg-transparent text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-b-2 focus:border-ink ${className}`}
        {...props}
      />
    </div>
  );
});
