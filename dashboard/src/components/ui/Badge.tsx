import React from "react";
import { Severity } from "@/types";
import { clsx } from "clsx";

export type BadgeVariant =
  | Severity
  | "default"
  | "success"
  | "warning"
  | "orange"
  | "violet"
  | "teal"
  | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "xs" | "sm" | "md";
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<string, string> = {
  critical: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  high: "bg-rose-500/10 text-rose-400 border-rose-500/25",
  medium: "bg-accent-orange-muted text-orange-400 border-accent-orange/30",
  low: "bg-accent-teal-muted text-teal-400 border-accent-teal/30",
  informational: "bg-sage-800/80 text-sage-300 border-sage-700/60",
  default: "bg-sage-850 text-sage-200 border-white/[0.08]",
  neutral: "bg-sage-900 text-sage-400 border-white/[0.06]",
  success: "bg-accent-emerald-muted text-emerald-400 border-accent-emerald/30",
  warning: "bg-accent-amber-muted text-amber-400 border-accent-amber/30",
  orange: "bg-accent-orange-muted text-orange-400 border-accent-orange/30",
  violet: "bg-accent-violet-muted text-violet-400 border-accent-violet/30",
  teal: "bg-accent-teal-muted text-teal-400 border-accent-teal/30",
};

const dotStyles: Record<string, string> = {
  critical: "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)]",
  high: "bg-rose-400",
  medium: "bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
  low: "bg-teal-400",
  informational: "bg-sage-400",
  default: "bg-sage-400",
  neutral: "bg-sage-500",
  success: "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  warning: "bg-amber-400",
  orange: "bg-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.6)]",
  violet: "bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.6)]",
  teal: "bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.6)]",
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
        "inline-flex items-center gap-1.5 font-mono uppercase tracking-wider rounded-md border font-medium select-none",
        size === "xs" && "px-1.5 py-0.2 text-[9px]",
        size === "sm" && "px-2 py-0.5 text-[10px]",
        size === "md" && "px-2.5 py-1 text-xs",
        variantStyles[variant] || variantStyles.default,
        className
      )}
    >
      {dot && (
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full shrink-0",
            dotStyles[variant] || dotStyles.default
          )}
        />
      )}
      <span>{children}</span>
    </span>
  );
};
