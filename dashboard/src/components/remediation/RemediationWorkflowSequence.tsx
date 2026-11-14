import React from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  GitBranch,
  GitPullRequest,
  Check,
  X,
  Loader2,
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
  prUrl,
  failureReason,
  className,
}) => {
  // Determine progression steps
  // Step 1: Verification -> ✓ Secure
  // Step 2: Preparing Branch -> ✓ Commit Created
  // Step 3: Creating Pull Request -> ✓ PR #42 Created (or Failed / Skipped)

  const step1Done = isVerified;
  const step2Done = isVerified && !isFailed;
  const step3Done = isPrOpened || isPrSkipped || isPrFailed;

  return (
    <div className={clsx("p-5 rounded-2xl glass-panel-elevated border border-white/[0.08] space-y-4", className)}>
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div className="space-y-0.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold">
            Autonomous Deployment Sequence
          </span>
          <h4 className="text-sm font-sans font-bold text-white tracking-tight">
            Remediation Pipeline Lifecycle
          </h4>
        </div>
        <div className="text-[11px] font-mono text-sage-400">
          {isPrOpened ? (
            <span className="text-emerald-400 font-semibold">● Sequence Complete</span>
          ) : isPrFailed ? (
            <span className="text-rose-400 font-semibold">● Step 3 Failed</span>
          ) : isPrSkipped ? (
            <span className="text-accent-teal font-semibold">● Local Sequence Complete</span>
          ) : isVerified ? (
            <span className="text-accent-violet font-semibold animate-pulse">● Deploying Fix...</span>
          ) : (
            <span className="text-amber-400 font-semibold">● Verification in progress</span>
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
          {/* Vertical line connecting to Step 2 */}
          <div className="absolute left-[13px] top-[26px] bottom-[-16px] w-[2px] bg-white/[0.08]" />

          <div
            className={clsx(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border z-10 transition-colors",
              step1Done
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : isFailed
                ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                : "bg-amber-500/15 border-amber-500/40 text-amber-400"
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

          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sage-200">Verification</span>
              {step1Done ? (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[11px]"
                >
                  ✓ Secure
                </motion.span>
              ) : isFailed ? (
                <span className="text-rose-400 font-bold text-[11px]">✗ Failed</span>
              ) : (
                <span className="text-amber-400 text-[11px]">Executing...</span>
              )}
            </div>
            <p className="text-[11px] text-sage-400 font-sans">
              Dual check: Static AST scan produced 0 issues & regression tests completed.
            </p>
          </div>
        </motion.div>

        {/* Step 2: Preparing Branch & Commit */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          className="flex items-start gap-3 relative pt-2"
        >
          {/* Vertical line connecting to Step 3 */}
          <div className="absolute left-[13px] top-[34px] bottom-[-16px] w-[2px] bg-white/[0.08]" />

          <div
            className={clsx(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border z-10 transition-colors",
              step2Done
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                : "bg-sage-900 border-white/[0.1] text-sage-500"
            )}
          >
            {step2Done ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : (
              <GitBranch className="w-4 h-4" />
            )}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className={clsx("font-semibold", step2Done ? "text-sage-200" : "text-sage-400")}>
                Preparing Branch
              </span>
              {step2Done ? (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[11px]"
                >
                  ✓ Commit Created
                </motion.span>
              ) : (
                <span className="text-sage-500 text-[11px]">Pending verification</span>
              )}
            </div>
            <p className="text-[11px] text-sage-400 font-sans truncate">
              Branch: <span className="text-accent-orange font-mono">{branchName}</span>
            </p>
          </div>
        </motion.div>

        {/* Step 3: Creating Pull Request */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          className="flex items-start gap-3 pt-2"
        >
          <div
            className={clsx(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border z-10 transition-colors",
              isPrOpened
                ? "bg-accent-violet/20 border-accent-violet/40 text-accent-violet"
                : isPrSkipped
                ? "bg-accent-teal/15 border-accent-teal/40 text-accent-teal"
                : isPrFailed
                ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                : step2Done
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                : "bg-sage-900 border-white/[0.1] text-sage-500"
            )}
          >
            {isPrOpened ? (
              <GitPullRequest className="w-4 h-4 stroke-[2.5]" />
            ) : isPrSkipped ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : isPrFailed ? (
              <X className="w-4 h-4 stroke-[2.5]" />
            ) : step2Done ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitPullRequest className="w-4 h-4" />
            )}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span
                className={clsx(
                  "font-semibold",
                  step3Done ? "text-sage-200" : "text-sage-400"
                )}
              >
                Creating Pull Request
              </span>
              {isPrOpened ? (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="inline-flex items-center gap-1 text-accent-violet font-bold text-[11px]"
                >
                  ✓ PR {prNumber ? `#${prNumber}` : ""} Created
                </motion.span>
              ) : isPrSkipped ? (
                <span className="text-accent-teal font-bold text-[11px]">
                  ✓ Verified Locally
                </span>
              ) : isPrFailed ? (
                <span className="text-rose-400 font-bold text-[11px]">
                  ✗ Creation Failed
                </span>
              ) : step2Done ? (
                <span className="text-amber-400 text-[11px] animate-pulse">
                  Opening PR...
                </span>
              ) : (
                <span className="text-sage-500 text-[11px]">Waiting</span>
              )}
            </div>
            <p className="text-[11px] text-sage-400 font-sans">
              {isPrOpened ? (
                <span>
                  PR deployed with CWE classification and diff.{" "}
                  {prUrl && (
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-violet underline hover:text-accent-violet/80"
                    >
                      View on GitHub →
                    </a>
                  )}
                </span>
              ) : isPrSkipped ? (
                "Local repository execution — PR creation bypassed."
              ) : isPrFailed ? (
                <span className="text-rose-300">
                  {failureReason ? `Error: ${failureReason.slice(0, 100)}...` : "Remote GitHub API error occurred during branch or PR creation."}
                </span>
              ) : (
                "Synchronizing branch references to origin repository."
              )}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
