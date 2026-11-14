import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { tooltipVariants } from "@/animations/variants";
import { clsx } from "clsx";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
  className?: string;
}

const positionClasses = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = "top",
  delay = 200,
  className,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timer, setTimer] = useState<number | null>(null);

  const showTooltip = () => {
    const id = window.setTimeout(() => setIsVisible(true), delay);
    setTimer(id);
  };

  const hideTooltip = () => {
    if (timer) clearTimeout(timer);
    setIsVisible(false);
  };

  return (
    <div
      className={clsx("relative inline-flex", className)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <AnimatePresence>
        {isVisible && content && (
          <motion.div
            variants={tooltipVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={clsx(
              "absolute z-50 px-2.5 py-1 text-[11px] font-sans font-medium text-sage-100 bg-sage-850/95 backdrop-blur-md border border-white/[0.12] rounded-lg shadow-glass-elevated pointer-events-none whitespace-nowrap",
              positionClasses[position]
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
