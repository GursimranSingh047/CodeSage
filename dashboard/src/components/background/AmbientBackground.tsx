import React from "react";
import { motion } from "framer-motion";

export const AmbientBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">
      {/* Deep Technical Black (#080909) */}
      <div className="absolute inset-0 bg-[#080909]" />

      {/* Technical Precision Dot Grid */}
      <div className="absolute inset-0 technical-grid opacity-60" />

      {/* Faint ambient green aura near top right / hero area */}
      <motion.div
        animate={{
          scale: [1, 1.06, 0.96, 1],
          opacity: [0.25, 0.35, 0.28, 0.25],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute top-1/4 right-1/4 w-[650px] h-[650px] rounded-full bg-[#8CFF8C]/[0.035] blur-[140px]"
      />

      {/* Deep vignette at the bottom */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[#080909] to-transparent pointer-events-none" />
    </div>
  );
};
