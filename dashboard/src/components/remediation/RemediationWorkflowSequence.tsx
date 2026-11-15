import React from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  GitBranch,
  GitPullRequest,
  Check,
  X,
} from "lucide-react";
import { clsx } from "clsx";

interface RemediationWorkflowSequenceProps {
  isVerified: boolean;
  isFailed?: boolean;
  isPrOpened: boolean;
  isPrSkipped: boolean;
  isPrFailed: boolean;
  branchName?: string;
  prNumber?: number | string | null;
  prUrl?: string;
  failureReason?: string;
  className?: string;
}

export const RemediationWorkflowSequence: React.FC<RemediationWorkflowSequenceProps> = ({
  isVerified,
  isFailed,
  isPrOpened,
  isPrSkipped,
  isPrFailed,
  branchName = "codesage/fix-patch",
  prNumber,
  failureReason,
  className,
}) => {
  const step1Done = isVerified;
  const step2Done = isVerified && !isFailed;

  return (
    <div className={clsx("p-5 rounded-2xl surface-card border border-[#292D2A] space-y-4", className)}>
      <div className="flex items-center justify-between pb-3 border-b border-[#292D2A]">
        <div className="space-y-0.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#666C68] font-bold">
            Autonomous Deployment Sequence
          </span>
          <h4 className="text-sm font-sans font-bold text-[#F4F5F4] tracking-tight">
            Remediation Pipeline Lifecycle
          </h4>
        </div>
        <div className="text-[11px] font-mono">
          {isPrOpened ? (
            <span className="text-[#8CFF8C] font-semibold">● Sequence Complete</span>
          ) : isPrFailed ? (
            <span className="text-[#FF5555] font-semibold">● Step 3 Failed</span>
          ) : isPrSkipped ? (
            <span className="text-[#F4F5F4] font-semibold">● Local Sequence Complete</span>
          ) : isVerified ? (
            <span className="text-[#8CFF8C] font-semibold animate-pulse">● Deploying Fix...</span>
          ) : (
            <span className="text-[#8CFF8C] font-semibold">● Verification in progress</span>
          )}
        </div>
      </div>

      {/* Stepper Pipeline */}
      <div className="space-y-3 font-mono text-xs">
        {/* Step 1: Verification */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-start gap-3 relative"
        >
          <div className="absolute left-[13px] top-[26px] bottom-[-16px] w-[2px] bg-[#292D2A]" />

          <div
            className={clsx(
              "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border z-10 transition-colors shadow-sm",
              step1Done
                ? "bg-[#16351F] border-[#8CFF8C]/40 text-[#8CFF8C]"
                : isFailed
                ? "bg-[#FF5555]/10 border-[#FF5555]/30 text-[#FF5555]"
                : "bg-[#151716] border-[#292D2A] text-[#8CFF8C]"
            )}
          >
            {step1Done ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : isFailed ? (
              <X className="w-4 h-4 stroke-[2.5]" />
            ) : (
              <ShieldCheck className="w-4 h-4 animate-pulse" />
            )}
          </div>

          <div className="flex-1 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F4F5F4]">Verification</span>
              {step1Done ? (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center gap-1 text-[#8CFF8C] font-bold text-[11px]"
                >
                  ✓ Secure
                </motion.span>
              ) : isFailed ? (
                <span className="text-[#FF5555] font-bold text-[11px]">✗ Failed</span>
              ) : (
                <span className="text-[#8CFF8C] text-[11px]">Executing...</span>
              )}
            </div>
            <p className="text-[11px] text-[#A5AAA6] font-sans">
              Dual check: Static AST scan produced 0 issues & regression tests completed.
            </p>
          </div>
        </motion.div>

        {/* Step 2: Preparing Branch & Commit */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex items-start gap-3 relative"
        >
          <div className="absolute left-[13px] top-[26px] bottom-[-16px] w-[2px] bg-[#292D2A]" />

          <div
            className={clsx(
              "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border z-10 transition-colors shadow-sm",
              step2Done
                ? "bg-[#16351F] border-[#8CFF8C]/40 text-[#8CFF8C]"
                : isFailed
                ? "bg-[#FF5555]/10 border-[#FF5555]/30 text-[#FF5555]"
                : "bg-[#101211] border-[#292D2A] text-[#666C68]"
            )}
          >
            {step2Done ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : isFailed ? (
              <X className="w-4 h-4 stroke-[2.5]" />
            ) : (
              <GitBranch className="w-4 h-4" />
            )}
          </div>

          <div className="flex-1 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F4F5F4]">Preparing Branch</span>
              {step2Done ? (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center gap-1 text-[#8CFF8C] font-bold text-[11px]"
                >
                  ✓ Commit Created
                </motion.span>
              ) : (
                <span className="text-[#666C68] text-[11px]">Pending</span>
              )}
            </div>
            <p className="text-[11px] text-[#A5AAA6] font-sans">
              Target branch: <code className="text-[#8CFF8C] font-mono">{branchName}</code>
            </p>
          </div>
        </motion.div>

        {/* Step 3: Pull Request */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex items-start gap-3 relative"
        >
          <div
            className={clsx(
              "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border z-10 transition-colors shadow-sm",
              isPrOpened
                ? "bg-[#16351F] border-[#8CFF8C]/40 text-[#8CFF8C]"
                : isPrSkipped
                ? "bg-[#151716] border-[#292D2A] text-[#F4F5F4]"
                : isPrFailed
                ? "bg-[#FF5555]/10 border-[#FF5555]/30 text-[#FF5555]"
                : "bg-[#101211] border-[#292D2A] text-[#666C68]"
            )}
          >
            {isPrOpened ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : isPrSkipped ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : isPrFailed ? (
              <X className="w-4 h-4 stroke-[2.5]" />
            ) : (
              <GitPullRequest className="w-4 h-4" />
            )}
          </div>

          <div className="flex-1 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F4F5F4]">Creating Pull Request</span>
              {isPrOpened ? (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center gap-1 text-[#8CFF8C] font-bold text-[11px]"
                >
                  ✓ PR {prNumber ? `#${prNumber}` : ""} Created
                </motion.span>
              ) : isPrSkipped ? (
                <span className="text-[#8CFF8C] font-bold text-[11px]">✓ Skipped (Local)</span>
              ) : isPrFailed ? (
                <span className="text-[#FF5555] font-bold text-[11px]">✗ PR Failed</span>
              ) : (
                <span className="text-[#666C68] text-[11px]">Pending</span>
              )}
            </div>
            <p className="text-[11px] text-[#A5AAA6] font-sans">
              {isPrFailed && failureReason ? (
                <span className="text-[#FF5555] font-mono">{failureReason}</span>
              ) : (
                "Verified patch dispatched to GitHub upstream."
              )}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
