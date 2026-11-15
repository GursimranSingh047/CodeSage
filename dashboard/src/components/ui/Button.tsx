import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { buttonPress } from "@/animations/variants";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: React.ReactNode;
  variant?: "primary" | "green" | "amber" | "secondary" | "outline" | "ghost" | "danger";
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  // Signature Primary Green (#8CFF8C) with deep black text & subtle energy glow
  primary:
    "bg-[#8CFF8C] hover:bg-[#72E672] active:bg-[#5ED45E] text-[#080909] font-semibold border border-[#8CFF8C] shadow-[0_0_16px_rgba(140,255,140,0.22)] hover:shadow-[0_0_24px_rgba(140,255,140,0.35)] transition-all",
  green:
    "bg-[#8CFF8C] hover:bg-[#72E672] active:bg-[#5ED45E] text-[#080909] font-semibold border border-[#8CFF8C] shadow-[0_0_16px_rgba(140,255,140,0.22)] hover:shadow-[0_0_24px_rgba(140,255,140,0.35)] transition-all",
  // Amber mapped to signature green for backward compatibility
  amber:
    "bg-[#8CFF8C] hover:bg-[#72E672] active:bg-[#5ED45E] text-[#080909] font-semibold border border-[#8CFF8C] shadow-[0_0_16px_rgba(140,255,140,0.22)] transition-all",
  // Elevated dark surface (#151716) with subtle border
  secondary:
    "bg-[#151716] hover:bg-[#1C1F1E] active:bg-[#121413] text-[#F4F5F4] font-medium border border-[#292D2A] hover:border-[#363C38] shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-all",
  // Transparent outline with technical dark border
  outline:
    "bg-transparent hover:bg-[#151716] active:bg-[#101211] text-[#F4F5F4] font-medium border border-[#292D2A] hover:border-[#363C38] transition-all",
  // Ghost with minimal hover fill
  ghost:
    "bg-transparent hover:bg-[#151716] active:bg-[#101211] text-[#A5AAA6] hover:text-[#F4F5F4] border border-transparent transition-all",
  // Restrained semantic danger
  danger:
    "bg-[#FF5555]/10 hover:bg-[#FF5555]/20 text-[#FF5555] font-medium border border-[#FF5555]/30 transition-all",
};

const sizeStyles = {
  xs: "px-2.5 py-1 text-[11px] rounded-lg gap-1.5",
  sm: "px-3 py-1.5 text-xs rounded-xl gap-1.5",
  md: "px-4 py-2 text-xs rounded-xl gap-2",
  lg: "px-5 py-2.5 text-sm rounded-xl gap-2.5",
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
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
        "inline-flex items-center justify-center font-sans tracking-tight focus:outline-none focus:ring-2 focus:ring-[#8CFF8C] focus:ring-offset-2 focus:ring-offset-[#080909] disabled:opacity-40 disabled:pointer-events-none select-none cursor-pointer",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-current shrink-0" />
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
