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

  // SVG geometry for circular completion ring (diameter = 96, radius = 42)
  const size = 96;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={clsx(
        "flex flex-col sm:flex-row items-center gap-5 p-5 rounded-2xl border transition-all",
        isVerified &&
          "bg-sage-950/80 border-emerald-500/25 shadow-[0_0_24px_rgba(16,185,129,0.12)]",
        isFailed &&
          "bg-sage-950/80 border-rose-500/25 shadow-[0_0_24px_rgba(244,63,94,0.12)]",
        isPending &&
          "bg-sage-950/80 border-amber-500/25 shadow-[0_0_24px_rgba(245,158,11,0.08)]",
        className
      )}
    >
      {/* 1. Large Circular Animated Ring Indicator */}
      <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
        {/* Subtle radial ambient backglow - restrained, not flooding */}
        <div
          className={clsx(
            "absolute inset-0 rounded-full blur-xl pointer-events-none transition-opacity",
            isVerified && "bg-emerald-500/15 opacity-80",
            isFailed && "bg-rose-500/15 opacity-80",
            isPending && "bg-amber-500/10 opacity-60"
          )}
        />

        {/* SVG Circle Completion Ring */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotate-[-90deg] relative z-10"
        >
          {/* Background track circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-white/[0.06]"
          />

          {/* Animated Foreground Progress Circle */}
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
              isVerified && "text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]",
              isFailed && "text-rose-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.5)]",
              isPending && "text-amber-400"
            )}
          />
        </svg>

        {/* Center Icon with entrance animation */}
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          {isVerified && (
            <motion.svg
              viewBox="0 0 24 24"
              className="w-10 h-10 text-emerald-400"
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
              className="text-rose-400"
            >
              <X className="w-10 h-10" />
            </motion.div>
          )}

          {isPending && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="text-amber-400"
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
                "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
              isFailed &&
                "bg-rose-500/10 text-rose-400 border-rose-500/30",
              isPending &&
                "bg-amber-500/10 text-amber-400 border-amber-500/30"
            )}
          >
            {isVerified
              ? "VERIFIED"
              : isFailed
              ? "VERIFICATION FAILED"
              : "VERIFYING"}
          </span>

          {durationSeconds !== undefined && durationSeconds > 0 && (
            <span className="text-[11px] font-mono text-sage-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-sage-500" />
              <span>{durationSeconds}s elapsed</span>
            </span>
          )}
        </div>

        <h3 className="text-base sm:text-lg font-sans font-bold text-white tracking-tight">
          {isVerified
            ? "Isolated Sandbox Guarantee Active"
            : isFailed
            ? "Patch Failed Isolated Verification"
            : "Executing Isolated Sandbox Checks..."}
        </h3>

        <p className="text-xs text-sage-300 font-sans leading-relaxed max-w-xl">
          {isVerified
            ? "Candidate patch passed dual verification: zero security alerts detected on static re-scan and all automated regression unit tests completed green."
            : isFailed
            ? "The synthesized patch could not satisfy sandbox criteria. Code remains locked and flagged for automated retry or human engineering review."
            : "Mounting clean workspace container to re-run static analysis engine and execute full regression test suites."}
        </p>
      </div>
    </div>
  );
};
