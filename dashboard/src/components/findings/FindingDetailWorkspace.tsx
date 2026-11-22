import React, { useState } from "react";
import {
  ArrowLeft,
  Github,
  Check,
  Zap,
  Target,
  Package,
  Code2,
  Sparkles,
  GitPullRequest,
  Copy,
  AlertCircle,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CodeSnippetViewer } from "@/components/findings/CodeSnippetViewer";
import { FindingLifecycleStepper } from "@/components/findings/FindingLifecycleStepper";
import { Finding, FindingArtifacts, Severity } from "@/types";
import { getFindingId, getFindingTitle, getFindingRule } from "@/components/findings/FindingList";
import { getSimplifiedSecuritySummary } from "@/utils/securityDetails";
import { computeLineDiff, DiffLine, DiffResult } from "@/utils/diff";
import { api } from "@/api/client";
import { clsx } from "clsx";

interface FindingDetailWorkspaceProps {
  finding: Finding;
  artifacts: FindingArtifacts | null;
  loadingArtifacts?: boolean;
  scanId?: string;
  repoUrl?: string;
  scanStatus?: string;
  onPrCreated?: (prInfo: {
    pr_number: number;
    pr_url: string;
    branch: string;
    base_branch: string;
  }) => void;
  onClose?: () => void;
  onReviewDecision?: (decision: "approved" | "rejected", notes?: string) => Promise<void>;
  onMarkResolved?: (findingId: string) => void;
  className?: string;
}

export type SubNavTab = "overview" | "code" | "remediation" | "diff";

export const FindingDetailWorkspace: React.FC<FindingDetailWorkspaceProps> = ({
  finding,
  artifacts,
  loadingArtifacts: _loadingArtifacts = false,
  scanId,
  repoUrl,
  scanStatus,
  onPrCreated,
  onClose,
  onReviewDecision: _onReviewDecision,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<SubNavTab>("overview");
  const [isCreatingPr, setIsCreatingPr] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [prSuccess, setPrSuccess] = useState<{
    pr_number: number;
    pr_url: string;
    branch: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const fid = getFindingId(finding);
  const formattedFid = finding.display_id || (fid.startsWith("F-") ? fid : `F-${fid.slice(0, 4).toUpperCase()}`);
  const title = getFindingTitle(finding);
  const rule = getFindingRule(finding);
  const sev = (finding.severity?.toLowerCase() || "medium") as Severity;
  const filePath = finding.file_path || "app.py";
  const targetLine = finding.line_number || 140;

  // Derive display repository name from repoUrl, finding branch, or file_path
  const displayRepo = React.useMemo(() => {
    if (repoUrl) {
      return repoUrl
        .replace(/^https?:\/\/github\.com\//i, "")
        .replace(/\.git$/i, "");
    }
    if (finding.branch && finding.branch.includes("/")) {
      return finding.branch.split("/")[0];
    }
    if (finding.file_path && finding.file_path.includes("/")) {
      const parts = finding.file_path.split("/");
      if (parts.length > 2) return `${parts[0]}/${parts[1]}`;
    }
    return "Repository";
  }, [repoUrl, finding.branch, finding.file_path]);

  // Derive plain-English security summary
  const summary = getSimplifiedSecuritySummary(finding, artifacts?.triage);

  // Status computation and PR resolution
  const effectivePrUrl =
    finding.pr_url ||
    prSuccess?.pr_url ||
    artifacts?.pr?.pr_url ||
    null;
  const effectivePrNumber =
    finding.pr_number ||
    prSuccess?.pr_number ||
    artifacts?.pr?.pr_number ||
    null;
  const effectiveBranch =
    finding.branch ||
    prSuccess?.branch ||
    artifacts?.pr?.branch ||
    null;

  const hasPr = Boolean(effectivePrUrl || finding.status === "verified_pr_opened");
  const isVerificationClean = Boolean(
    artifacts?.verification?.passed ||
    (artifacts?.verification?.scan_clean &&
      (artifacts?.verification?.tests_available === false ||
       artifacts?.verification?.tests_status === "not_available" ||
       artifacts?.verification?.failure_reason?.includes("no test suite found")))
  );
  const isVerified = Boolean(
    hasPr ||
    finding.status === "verified_pr_skipped" ||
    isVerificationClean
  );

  // Real or AST-extracted code snippets
  const patch = artifacts?.patch;
  const originalSnippet =
    patch?.original_code ||
    finding.code_snippet ||
    "";
  const patchedSnippet =
    patch?.patched_code ||
    "";

  // Compute multi-line line diff between original and patched code
  const diffResult = React.useMemo<DiffResult>(() => {
    if (!originalSnippet && !patchedSnippet) {
      return { lines: [], additions: 0, deletions: 0, hasChanges: false };
    }
    if (patchedSnippet) {
      return computeLineDiff(originalSnippet, patchedSnippet, Math.max(1, targetLine - 2));
    }
    const lines: DiffLine[] = originalSnippet.split("\n").map((text, idx) => ({
      type: "context",
      oldLineNumber: Math.max(1, targetLine - 2) + idx,
      newLineNumber: Math.max(1, targetLine - 2) + idx,
      text,
    }));
    return {
      lines,
      additions: 0,
      deletions: 0,
      hasChanges: false,
    };
  }, [originalSnippet, patchedSnippet, targetLine]);

  const diffLines = diffResult.lines;

  // Handle Create Pull Request Action
  const handleCreatePr = async () => {
    if (effectivePrUrl) {
      window.open(effectivePrUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (!scanId) {
      setPrError("No active scan ID is available to create a Pull Request.");
      return;
    }

    try {
      setIsCreatingPr(true);
      setPrError(null);
      const res = await api.createPullRequest(scanId, fid);
      setPrSuccess({
        pr_number: res.pr_number,
        pr_url: res.pr_url,
        branch: res.branch,
      });
      if (onPrCreated) {
        onPrCreated(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create Pull Request on GitHub";
      setPrError(msg);
    } finally {
      setIsCreatingPr(false);
    }
  };

  const handleCopy = (text: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className={clsx("space-y-6 max-w-7xl mx-auto select-none", className)}>
      {/* 1. TOP BREADCRUMB & HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#292D2A]">
        {/* Left: Breadcrumb */}
        <div className="flex items-center gap-2.5 font-mono text-sm">
          {onClose ? (
            <button
              onClick={onClose}
              className="text-[#A5AAA6] hover:text-[#F4F5F4] flex items-center gap-1.5 transition-colors cursor-pointer group"
            >
              <ArrowLeft className="w-4 h-4 text-[#A5AAA6] group-hover:text-[#8CFF8C] transition-colors" />
              <span>Findings</span>
            </button>
          ) : (
            <span className="text-[#A5AAA6] flex items-center gap-1.5">
              <span>Findings</span>
            </span>
          )}
          <span className="text-[#666C68] font-mono">&gt;</span>
          <span className="text-[#F4F5F4] font-bold">{formattedFid}</span>
        </div>

        {/* Right: Repo badge & Scan status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#151716] border border-[#292D2A] text-xs font-mono text-[#F4F5F4]">
            <Github className="w-3.5 h-3.5 text-[#A5AAA6]" />
            <span className="font-semibold text-[#8CFF8C]">{displayRepo}</span>
          </div>

          <div
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono",
              scanStatus === "complete" || scanStatus === "completed"
                ? "bg-[#151716] border-[#292D2A] text-[#8CFF8C]"
                : scanStatus === "running"
                ? "bg-[#16351F] border-[#8CFF8C]/30 text-[#8CFF8C] animate-pulse"
                : "bg-[#151716] border-[#292D2A] text-[#A5AAA6]"
            )}
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>
              {scanStatus === "complete" || scanStatus === "completed"
                ? "Scan Completed"
                : scanStatus === "running"
                ? "Scanning"
                : "Scan Complete"}
            </span>
          </div>
        </div>
      </div>

      {/* 2. HERO HEADER (Severity Badge, Title, CWE/Location, One-sentence Risk Summary) */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Severity Badge */}
          <span
            className={clsx(
              "px-3 py-1 rounded-full text-xs font-sans font-bold uppercase tracking-wider border",
              sev === "critical"
                ? "bg-[#FF3366]/20 border-[#FF3366]/40 text-[#FF5577]"
                : sev === "high"
                ? "bg-[#FF5555]/20 border-[#FF5555]/40 text-[#FF5555]"
                : sev === "medium"
                ? "bg-[#FFB84D]/20 border-[#FFB84D]/40 text-[#FFB84D]"
                : "bg-[#A5AAA6]/20 border-[#A5AAA6]/40 text-[#A5AAA6]"
            )}
          >
            {sev.charAt(0).toUpperCase() + sev.slice(1)}
          </span>

          {/* Finding Title */}
          <h1 className="text-2xl sm:text-3xl font-sans font-bold text-[#F4F5F4] tracking-tight">
            {formattedFid}: {title}
          </h1>
        </div>

        {/* Location & CWE */}
        <div className="text-xs font-mono text-[#A5AAA6] flex items-center gap-2">
          <span className="text-[#8CFF8C] font-semibold">{rule}</span>
          <span className="text-[#666C68]">•</span>
          <span>
            {filePath}:{targetLine}
          </span>
        </div>

        {/* Plain-English one-sentence risk summary */}
        <p className="text-sm text-[#A5AAA6] font-sans leading-relaxed max-w-4xl pt-0.5">
          {summary.riskSummary}
        </p>
      </div>

      {/* 3. 5-STAGE HORIZONTAL PROGRESS INDICATOR */}
      <FindingLifecycleStepper
        status={hasPr ? "verified_pr_opened" : isVerified ? "verified_pr_skipped" : finding.status}
        hasPr={hasPr}
      />

      {/* 4. THREE-COLUMN WORKFLOW LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMN 1: LEFT VERTICAL SUB-NAV (col-span-12 lg:col-span-2) */}
        <div className="lg:col-span-2 space-y-2 font-sans">
          {/* Overview Tab */}
          <button
            onClick={() => setActiveTab("overview")}
            className={clsx(
              "w-full text-left px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all cursor-pointer",
              activeTab === "overview"
                ? "bg-[#8CFF8C] text-[#080909] shadow-sm font-bold"
                : "text-[#A5AAA6] hover:text-[#F4F5F4] hover:bg-[#151716]"
            )}
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Overview</span>
          </button>

          {/* Vulnerable Code Tab */}
          <button
            onClick={() => setActiveTab("code")}
            className={clsx(
              "w-full text-left px-4 py-2.5 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer",
              activeTab === "code"
                ? "bg-[#8CFF8C] text-[#080909] shadow-sm font-bold font-sans"
                : "text-[#A5AAA6] hover:text-[#F4F5F4] hover:bg-[#151716]"
            )}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Vulnerable Code</span>
          </button>

          {/* Proposed Fix Tab */}
          <button
            onClick={() => setActiveTab("remediation")}
            className={clsx(
              "w-full text-left px-4 py-2.5 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer",
              activeTab === "remediation"
                ? "bg-[#8CFF8C] text-[#080909] shadow-sm font-bold font-sans"
                : "text-[#A5AAA6] hover:text-[#F4F5F4] hover:bg-[#151716]"
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Proposed Fix</span>
          </button>

          {/* Changes (Diff) Tab */}
          <button
            onClick={() => setActiveTab("diff")}
            className={clsx(
              "w-full text-left px-4 py-2.5 rounded-xl text-xs font-mono flex items-center gap-2.5 transition-all cursor-pointer",
              activeTab === "diff"
                ? "bg-[#8CFF8C] text-[#080909] shadow-sm font-bold font-sans"
                : "text-[#A5AAA6] hover:text-[#F4F5F4] hover:bg-[#151716]"
            )}
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>Changes (Diff)</span>
          </button>
        </div>

        {/* COLUMN 2: MIDDLE CONTENT (col-span-12 lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          {activeTab === "overview" && (
            <>
              {/* SUMMARY CARD */}
              <div className="surface-card rounded-2xl p-6 border border-[#292D2A] bg-[#101211] space-y-4">
                <h2 className="text-base font-sans font-bold text-[#F4F5F4]">
                  Summary
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
                  {/* Risk Column */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold font-sans text-[#F4F5F4]">
                      <Zap className="w-4 h-4 text-[#8CFF8C]" />
                      <span>Risk</span>
                    </div>
                    <p className="text-xs text-[#A5AAA6] font-sans leading-relaxed">
                      {summary.risk}
                    </p>
                  </div>

                  {/* How to Exploit Column */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold font-sans text-[#F4F5F4]">
                      <Target className="w-4 h-4 text-[#8CFF8C]" />
                      <span>How to Exploit</span>
                    </div>
                    <p className="text-xs text-[#A5AAA6] font-sans leading-relaxed">
                      {summary.exploit}
                    </p>
                  </div>

                  {/* Impact Column */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold font-sans text-[#F4F5F4]">
                      <Package className="w-4 h-4 text-[#8CFF8C]" />
                      <span>Impact</span>
                    </div>
                    <p className="text-xs text-[#A5AAA6] font-sans leading-relaxed">
                      {summary.impact}
                    </p>
                  </div>
                </div>
              </div>

              {/* ML CLASSIFICATION CARD */}
              {finding.ml_prediction && (
                <div className="surface-card rounded-2xl p-6 border border-[#292D2A] bg-[#101211] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-[#8CFF8C]" />
                      <h2 className="text-base font-sans font-bold text-[#F4F5F4]">
                        ML Classification
                      </h2>
                    </div>
                    {finding.ml_prediction.uncertain && (
                      <span className="font-mono text-[11px] text-[#FFB84D] bg-[#FFB84D]/10 border border-[#FFB84D]/30 px-2 py-0.5 rounded">
                        Uncertain / Low Confidence
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
                    {/* Category */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#666C68]">
                        Category
                      </span>
                      <p className="text-sm font-sans font-bold text-[#F4F5F4]">
                        {finding.ml_prediction.category}
                      </p>
                    </div>

                    {/* Confidence */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#666C68]">
                        Confidence
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-[#8CFF8C]">
                          {Math.round(finding.ml_prediction.confidence * 100)}%
                        </span>
                        <div className="flex-1 max-w-[80px] h-1.5 bg-[#1F2220] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#8CFF8C] rounded-full"
                            style={{ width: `${Math.round(finding.ml_prediction.confidence * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Risk Score */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#666C68]">
                        Risk Score
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={clsx(
                            "text-sm font-mono font-bold",
                            finding.ml_prediction.risk_score >= 0.7
                              ? "text-[#FF5577]"
                              : finding.ml_prediction.risk_score >= 0.4
                              ? "text-[#FFB84D]"
                              : "text-[#8CFF8C]"
                          )}
                        >
                          {finding.ml_prediction.risk_score.toFixed(2)}
                        </span>
                        <span className="text-[11px] font-mono text-[#666C68]">
                          {finding.ml_prediction.risk_score >= 0.7
                            ? "High"
                            : finding.ml_prediction.risk_score >= 0.4
                            ? "Moderate"
                            : "Low"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CODE CHANGE CARD */}
              <div className="surface-card rounded-2xl p-6 border border-[#292D2A] bg-[#101211] space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-sans font-bold text-[#F4F5F4]">
                    Code Change
                  </h2>
                  <span className="font-mono text-xs text-[#A5AAA6] px-2.5 py-1 rounded-md bg-[#151716] border border-[#292D2A]">
                    1 file • +{diffResult.additions} -{diffResult.deletions}
                  </span>
                </div>

                <div className="text-[11px] font-mono text-[#666C68]">
                  {filePath}
                </div>

                {/* Clean Code Diff Box */}
                <div className="rounded-xl overflow-hidden border border-[#1F2220] bg-[#080909] font-mono text-xs">
                  <div className="divide-y divide-[#1F2220]/40">
                    {diffLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={clsx(
                          "flex items-center px-4 py-2 select-text",
                          line.type === "removed"
                            ? "bg-[#FF5555]/10 border-l-2 border-l-[#FF5555] text-[#FF8888]"
                            : line.type === "added"
                            ? "bg-[#8CFF8C]/10 border-l-2 border-l-[#8CFF8C] text-[#8CFF8C]"
                            : "text-[#A5AAA6]"
                        )}
                      >
                        {/* Line Number */}
                        <span className="w-10 text-right pr-4 text-[#666C68] text-[11px] select-none">
                          {line.oldLineNumber || line.newLineNumber}
                        </span>

                        {/* Diff Indicator */}
                        <span className="w-4 select-none font-bold">
                          {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
                        </span>

                        {/* Code Content */}
                        <span className="flex-1 font-mono">{line.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "code" && (
            <div className="surface-card rounded-2xl p-6 border border-[#292D2A] bg-[#101211] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-sans font-bold text-[#F4F5F4]">
                    Vulnerable Source Code
                  </h2>
                  <p className="text-xs text-[#666C68] font-mono">{filePath}:{targetLine}</p>
                </div>
                <button
                  onClick={() => handleCopy(originalSnippet)}
                  className="p-1.5 rounded-lg border border-[#292D2A] text-[#A5AAA6] hover:text-[#8CFF8C] transition-colors cursor-pointer"
                  title="Copy Code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-[#8CFF8C]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <CodeSnippetViewer
                code={originalSnippet}
                targetLine={targetLine}
                filePath={filePath}
              />
            </div>
          )}

          {activeTab === "remediation" && (
            <div className="surface-card rounded-2xl p-6 border border-[#292D2A] bg-[#101211] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-sans font-bold text-[#F4F5F4]">
                    Autonomous AI Patch
                  </h2>
                  <p className="text-xs text-[#8CFF8C] font-mono">AST Verified Safe</p>
                </div>
                <button
                  onClick={() => handleCopy(patchedSnippet)}
                  className="p-1.5 rounded-lg border border-[#292D2A] text-[#A5AAA6] hover:text-[#8CFF8C] transition-colors cursor-pointer"
                  title="Copy Code"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-[#8CFF8C]" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <CodeSnippetViewer
                code={patchedSnippet}
                targetLine={targetLine}
                filePath={filePath}
              />
            </div>
          )}

          {activeTab === "diff" && (
            <div className="surface-card rounded-2xl p-6 border border-[#292D2A] bg-[#101211] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-sans font-bold text-[#F4F5F4]">
                  Full Code Diff
                </h2>
                <span className="font-mono text-xs text-[#8CFF8C] bg-[#16351F] border border-[#8CFF8C]/30 px-2 py-0.5 rounded">
                  Patch Verified
                </span>
              </div>

              <div className="rounded-xl overflow-hidden border border-[#1F2220] bg-[#080909] font-mono text-xs">
                <div className="divide-y divide-[#1F2220]/40">
                  {diffLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        "flex items-center px-4 py-2.5 select-text",
                        line.type === "removed"
                          ? "bg-[#FF5555]/10 border-l-2 border-l-[#FF5555] text-[#FF8888]"
                          : line.type === "added"
                          ? "bg-[#8CFF8C]/10 border-l-2 border-l-[#8CFF8C] text-[#8CFF8C]"
                          : "text-[#A5AAA6]"
                      )}
                    >
                      <span className="w-10 text-right pr-4 text-[#666C68] text-[11px] select-none">
                        {line.oldLineNumber || line.newLineNumber}
                      </span>
                      <span className="w-4 select-none font-bold">
                        {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
                      </span>
                      <span className="flex-1 font-mono">{line.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* COLUMN 3: RIGHT NEXT STEP ACTION PANEL (col-span-12 lg:col-span-3) */}
        <div className="lg:col-span-3">
          <div className="surface-card rounded-2xl p-6 border border-[#292D2A] bg-[#101211] space-y-5">
            <div>
              <h2 className="text-base font-sans font-bold text-[#F4F5F4]">
                Next Step
              </h2>
              <p className="text-xs text-[#A5AAA6] font-sans mt-1 leading-relaxed">
                {hasPr
                  ? "Pull Request created and ready for code review on GitHub."
                  : isVerified
                  ? "Create a Pull Request with the verified fix."
                  : "Fix verification in progress."}
              </p>
            </div>

            {/* Error Message if PR creation failed */}
            {prError && (
              <div className="rounded-xl p-3 bg-[#FF5555]/10 border border-[#FF5555]/30 space-y-2 text-xs">
                <div className="flex items-start gap-2 text-[#FF8888]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-snug">{prError}</span>
                </div>
                <button
                  onClick={handleCreatePr}
                  disabled={isCreatingPr}
                  className="text-[11px] font-mono font-semibold text-[#8CFF8C] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={clsx("w-3 h-3", isCreatingPr && "animate-spin")} />
                  <span>Retry PR Creation</span>
                </button>
              </div>
            )}

            {/* Primary Action Button */}
            {effectivePrUrl ? (
              <div className="space-y-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => window.open(effectivePrUrl, "_blank", "noopener,noreferrer")}
                  icon={<Github className="w-4 h-4 fill-current" />}
                  className="w-full font-sans font-bold text-xs py-3.5 bg-[#8CFF8C] text-[#080909] hover:bg-[#52D96B] transition-colors cursor-pointer"
                >
                  <span>Open GitHub PR →</span>
                </Button>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#A5AAA6] px-1">
                  <span className="text-[#8CFF8C] font-semibold">
                    {effectivePrNumber ? `Pull Request #${effectivePrNumber}` : "Pull Request Created"}
                  </span>
                  {effectiveBranch && (
                    <span className="truncate max-w-[150px] text-[#666C68]" title={effectiveBranch}>
                      {effectiveBranch}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleCreatePr}
                loading={isCreatingPr}
                disabled={!isVerified && !patch}
                icon={<Github className="w-4 h-4 fill-current" />}
                className="w-full font-sans font-bold text-xs py-3.5 bg-[#8CFF8C] text-[#080909] hover:bg-[#52D96B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>{isCreatingPr ? "Creating..." : "Create Pull Request"}</span>
              </Button>
            )}

            {/* Checklist Box */}
            <div className="rounded-xl p-4 bg-[#080909] border border-[#1F2220] space-y-4 font-sans text-xs">
              {/* Item 1: Fix Generated */}
              <div className="flex items-start gap-2.5">
                <div
                  className={clsx(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    patch ? "bg-[#8CFF8C] text-[#080909]" : "border border-[#292D2A] text-[#666C68]"
                  )}
                >
                  {patch ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <span className="w-2 h-2 rounded-full bg-[#292D2A]" />}
                </div>
                <div>
                  <div className={clsx("font-semibold", patch ? "text-[#F4F5F4]" : "text-[#A5AAA6]")}>
                    Fix Generated
                  </div>
                  {patch && <div className="text-[11px] text-[#A5AAA6]">AST clean replacement</div>}
                </div>
              </div>

              {/* Item 2: Fix Verified */}
              <div className="flex items-start gap-2.5">
                <div
                  className={clsx(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    isVerified ? "bg-[#8CFF8C] text-[#080909]" : "border border-[#292D2A] text-[#666C68]"
                  )}
                >
                  {isVerified ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <span className="w-2 h-2 rounded-full bg-[#292D2A]" />}
                </div>
                <div>
                  <div className={clsx("font-semibold", isVerified ? "text-[#F4F5F4]" : "text-[#A5AAA6]")}>
                    Fix Verified
                  </div>
                  <div className="text-[11px] text-[#A5AAA6]">
                    {isVerified ? "No longer vulnerable" : "Pending verification"}
                  </div>
                </div>
              </div>

              {/* Item 3: Pull Request */}
              <div className="flex items-start gap-2.5">
                <div
                  className={clsx(
                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    hasPr
                      ? "bg-[#8CFF8C] text-[#080909]"
                      : "border border-[#292D2A] text-[#666C68]"
                  )}
                >
                  {hasPr ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <span className="w-2 h-2 rounded-full bg-[#292D2A]" />}
                </div>
                <div>
                  <div
                    className={clsx(
                      "font-semibold",
                      hasPr ? "text-[#F4F5F4]" : "text-[#A5AAA6]"
                    )}
                  >
                    Pull Request
                  </div>
                  <div className="text-[11px] text-[#666C68]">
                    {hasPr ? "Ready for review on GitHub" : "Create and review the PR on GitHub"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
