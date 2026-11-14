import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";

export interface CardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  variant?: "default" | "elevated" | "subtle";
  glow?: "orange" | "violet" | "teal" | "none";
  interactive?: boolean;
  className?: string;
}

const variantStyles = {
  default: "glass-panel",
  elevated: "glass-panel-elevated",
  subtle: "glass-panel-subtle",
};

const glowStyles: Record<string, string> = {
  orange: "hover:border-accent-orange/40 hover:shadow-glow-orange",
  violet: "hover:border-accent-violet/40 hover:shadow-glow-violet",
  teal: "hover:border-accent-teal/40 hover:shadow-glow-teal",
  none: "",
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
        "rounded-xl transition-all duration-300",
        variantStyles[variant],
        interactive && "cursor-pointer hover:-translate-y-0.5",
        glowStyles[glow],
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
};
