import { Variants } from "framer-motion";

/** Page fade and slight vertical slide */
export const pageTransitionVariants: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.18, ease: "easeInOut" },
  },
};

/** Staggered list container */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.04,
    },
  },
};

/** Card entrance animation */
export const cardEntrance: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] },
  },
};

/** Interactive button press */
export const buttonPress = {
  whileHover: { y: -1, transition: { duration: 0.15 } },
  whileTap: { scale: 0.98, y: 0, transition: { duration: 0.08 } },
};

/** Sidebar navigation item hover & active pill */
export const navItemHover: Variants = {
  idle: { x: 0 },
  hover: { x: 3, transition: { duration: 0.15, ease: "easeOut" } },
};

/** Tooltip transition */
export const tooltipVariants: Variants = {
  hidden: { opacity: 0, y: 4, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.15, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: 2,
    scale: 0.96,
    transition: { duration: 0.1, ease: "easeIn" },
  },
};

/** Expandable disclosure transition */
export const expandablePanel: Variants = {
  collapsed: { height: 0, opacity: 0, overflow: "hidden" },
  expanded: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
  },
};
