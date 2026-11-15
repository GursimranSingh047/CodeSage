import React from "react";
import { motion } from "framer-motion";
import { X, Clock } from "lucide-react";
import { clsx } from "clsx";

interface VerificationIndicatorProps {
  status: "verified" | "failed" | "pending";
  durationSeconds?: number;
  className?: string;
}

export const VerificationIndicator: React.FC<VerificationIndicatorProps> = ({
  status,
  durationSeconds,
  className,
}) => {
  const isVerified = status === "verified";
  const isFailed = status === "failed";
  const isPending = status === "pending";

  const size = 96;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={clsx(
        "flex flex-col sm:flex-row items-center gap-5 p-6 rounded-2xl surface-card border transition-all select-none",
        isVerified &&
          "border-[#8CFF8C]/35 shadow-[0_0_24px_rgba(140,255,140,0.12)]",
        isFailed &&
          "border-[#FF5555]/30 shadow-[0_0_24px_rgba(255,85,85,0.12)]",
        isPending &&
          "border-[#8CFF8C]/40 shadow-[0_0_24px_rgba(140,255,140,0.1)]",
        className
      )}
    >
      {/* 1. Large Circular Animated Ring Indicator */}
      <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
        {/* Subtle radial ambient backglow */}
        <div
          className={clsx(
            "absolute inset-0 rounded-full blur-xl pointer-events-none transition-opacity",
            isVerified && "bg-[#8CFF8C]/15 opacity-80",
            isFailed && "bg-[#FF5555]/15 opacity-80",
            isPending && "bg-[#8CFF8C]/20 opacity-80"
          )}
        />

        {/* SVG Circle Completion Ring */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg] relative z-10"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-[#1A1D1B]"
          />

          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{
              strokeDashoffset: isPending ? circumference * 0.3 : 0,
            }}
            transition={{
              duration: 1.1,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={clsx(
              isVerified && "text-[#8CFF8C]",
              isFailed && "text-[#FF5555]",
              isPending && "text-[#8CFF8C]"
            )}
          />
        </svg>

        {/* Center Icon */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          {isVerified && (
            <motion.svg
              viewBox="0 0 24 24"
              className="w-10 h-10 text-[#8CFF8C]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M20 6L9 17l-5-5"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  duration: 0.6,
                  delay: 0.35,
                  ease: "easeOut",
                }}
              />
            </motion.svg>
          )}

          {isFailed && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 15, delay: 0.2 }}
              className="text-[#FF5555]"
            >
              <X className="w-10 h-10" />
            </motion.div>
          )}

          {isPending && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="text-[#8CFF8C]"
            >
              <Clock className="w-8 h-8" />
            </motion.div>
          )}
        </div>
      </div>

      {/* 2. State Typography & Guarantees */}
      <div className="space-y-1.5 text-center sm:text-left flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
          <span
            className={clsx(
              "px-2.5 py-0.5 rounded font-mono text-xs font-bold tracking-widest uppercase border",
              isVerified &&
                "bg-[#16351F] text-[#8CFF8C] border-[#8CFF8C]/35",
              isFailed &&
                "bg-[#FF5555]/10 text-[#FF5555] border-[#FF5555]/30",
              isPending &&
                "bg-[#16351F] text-[#8CFF8C] border-[#8CFF8C]/35"
            )}
          >
            {isVerified
              ? "VERIFIED"
              : isFailed
              ? "VERIFICATION FAILED"
              : "VERIFYING"}
          </span>

          {typeof durationSeconds === "number" && (
            <span className="text-[11px] font-mono text-[#666C68]">
              Completed in {durationSeconds.toFixed(1)}s
            </span>
          )}
        </div>

        <p className="text-xs text-[#A5AAA6] font-sans max-w-md">
          {isVerified &&
            "Patch atomically applied, syntax parsed with 0 errors, security scan produced 0 findings, and test assertions passed."}
          {isFailed &&
            "One or more verification checks failed. The pull request will not be opened until the patch passes regression validation."}
          {isPending &&
            "Running dual validation: static security scan with AST analysis and automated test suite in isolated Docker container."}
        </p>
      </div>
    </div>
  );
};
