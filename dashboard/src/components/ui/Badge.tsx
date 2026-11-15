import React from "react";
import { Severity } from "@/types";
import { clsx } from "clsx";

export type BadgeVariant =
  | Severity
  | "default"
  | "success"
  | "green"
  | "warning"
  | "amber"
  | "charcoal"
  | "neutral"
  | "orange"
  | "violet"
  | "teal";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "xs" | "sm" | "md";
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<string, string> = {
  // Precision technical severity badges
  critical: "bg-[#FF5555]/10 text-[#FF5555] border border-[#FF5555]/30",
  high: "bg-[#FFB84D]/10 text-[#FFB84D] border border-[#FFB84D]/30",
  medium: "bg-[#151716] text-[#A5AAA6] border border-[#292D2A]",
  low: "bg-[#101211] text-[#666C68] border border-[#292D2A]",
  informational: "bg-[#101211] text-[#666C68] border border-[#292D2A]",

  // Green / Success / Verified status
  green: "bg-[#8CFF8C]/10 text-[#8CFF8C] border border-[#8CFF8C]/35",
  success: "bg-[#8CFF8C]/10 text-[#8CFF8C] border border-[#8CFF8C]/35",
  amber: "bg-[#8CFF8C]/10 text-[#8CFF8C] border border-[#8CFF8C]/35",

  // Neutral technical surfaces
  default: "bg-[#151716] text-[#F4F5F4] border border-[#292D2A]",
  charcoal: "bg-[#151716] text-[#F4F5F4] border border-[#292D2A]",
  neutral: "bg-[#101211] text-[#A5AAA6] border border-[#292D2A]",
  warning: "bg-[#FFB84D]/10 text-[#FFB84D] border border-[#FFB84D]/30",

  orange: "bg-[#FFB84D]/10 text-[#FFB84D] border border-[#FFB84D]/30",
  violet: "bg-[#151716] text-[#F4F5F4] border border-[#292D2A]",
  teal: "bg-[#8CFF8C]/10 text-[#8CFF8C] border border-[#8CFF8C]/35",
};

const dotStyles: Record<string, string> = {
  critical: "bg-[#FF5555]",
  high: "bg-[#FFB84D]",
  medium: "bg-[#A5AAA6]",
  low: "bg-[#666C68]",
  informational: "bg-[#666C68]",
  green: "bg-[#8CFF8C] shadow-[0_0_6px_rgba(140,255,140,0.8)]",
  success: "bg-[#8CFF8C] shadow-[0_0_6px_rgba(140,255,140,0.8)]",
  amber: "bg-[#8CFF8C] shadow-[0_0_6px_rgba(140,255,140,0.8)]",
  default: "bg-[#8CFF8C]",
  charcoal: "bg-[#F4F5F4]",
  neutral: "bg-[#666C68]",
  warning: "bg-[#FFB84D]",
  orange: "bg-[#FFB84D]",
  violet: "bg-[#8CFF8C]",
  teal: "bg-[#8CFF8C]",
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "sm",
  className,
  dot = false,
}) => {
  return (
    <span
      className={clsx(
        "inline-flex items-center font-mono font-medium tracking-tight rounded-full select-none",
        variantStyles[variant] || variantStyles.default,
        size === "xs" && "px-2 py-0.5 text-[10px] gap-1",
        size === "sm" && "px-2.5 py-0.5 text-[11px] gap-1.5",
        size === "md" && "px-3 py-1 text-xs gap-1.5",
        className
      )}
    >
      {dot && (
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full shrink-0",
            dotStyles[variant] || "bg-[#8CFF8C]"
          )}
        />
      )}
      <span>{children}</span>
    </span>
  );
};
