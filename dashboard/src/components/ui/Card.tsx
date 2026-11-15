import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";

export interface CardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "subtle" | "charcoal";
  glow?: "green" | "amber" | "none";
  interactive?: boolean;
  className?: string;
}

const variantStyles = {
  default: "surface-card",
  elevated: "surface-elevated",
  subtle: "surface-recessed",
  charcoal: "bg-[#101211] border border-[#292D2A]",
};

export const Card: React.FC<CardProps> = ({
  children,
  variant = "default",
  glow = "none",
  interactive = false,
  className,
  ...props
}) => {
  return (
    <motion.div
      className={clsx(
        "rounded-2xl transition-all duration-200",
        variantStyles[variant],
        interactive && "cursor-pointer hover:-translate-y-0.5 hover:border-[#363C38] hover:shadow-elevated",
        (glow === "green" || glow === "amber") &&
          "hover:border-[#8CFF8C]/50 hover:shadow-[0_0_24px_rgba(140,255,140,0.16)]",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
};
