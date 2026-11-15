import React from "react";
import { motion } from "framer-motion";
import { ArrowDown, Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface WorkspaceEmptyStateProps {
  onFocusInput?: () => void;
}

export const WorkspaceEmptyState: React.FC<WorkspaceEmptyStateProps> = ({ onFocusInput }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center max-w-lg mx-auto select-none">
      {/* Animated Security Graphic */}
      <div className="relative w-36 h-36 mb-6 flex items-center justify-center">
        {/* Pulsing Concentric Rings */}
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
          className="absolute inset-0 rounded-full border border-[#8CFF8C]/30 bg-[#8CFF8C]/5"
        />

        {/* Orbiting Green Node */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration: 16,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 flex items-start justify-center"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-[#8CFF8C] shadow-[0_0_10px_rgba(140,255,140,0.8)] -translate-y-1" />
        </motion.div>

        {/* Center Shield Graphic */}
        <div className="relative z-10 w-16 h-16 rounded-2xl bg-[#151716] border border-[#292D2A] flex items-center justify-center shadow-elevated">
          <Shield className="w-8 h-8 text-[#8CFF8C]" />
        </div>
      </div>

      {/* Copy */}
      <h3 className="text-xl sm:text-2xl font-sans font-bold text-[#F4F5F4] tracking-tight mb-2">
        Your security workspace is empty.
      </h3>
      <p className="text-xs sm:text-sm text-[#A5AAA6] font-sans max-w-sm leading-relaxed mb-6">
        Target a repository above to initiate automated vulnerability scanning and verified remediation.
      </p>

      {/* CTA Button */}
      {onFocusInput && (
        <Button
          variant="primary"
          size="sm"
          onClick={onFocusInput}
          icon={<ArrowDown className="w-4 h-4 text-[#080909]" />}
          className="font-sans font-bold text-xs"
        >
          <span>Configure Target Repository</span>
        </Button>
      )}
    </div>
  );
};
