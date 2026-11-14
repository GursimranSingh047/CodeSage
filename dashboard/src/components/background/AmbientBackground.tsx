import React from "react";
import { motion } from "framer-motion";

export const AmbientBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Deep graphite base overlay */}
      <div className="absolute inset-0 bg-sage-950" />

      {/* Subtle architectural dot grid */}
      <div className="absolute inset-0 bg-grid-subtle opacity-70" />

      {/* Floating subtle ambient gradient orbs */}
      <motion.div
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -40, 20, 0],
          scale: [1, 1.08, 0.95, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -top-[18%] -left-[10%] w-[580px] h-[580px] rounded-full bg-accent-orange/[0.035] blur-[140px]"
      />

      <motion.div
        animate={{
          x: [0, -35, 25, 0],
          y: [0, 45, -30, 0],
          scale: [1, 0.94, 1.06, 1],
        }}
        transition={{
          duration: 26,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute top-[35%] -right-[12%] w-[640px] h-[640px] rounded-full bg-accent-violet/[0.04] blur-[160px]"
      />

      <motion.div
        animate={{
          x: [0, 25, -20, 0],
          y: [0, 30, -25, 0],
          scale: [1, 1.05, 0.96, 1],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4,
        }}
        className="absolute -bottom-[15%] left-[25%] w-[600px] h-[600px] rounded-full bg-accent-teal/[0.025] blur-[150px]"
      />

      {/* Constellation nodes: subtle SVG nodes connection in corner */}
      <svg
        className="absolute top-0 right-0 w-96 h-96 opacity-[0.08] stroke-white"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
      >
        <circle cx="280" cy="80" r="2.5" fill="#f97316" />
        <circle cx="340" cy="140" r="2" fill="#8b5cf6" />
        <circle cx="210" cy="190" r="2.5" fill="#14b8a6" />
        <circle cx="310" cy="270" r="2" fill="#ffffff" />
        <line x1="280" y1="80" x2="340" y2="140" strokeWidth="0.75" strokeDasharray="3 3" />
        <line x1="340" y1="140" x2="210" y2="190" strokeWidth="0.75" />
        <line x1="210" y1="190" x2="310" y2="270" strokeWidth="0.75" strokeDasharray="3 3" />
      </svg>
    </div>
  );
};
