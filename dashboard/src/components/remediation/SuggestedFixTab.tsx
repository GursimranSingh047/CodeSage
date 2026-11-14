import React from "react";
import { motion } from "framer-motion";
import {
  Wrench,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SideBySideDiff } from "@/components/remediation/SideBySideDiff";
import { Finding, Patch, VerificationResult } from "@/types";
import { clsx } from "clsx";

export type FixStatus =
  | "Analyzing"
  | "Generating Fix"
  | "Fix Ready"
  | "Applying Fix"
  | "Verification Pending"
  | "Verified"
  | "Failed";

interface SuggestedFixTabProps {
  finding: Finding;
  patch?: Patch | null;
  verification?: VerificationResult | null;
  isScanning?: boolean;
  onReviewDecision?: (decision: "approved" | "rejected", notes?: string) => Promise<void>;
  className?: string;
}

export function computeFixStatus(
  finding: Finding,
  patch?: Patch | null,
  verification?: VerificationResult | null,
  isScanning: boolean = false
): FixStatus {
  if (isScanning && !patch) return "Generating Fix";
  if (isScanning && patch && !verification) return "Verification Pending";

  if (verification?.passed || finding.status === "verified_pr_opened" || finding.status === "verified_pr_skipped") {
    return "Verified";
  }
  if (finding.status === "verification_failed" || finding.status === "patch_generation_failed" || (verification && !verification.passed)) {
    return "Failed";
  }
  if (finding.status === "needs_human_review") {
    return "Fix Ready";
  }
  if (patch) {
    return "Fix Ready";
  }
  return "Analyzing";
}

export const SuggestedFixTab: React.FC<SuggestedFixTabProps> = ({
  finding,
  patch,
  verification,
  isScanning = false,
  onReviewDecision,
  className,
}) => {
  const status = computeFixStatus(finding, patch, verification, isScanning);

  const getStatusBadge = (st: FixStatus) => {
    switch (st) {
      case "Verified":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Verified Fix
          </span>
        );
      case "Fix Ready":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-accent-teal/15 text-teal-300 border border-accent-teal/30">
            <Zap className="w-3.5 h-3.5 text-accent-teal" />
            Fix Ready
          </span>
        );
      case "Generating Fix":
      case "Applying Fix":
      case "Verification Pending":
      case "Analyzing":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-accent-orange/15 text-orange-400 border border-accent-orange/30">
            <Loader2 className="w-3.5 h-3.5 text-accent-orange animate-spin" />
            {st}
          </span>
        );
      case "Failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            Remediation Failed
          </span>
        );
    }
  };

  return (
    <div className={clsx("space-y-6", className)}>
      {/* 1. Header Bar: Status Indicator + Attempt Number */}
      <div className="p-4 sm:p-5 rounded-2xl glass-panel-elevated border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-teal/10 border border-accent-teal/30 flex items-center justify-center text-accent-teal shrink-0">
            <Wrench className="w-5 h-5" />
          </div>

          <div className="space-y-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold">
              Remediation Synthesis
            </div>
            <h3 className="text-sm sm:text-base font-sans font-bold text-white tracking-tight">
              Deterministic Verified Code Replacement
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {patch && (
            <Badge variant="default" size="sm">
              Attempt #{patch.attempt_number || 1}
            </Badge>
          )}

          {getStatusBadge(status)}
        </div>
      </div>

      {/* 2. Side-by-Side Code Comparison Diff */}
      {patch ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-mono uppercase tracking-wider text-sage-400 font-semibold flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-accent-orange" />
              <span>Side-by-Side Code Comparison</span>
            </h4>
            <span className="text-[11px] font-mono text-sage-500">
              Target: Line {finding.line_number}
            </span>
          </div>

          <SideBySideDiff
            originalCode={patch.original_code}
            patchedCode={patch.patched_code}
            startLine={Math.max(1, finding.line_number - 2)}
            filePath={finding.file_path}
          />
        </motion.div>
      ) : (
        <div className="p-12 text-center rounded-2xl glass-panel border border-white/[0.06] space-y-3">
          <Loader2 className="w-8 h-8 text-accent-orange animate-spin mx-auto" />
          <h4 className="text-sm font-sans font-semibold text-white">
            Patch Generation in Progress
          </h4>
          <p className="text-xs text-sage-400 font-sans max-w-sm mx-auto leading-relaxed">
            The AI remediation node is evaluating AST context and generating a minimal code diff to eliminate {finding.cwe_id || "the detected vulnerability"}.
          </p>
        </div>
      )}

      {/* 3. Patch Explanation & Engineering Rationale */}
      {patch?.explanation && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="space-y-2"
        >
          <h4 className="text-xs font-mono uppercase tracking-wider text-sage-400 font-semibold">
            Remediation Rationale
          </h4>
          <div className="p-4 rounded-xl glass-panel border border-white/[0.06] text-xs font-sans text-sage-200 leading-relaxed space-y-2">
            <p>{patch.explanation}</p>
            <div className="pt-2 border-t border-white/[0.04] text-[11px] font-mono text-sage-400 flex items-center justify-between">
              <span>Minimal replacement scope</span>
              <span className="text-emerald-400">Zero unnecessary refactoring</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* 4. Human Review Action Bar (If escalated by backend) */}
      {finding.status === "needs_human_review" && onReviewDecision && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="space-y-0.5 text-center sm:text-left">
            <div className="text-xs font-sans font-semibold text-amber-200">
              Escalated to Human Security Review
            </div>
            <div className="text-[11px] font-mono text-amber-400/80">
              Review the suggested fix before automated pull request deployment.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="xs"
              onClick={() => onReviewDecision("rejected")}
            >
              Reject Fix
            </Button>
            <Button
              variant="primary"
              size="xs"
              onClick={() => onReviewDecision("approved")}
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            >
              Approve Fix
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
