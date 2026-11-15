import React from "react";
import { Check, Loader2 } from "lucide-react";
import { Finding, VerificationResult } from "@/types";
import { clsx } from "clsx";

interface VerificationTabProps {
  finding: Finding;
  verification?: VerificationResult | null;
  className?: string;
}

export const VerificationTab: React.FC<VerificationTabProps> = ({
  finding,
  verification,
  className,
}) => {
  const isPassed =
    verification?.passed ?? (finding.status?.includes("verified") ?? false);

  const checks = [
    {
      id: "patch",
      title: "Patch Applied",
      status: "complete",
    },
    {
      id: "syntax",
      title: "Syntax Validation",
      status: "complete",
    },
    {
      id: "security_scan",
      title: "Security Scan (Semgrep, Bandit)",
      status: isPassed ? "complete" : "active",
    },
    {
      id: "tests",
      title: "Tests (pytest)",
      status: isPassed ? "complete" : "pending",
    },
    {
      id: "resolved",
      title: "Finding Resolved",
      status: isPassed ? "complete" : "pending",
    },
  ];

  // Number of segments in the circular progress ring
  const totalSegments = 28;
  const activeSegments = isPassed ? 28 : 17; // ~60%
  const percentNumber = isPassed ? 100 : 60;

  return (
    <div
      className={clsx(
        "surface-card rounded-2xl p-6 sm:p-7 space-y-6 relative overflow-hidden select-none border border-[#292D2A]",
        className
      )}
    >
      {/* Top Header */}
      <div className="space-y-1 pb-4 border-b border-[#292D2A]">
        <div className="inline-flex items-center gap-1.5 text-xs font-mono font-medium tracking-wider text-[#8CFF8C]">
          <span>+</span>
          <span className="uppercase text-[11px]">VERIFICATION</span>
        </div>

        <h3 className="text-2xl sm:text-3xl font-sans font-extrabold text-[#F4F5F4] tracking-tight">
          {isPassed ? "Fix Verified" : "Validating Fix..."}
        </h3>
        <p className="text-xs text-[#A5AAA6] font-sans">
          Running security scans and tests to verify the remediation.
        </p>
      </div>

      {/* Main Grid: Checklist (Left 7 cols) + Segmented Progress Ring (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Checklist */}
        <div className="lg:col-span-7 space-y-3 font-mono text-xs">
          {checks.map((check) => {
            const isComplete = check.status === "complete";
            const isActive = check.status === "active";

            return (
              <div
                key={check.id}
                className={clsx(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all",
                  isComplete
                    ? "bg-[#151716] border-[#292D2A] text-[#F4F5F4]"
                    : isActive
                    ? "bg-[#16351F]/40 border-[#8CFF8C]/40 text-[#8CFF8C]"
                    : "bg-[#101211] border-[#292D2A]/50 text-[#666C68]"
                )}
              >
                <div
                  className={clsx(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                    isComplete
                      ? "bg-[#8CFF8C] text-[#080909]"
                      : isActive
                      ? "text-[#8CFF8C]"
                      : "border border-[#292D2A] text-transparent"
                  )}
                >
                  {isComplete ? (
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#8CFF8C]" />
                  ) : null}
                </div>

                <span
                  className={clsx(
                    "font-sans font-medium text-xs",
                    isComplete ? "text-[#F4F5F4]" : isActive ? "text-[#8CFF8C]" : "text-[#666C68]"
                  )}
                >
                  {check.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right: Large Segmented Radial Progress Ring */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center relative py-4">
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* Ambient green ring glow */}
            <div className="absolute inset-0 rounded-full bg-[#8CFF8C]/[0.08] blur-xl pointer-events-none" />

            {/* Segmented radial ticks */}
            <svg viewBox="0 0 200 200" className="w-full h-full rotate-[-90deg]">
              {Array.from({ length: totalSegments }).map((_, i) => {
                const angle = (i / totalSegments) * 2 * Math.PI;
                const rInner = 74;
                const rOuter = 88;
                const x1 = 100 + rInner * Math.cos(angle);
                const y1 = 100 + rInner * Math.sin(angle);
                const x2 = 100 + rOuter * Math.cos(angle);
                const y2 = 100 + rOuter * Math.sin(angle);
                const isLit = i < activeSegments;

                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isLit ? "#8CFF8C" : "#1A1D1B"}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    className="transition-all duration-300"
                  />
                );
              })}
            </svg>

            {/* Center Percentage & Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl sm:text-4xl font-mono font-bold text-[#F4F5F4] tracking-tight">
                {percentNumber}%
              </span>
              <span className="text-xs font-mono text-[#8CFF8C] tracking-wide pt-0.5">
                {isPassed ? "VERIFIED ✓" : "Verifying..."}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
