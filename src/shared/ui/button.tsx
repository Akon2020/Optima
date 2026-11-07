import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/shared/lib/cn";

export type ButtonVariant = "action" | "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  action: "bg-action text-on-action hover:bg-action-hover shadow-sm",
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-sm",
  outline: "border border-border-strong bg-surface text-text hover:bg-bg-subtle",
  ghost: "text-text-muted hover:bg-bg-subtle hover:text-text",
  danger: "bg-danger-subtle text-danger hover:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

/** Classes d'un bouton, réutilisables par un lien stylé en bouton. */
export function buttonClasses(
  variant: ButtonVariant = "action",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,color,box-shadow,filter] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "action", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...props} />
  );
});

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Libellé obligatoire : il est lu par les lecteurs d'écran. */
  label: string;
  variant?: "outline" | "ghost" | "action";
  size?: "sm" | "md";
};

/** Bouton-icône avec `aria-label` obligatoire (docs/DESIGN_SYSTEM.md § 8). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "outline", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
        variant === "outline" &&
          "border border-border-strong bg-surface text-text hover:bg-bg-subtle",
        variant === "ghost" && "text-text-muted hover:bg-bg-subtle hover:text-text",
        variant === "action" && "bg-action text-on-action hover:bg-action-hover",
        size === "md" ? "size-11" : "size-9",
        className,
      )}
      {...props}
    />
  );
});
