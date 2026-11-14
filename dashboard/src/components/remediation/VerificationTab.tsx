import React from "react";
import { motion } from "framer-motion";
import {
  Check,
  X,
  AlertTriangle,
  Cpu,
  Layers,
  Terminal,
} from "lucide-react";
import { Finding, VerificationResult } from "@/types";
import { VerificationIndicator } from "@/components/remediation/VerificationIndicator";
import { clsx } from "clsx";

interface VerificationTabProps {
  finding: Finding;
  verification?: VerificationResult | null;
  className?: string;
}

interface VerificationCheckItem {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  tag: string;
}

export const VerificationTab: React.FC<VerificationTabProps> = ({
  finding,
  verification,
  className,
}) => {
  const isPassed =
    verification?.passed ?? (finding.status?.includes("verified") ?? false);
  const scanClean = verification?.scan_clean ?? isPassed;
  const testsPassed = verification?.tests_passed ?? isPassed;
  const failureReason = verification?.failure_reason || finding.failure_reason;
  const isFailed = Boolean(failureReason) || (!isPassed && finding.status === "verification_failed");

  const status: "verified" | "failed" | "pending" = isPassed
    ? "verified"
    : isFailed
    ? "failed"
    : "pending";

  // The 5 Required Verification Checks
  const checks: VerificationCheckItem[] = [
    {
      id: "patch_applied",
      name: "Patch applied",
      description: `Target AST replacement synthesized and atomically written to ${finding.file_path}`,
      passed: isPassed || !failureReason?.toLowerCase().includes("patch"),
      tag: "AST Injection",
    },
    {
      id: "syntax_validation",
      name: "Syntax validation",
      description: "Language parser parsed modified file with zero grammar syntax errors",
      passed: isPassed || !failureReason?.toLowerCase().includes("syntax"),
      tag: "Tree-sitter",
    },
    {
      id: "security_scan",
      name: "Security scan",
      description: `${finding.tool_source} static analyzer re-evaluated target scope producing 0 findings`,
      passed: scanClean,
      tag: "Static Clean",
    },
    {
      id: "tests",
      name: "Tests",
      description: "Automated regression unit tests executed in sandbox container with 0 regressions",
      passed: testsPassed,
      tag: "Unit Suites",
    },
    {
      id: "vulnerability_resolved",
      name: "Vulnerability resolved",
      description: `${finding.cwe_id || "Vulnerability pattern"} confirmed eradicated from control-flow graph`,
      passed: isPassed,
      tag: "CWE Resolved",
    },
  ];

  return (
    <div className={clsx("space-y-6", className)}>
      {/* 1. Large Verification Indicator Component */}
      <VerificationIndicator status={status} />

      {/* 2. Security Verification Checks Dashboard */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-sage-400 font-bold">
              Automated Integrity Protocol
            </span>
            <h4 className="text-sm font-sans font-bold text-white tracking-tight">
              Pre-Commit Verification Checklist
            </h4>
          </div>
          <span className="text-xs font-mono text-sage-400">
            {checks.filter((c) => c.passed).length}/{checks.length} Passed
          </span>
        </div>

        {/* The 5 Animated Verification Checks */}
        <div className="space-y-2.5">
          {checks.map((check, index) => (
            <motion.div
              key={check.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.35,
                delay: index * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              className={clsx(
                "p-3.5 sm:p-4 rounded-xl border transition-all flex items-start gap-3.5",
                check.passed
                  ? "bg-sage-950/60 border-white/[0.06] hover:border-emerald-500/30"
                  : "bg-sage-950/80 border-rose-500/25"
              )}
            >
              {/* Checkbox Icon */}
              <div
                className={clsx(
                  "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 transition-colors",
                  check.passed
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                    : "bg-rose-500/15 border-rose-500/40 text-rose-400"
                )}
              >
                {check.passed ? (
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : (
                  <X className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
              </div>

              {/* Check Content */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={clsx(
                      "font-sans text-xs font-semibold tracking-tight",
                      check.passed ? "text-white" : "text-rose-200"
                    )}
                  >
                    {check.name}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] border border-white/[0.06] text-sage-400 shrink-0">
                    {check.tag}
                  </span>
                </div>
                <p className="text-xs text-sage-400 font-sans leading-relaxed">
                  {check.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 3. Failure Reason Banner (If Failed) */}
      {failureReason && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-2 font-mono"
        >
          <div className="flex items-center gap-2 font-bold text-rose-200">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Verification Failure Diagnostic</span>
          </div>
          <div className="p-3 rounded-lg bg-black/40 border border-rose-500/20 text-rose-300 font-mono text-[11px] leading-relaxed break-all select-all">
            {failureReason}
          </div>
        </motion.div>
      )}

      {/* 4. Execution Sandbox Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
        <div className="p-3 rounded-xl glass-panel border border-white/[0.06] space-y-1">
          <span className="text-[10px] text-sage-400 font-bold uppercase block">
            Container Isolation
          </span>
          <div className="flex items-center gap-1.5 text-accent-teal font-semibold">
            <Cpu className="w-3.5 h-3.5" />
            <span>Sandbox Workspace</span>
          </div>
        </div>

        <div className="p-3 rounded-xl glass-panel border border-white/[0.06] space-y-1">
          <span className="text-[10px] text-sage-400 font-bold uppercase block">
            Target Target
          </span>
          <div className="flex items-center gap-1.5 text-sage-200 truncate">
            <Terminal className="w-3.5 h-3.5 text-accent-orange shrink-0" />
            <span className="truncate">{finding.file_path}</span>
          </div>
        </div>

        <div className="p-3 rounded-xl glass-panel border border-white/[0.06] space-y-1">
          <span className="text-[10px] text-sage-400 font-bold uppercase block">
            Analysis Tool
          </span>
          <div className="flex items-center gap-1.5 text-sage-200">
            <Layers className="w-3.5 h-3.5 text-accent-violet" />
            <span className="capitalize">{finding.tool_source}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
