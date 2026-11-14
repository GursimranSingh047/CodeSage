import React from "react";
import { clsx } from "clsx";

export interface SkeletonProps {
  className?: string;
  variant?: "rectangular" | "circular" | "text";
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = "rectangular",
  width,
  height,
}) => {
  return (
    <div
      style={{ width, height }}
      className={clsx(
        "relative overflow-hidden bg-sage-850/70 border border-white/[0.04]",
        variant === "circular" && "rounded-full",
        variant === "text" && "rounded h-4 my-1",
        variant === "rectangular" && "rounded-xl",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/[0.05] before:to-transparent",
        className
      )}
    />
  );
};
