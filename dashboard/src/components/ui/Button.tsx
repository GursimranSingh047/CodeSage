import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { buttonPress } from "@/animations/variants";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "teal" | "violet";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    "bg-accent-orange hover:bg-accent-orange-hover text-white font-medium shadow-glow-orange border border-orange-400/30",
  secondary:
    "bg-sage-850 hover:bg-sage-800 text-sage-100 border border-white/[0.08] hover:border-white/[0.16]",
  outline:
    "bg-transparent hover:bg-sage-850 text-sage-200 border border-white/[0.12] hover:border-white/[0.24]",
  ghost:
    "bg-transparent hover:bg-sage-850/70 text-sage-400 hover:text-sage-100 border border-transparent",
  danger:
    "bg-accent-rose-muted hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:border-rose-500/50",
  teal:
    "bg-accent-teal-muted hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 hover:border-teal-500/50 shadow-glow-teal",
  violet:
    "bg-accent-violet-muted hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:border-violet-500/50 shadow-glow-violet",
};

const sizeStyles = {
  xs: "px-2.5 py-1 text-[11px] rounded-md gap-1.5",
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "px-4 py-2 text-sm rounded-lg gap-2",
  lg: "px-5 py-2.5 text-base rounded-xl gap-2.5",
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  iconRight,
  className,
  ...props
}) => {
  return (
    <motion.button
      {...buttonPress}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center font-sans tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-accent-orange/40 disabled:opacity-40 disabled:pointer-events-none select-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" />
      ) : (
        icon && <span className="inline-flex shrink-0">{icon}</span>
      )}
      <span>{children}</span>
      {iconRight && !loading && (
        <span className="inline-flex shrink-0">{iconRight}</span>
      )}
    </motion.button>
  );
};
