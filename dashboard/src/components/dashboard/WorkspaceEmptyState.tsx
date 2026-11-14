import React from "react";
import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface WorkspaceEmptyStateProps {
  onFocusInput?: () => void;
}

export const WorkspaceEmptyState: React.FC<WorkspaceEmptyStateProps> = ({ onFocusInput }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center max-w-lg mx-auto">
      {/* Animated Security Illustration */}
      <div className="relative w-40 h-40 mb-8 flex items-center justify-center">
        {/* Pulsing Concentric Radar Rings */}
        <motion.div
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.15, 0.4, 0.15],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 rounded-full border border-accent-orange/20 bg-accent-orange/5"
        />
        <motion.div
          animate={{
            scale: [1.1, 1.45, 1.1],
            opacity: [0.1, 0.25, 0.1],
          }}
          transition={{
            duration: 4,
            delay: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -inset-4 rounded-full border border-dashed border-accent-violet/20"
        />

        {/* Orbiting Security Node */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: 16,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 flex items-start justify-center"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-accent-orange shadow-[0_0_10px_rgba(249,115,22,0.8)] -translate-y-1" />
        </motion.div>

        {/* Counter Orbiting Violet Node */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 flex items-end justify-center"
        >
          <div className="w-2 h-2 rounded-full bg-accent-violet shadow-[0_0_8px_rgba(139,92,246,0.8)] translate-y-1" />
        </motion.div>

        {/* Handcrafted Center Shield Graphic */}
        <div className="relative z-10 w-20 h-20 rounded-2xl glass-panel-elevated border border-white/[0.12] flex items-center justify-center shadow-glass-elevated">
          <svg
            className="w-10 h-10 text-accent-orange filter drop-shadow-[0_0_12px_rgba(249,115,22,0.4)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      </div>

      {/* Copy */}
      <h3 className="text-xl sm:text-2xl font-sans font-semibold text-white tracking-tight mb-2.5">
        Your security workspace is empty.
      </h3>
      <p className="text-sm text-sage-400 font-sans max-w-sm leading-relaxed mb-6">
        Connect a repository and run your first scan.
      </p>

      {/* CTA Button */}
      {onFocusInput && (
        <Button
          variant="outline"
          size="sm"
          onClick={onFocusInput}
          icon={<ArrowDown className="w-4 h-4 text-accent-orange" />}
          className="group hover:border-accent-orange/40"
        >
          <span>Configure Target Repository</span>
        </Button>
      )}
    </div>
  );
};
