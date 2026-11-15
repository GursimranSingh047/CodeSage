import React from "react";
import { Check } from "lucide-react";
import { clsx } from "clsx";

interface FindingLifecycleStepperProps {
  status?: string;
  hasPr?: boolean;
  className?: string;
}

export const FindingLifecycleStepper: React.FC<FindingLifecycleStepperProps> = ({
  status = "discovered",
  hasPr = false,
  className,
}) => {
  const isPrOpened = Boolean(hasPr || status === "verified_pr_opened");
  const isMerged = Boolean(status === "merged" || status === "resolved");
  const isVerified = Boolean(
    isPrOpened ||
    status === "verified_pr_skipped" ||
    isMerged
  );
  const isFixGenerated = Boolean(
    isVerified ||
    status === "patch_generated" ||
    status === "triaged_real"
  );

  // 5 Stages matching Reference Design:
  // 1. Detected -> 2. Fix Generated -> 3. Verified -> 4. Create PR / PR Created -> 5. Merged
  const stages = [
    { id: "detected", label: "Detected" },
    { id: "fix_generated", label: "Fix Generated" },
    { id: "verified", label: "Verified" },
    { id: "create_pr", label: isPrOpened ? "PR Created" : "Create PR" },
    { id: "merged", label: "Merged" },
  ];

  const isStageCompleted = (idx: number): boolean => {
    if (isMerged) return true;
    switch (idx) {
      case 0: // Detected
        return true;
      case 1: // Fix Generated
        return isFixGenerated;
      case 2: // Verified
        return isVerified;
      case 3: // PR Created
        return isPrOpened;
      case 4: // Merged
        return isMerged;
      default:
        return false;
    }
  };

  const isStageActive = (idx: number): boolean => {
    if (isMerged) return idx === 4;
    if (isPrOpened) return idx === 4; // PR created, awaiting user merge on GitHub
    if (isVerified) return idx === 3; // Verified, awaiting user clicking Create PR
    if (isFixGenerated) return idx === 2; // Fix generated, verifying
    return idx === 1; // Detected, generating fix
  };

  return (
    <div
      className={clsx(
        "p-4 sm:p-5 rounded-2xl bg-[#101211] border border-[#292D2A] select-none",
        className
      )}
    >
      <div className="flex items-center justify-between relative max-w-4xl mx-auto">
        {stages.map((stage, idx) => {
          const completed = isStageCompleted(idx);
          const active = isStageActive(idx);
          const isLast = idx === stages.length - 1;

          return (
            <React.Fragment key={stage.id}>
              {/* Stage Node */}
              <div className="flex flex-col items-center relative z-10">
                <div
                  className={clsx(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300",
                    completed
                      ? "bg-[#8CFF8C] text-[#080909] shadow-[0_0_12px_rgba(140,255,140,0.3)]"
                      : active
                      ? "border-2 border-[#8CFF8C] bg-[#16351F] text-[#8CFF8C] shadow-[0_0_14px_rgba(140,255,140,0.35)]"
                      : "border border-[#292D2A] bg-[#151716] text-[#666C68]"
                  )}
                >
                  {completed ? (
                    <Check className="w-4 h-4 stroke-[3]" />
                  ) : active ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-[#8CFF8C] animate-pulse" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-[#292D2A]" />
                  )}
                </div>

                {/* Stage Label */}
                <span
                  className={clsx(
                    "mt-2 text-xs font-sans tracking-tight whitespace-nowrap transition-colors",
                    completed
                      ? "text-[#F4F5F4] font-medium"
                      : active
                      ? "text-[#8CFF8C] font-bold"
                      : "text-[#666C68]"
                  )}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connecting Line between stages */}
              {!isLast && (
                <div className="flex-1 h-[2px] mx-2 -mt-5 relative">
                  <div className="absolute inset-0 bg-[#292D2A]" />
                  <div
                    className="absolute inset-0 bg-[#8CFF8C] transition-all duration-500"
                    style={{
                      width: completed ? "100%" : "0%",
                    }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
