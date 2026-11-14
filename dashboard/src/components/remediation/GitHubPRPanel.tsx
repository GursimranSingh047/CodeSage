import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Github,
  ExternalLink,
  Copy,
  Check,
  GitBranch,
  FileCode2,
  GitPullRequest,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Finding } from "@/types";
import { clsx } from "clsx";

interface GitHubPRPanelProps {
  finding: Finding;
  className?: string;
}

export const GitHubPRPanel: React.FC<GitHubPRPanelProps> = ({
  finding,
  className,
}) => {
  const [copiedBranch, setCopiedBranch] = useState(false);

  const prUrl = finding.pr_url;
  const isPrOpened = Boolean(prUrl) || finding.status === "verified_pr_opened";
  const isPrFailed = finding.status === "pr_failed";
  const isPrSkipped = finding.status === "verified_pr_skipped";

  // Derive PR fields strictly from actual finding data
  const prNumberMatch = prUrl?.match(/pull\/(\d+)/);
  const prNumber = finding.pr_number || (prNumberMatch ? prNumberMatch[1] : null);

  const prTitle =
    finding.title ||
    (finding.cwe_id
      ? `Fix ${finding.cwe_id} in ${finding.file_path} (CodeSage)`
      : `Fix vulnerability in ${finding.file_path} (CodeSage)`);

  const branchName =
    finding.branch ||
    `codesage/fix-${finding.file_path.split("/").pop()?.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() || "patch"}`;

  const baseBranch = finding.base_branch || "main";
  const filesChanged = `1 file (${finding.file_path})`;
  const failureReason = finding.failure_reason;

  const handleCopyBranch = () => {
    navigator.clipboard.writeText(branchName);
    setCopiedBranch(true);
    setTimeout(() => setCopiedBranch(false), 2000);
  };

  return (
    <div className={clsx("space-y-5", className)}>
      {/* =========================================================================
          STATE 1: SUCCESSFUL PR CREATION
      ========================================================================= */}
      {isPrOpened && prUrl ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="p-6 rounded-2xl glass-panel-elevated border border-white/[0.08] relative overflow-hidden space-y-6"
        >
          {/* Ambient subtle violet/teal corner aura */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-violet/5 rounded-full blur-3xl pointer-events-none" />

          {/* Top PR Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06] relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-white/[0.05] border border-white/[0.12] flex items-center justify-center text-white shadow-inner shrink-0">
                <Github className="w-6 h-6" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-accent-violet font-bold">
                    Autonomous GitHub PR
                  </span>
                  {prNumber && (
                    <span className="px-1.5 py-0.2 rounded bg-accent-violet/20 text-accent-violet text-[10px] font-mono font-bold">
                      #{prNumber}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-sans font-bold text-white tracking-tight">
                  Pull Request Created
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="success" size="md" dot>
                Open
              </Badge>
            </div>
          </div>

          {/* PR Details Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10 font-mono text-xs">
            {/* PR Title */}
            <div className="p-3.5 rounded-xl bg-sage-950/70 border border-white/[0.06] space-y-1 col-span-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-sage-400 font-bold block">
                PR Title
              </span>
              <p className="text-sm font-sans font-semibold text-white truncate">
                {prTitle}
              </p>
            </div>

            {/* PR Number */}
            <div className="p-3.5 rounded-xl bg-sage-950/70 border border-white/[0.06] space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-sage-400 font-bold block">
                PR Number
              </span>
              <div className="flex items-center gap-2">
                <GitPullRequest className="w-3.5 h-3.5 text-accent-violet" />
                <span className="text-white font-bold">
                  {prNumber ? `#${prNumber}` : "Pending indexing"}
                </span>
              </div>
            </div>

            {/* Status */}
            <div className="p-3.5 rounded-xl bg-sage-950/70 border border-white/[0.06] space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-sage-400 font-bold block">
                Status
              </span>
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Open for Review</span>
              </div>
            </div>

            {/* Head Branch */}
            <div className="p-3.5 rounded-xl bg-sage-950/70 border border-white/[0.06] space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-sage-400 font-bold block">
                Branch
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-accent-orange font-semibold truncate">
                  {branchName}
                </span>
                <button
                  type="button"
                  onClick={handleCopyBranch}
                  className="p-1 rounded hover:bg-white/[0.08] text-sage-400 hover:text-white transition-colors"
                  title="Copy branch"
                >
                  {copiedBranch ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Base Branch */}
            <div className="p-3.5 rounded-xl bg-sage-950/70 border border-white/[0.06] space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-sage-400 font-bold block">
                Base Branch
              </span>
              <div className="flex items-center gap-1.5 text-sage-300">
                <GitBranch className="w-3.5 h-3.5 text-sage-400" />
                <span>{baseBranch}</span>
              </div>
            </div>

            {/* Files Changed */}
            <div className="p-3.5 rounded-xl bg-sage-950/70 border border-white/[0.06] space-y-1 col-span-1 md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-sage-400 font-bold block">
                Files Changed
              </span>
              <div className="flex items-center gap-2 text-sage-200">
                <FileCode2 className="w-3.5 h-3.5 text-accent-teal" />
                <span>{filesChanged}</span>
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
            <p className="text-xs text-sage-400 font-sans">
              Diff, CWE classification, and sandbox verification logs are embedded in the PR description.
            </p>

            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto"
            >
              <Button
                variant="primary"
                size="md"
                className="w-full sm:w-auto font-sans font-semibold"
                icon={<ExternalLink className="w-4 h-4" />}
              >
                Open Pull Request →
              </Button>
            </a>
          </div>
        </motion.div>
      ) : isPrFailed ? (
        /* =========================================================================
           STATE 2: PR CREATION FAILED (VERIFICATION SUCCEEDED, PR FAILED)
        ========================================================================= */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="p-6 rounded-2xl bg-sage-950/90 border border-rose-500/30 relative overflow-hidden space-y-5"
        >
          {/* Header */}
          <div className="flex items-start gap-4 pb-4 border-b border-rose-500/20">
            <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <XCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-emerald-400 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Verification succeeded
                </span>
              </div>
              <h3 className="text-lg font-sans font-bold text-rose-300 tracking-tight">
                Pull request creation failed
              </h3>
              <p className="text-xs font-sans text-rose-200/80">
                The patch was verified with zero regressions in the sandbox, but the remote GitHub API rejected PR creation. No PR exists on GitHub.
              </p>
            </div>
          </div>

          {/* Actual Backend Error Display */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold block">
              Backend Diagnostic Error
            </span>
            <div className="p-4 rounded-xl bg-black/60 border border-rose-500/25 font-mono text-xs text-rose-300 leading-relaxed overflow-x-auto select-all">
              {failureReason ||
                "PRError: GitHub API returned an error during branch or pull request opening. Check GITHUB_TOKEN permissions or repository access."}
            </div>
          </div>

          {/* Branch & Commit Details for Manual Recovery */}
          <div className="p-4 rounded-xl bg-sage-900/60 border border-white/[0.06] text-xs font-mono space-y-2">
            <div className="flex items-center justify-between text-sage-300">
              <span className="text-sage-400">Target File:</span>
              <span className="text-white font-semibold">{finding.file_path}</span>
            </div>
            <div className="flex items-center justify-between text-sage-300">
              <span className="text-sage-400">Proposed Branch:</span>
              <span className="text-accent-orange font-semibold">{branchName}</span>
            </div>
            <p className="text-[11px] font-sans text-sage-400 pt-1 border-t border-white/[0.06]">
              You can manually apply the verified patch from the &quot;Suggested Fix&quot; tab or verify GITHUB_TOKEN permissions before retrying.
            </p>
          </div>
        </motion.div>
      ) : isPrSkipped ? (
        /* =========================================================================
           STATE 3: PR SKIPPED (LOCAL REPOSITORY / DEMO MODE)
        ========================================================================= */
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="p-6 rounded-2xl glass-panel-elevated border border-white/[0.08] space-y-5"
        >
          <div className="flex items-start gap-4 pb-4 border-b border-white/[0.06]">
            <div className="w-11 h-11 rounded-xl bg-accent-teal/10 border border-accent-teal/30 flex items-center justify-center text-accent-teal shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-emerald-400 inline-flex items-center gap-1">
                  ✓ Verification succeeded
                </span>
              </div>
              <h3 className="text-lg font-sans font-bold text-white tracking-tight">
                Patch Verified (PR Skipped)
              </h3>
              <p className="text-xs font-sans text-sage-300 leading-relaxed">
                The patch was verified clean in the container. Pull request creation was bypassed because this scan targeted a local workspace or was run without a GitHub remote repository.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-sage-950/70 border border-white/[0.06] text-xs font-mono space-y-2">
            <div className="flex items-center justify-between text-sage-300">
              <span className="text-sage-400">Target File:</span>
              <span className="text-white font-semibold">{finding.file_path}</span>
            </div>
            <div className="flex items-center justify-between text-sage-300">
              <span className="text-sage-400">Local Validation:</span>
              <span className="text-emerald-400 font-semibold">100% Clean (0 Violations)</span>
            </div>
            <p className="text-[11px] font-sans text-sage-400 pt-1 border-t border-white/[0.06]">
              To automatically dispatch PRs, initiate a scan targeting a GitHub URL (e.g. `https://github.com/owner/repo`) with a configured `GITHUB_TOKEN`.
            </p>
          </div>
        </motion.div>
      ) : (
        /* =========================================================================
           STATE 4: PENDING PR DISPATCH
        ========================================================================= */
        <div className="p-8 rounded-2xl glass-panel border border-white/[0.06] text-center space-y-3 font-mono">
          <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] mx-auto flex items-center justify-center text-sage-400">
            <GitPullRequest className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-sans font-semibold text-white">
            Pull Request Pipeline Inactive
          </h4>
          <p className="text-xs text-sage-400 font-sans max-w-md mx-auto">
            Once sandbox verification confirms zero regressions and static code cleanliness, CodeSage will automatically construct an atomic branch and deploy a GitHub pull request.
          </p>
        </div>
      )}
    </div>
  );
};
