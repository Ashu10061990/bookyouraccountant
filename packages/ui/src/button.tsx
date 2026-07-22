import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

const VARIANTS = {
  primary: "bg-navy text-cream hover:brightness-110",
  ghost: "bg-transparent text-ink-soft border border-line hover:bg-paper2",
  danger: "bg-danger text-white hover:brightness-110",
} as const;

const SIZES = {
  sm: "px-3.5 py-2 text-sm",
  md: "px-5 py-3 text-base",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  isLoading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-body font-bold",
        "transition disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </button>
  );
}
